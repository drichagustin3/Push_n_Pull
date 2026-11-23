const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Product catalog: isolated PostgreSQL role/filter/current-price acceptance', {
  skip: process.env.PRODUCTS_INTEGRATION !== '1' ? 'Requires fresh disposable Unix-socket hopedb_product_test.' : false,
}, async t => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const pool = new Pool({ query_timeout: 5000, connectionTimeoutMillis: 5000 }); let server, app;
  t.after(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await app?.locals.closeAuthStore(); await pool.end(); });
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  for (const table of ['product','pricehist','app_user']) assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password, 12), actors = {};
  for (const role of ['admin','superadmin','user','price','none']) {
    actors[role] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Product','Fixture',$1,$2,$3,'active') RETURNING user_id,email", [`product-${role}@example.test`, hash, ['admin','superadmin'].includes(role) ? role : 'user'])).rows[0];
    if (role === 'user' || role === 'price') await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)', [actors[role].user_id, role === 'user' ? 'product.edit' : 'price.add']);
  }
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config }); server = createServer(app); server.listen(0,'127.0.0.1'); await once(server,'listening'); const cookies = {};
  const request = (url, who = 'admin', options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { redirect: 'manual', ...options, headers: { Origin: config.origin, Accept: 'application/json', ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...options.headers } });
  for (const who of Object.keys(actors)) {
    const res = await request('/login', who, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email: actors[who].email, password }) }); assert.equal(res.status, 200); cookies[who] = res.headers.getSetCookie()[0].split(';')[0];
  }
  const list = async (query = '', who = 'admin') => { const res = await request('/api/products' + query, who); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'),'no-store'); return res.json(); };
  await t.test('anonymous/no-module access is denied; genuinely empty list succeeds with zero privileged counts', async () => {
    assert.equal((await request('/api/products','anonymous')).status,401); assert.equal((await request('/api/products','none')).status,403); assert.equal((await request('/workspace/product','none')).status,403);
    const data = await list(); assert.deepEqual(data.products,[]); assert.deepEqual(data.counts,{active:0,inactive:0,all:0});
  });
  await pool.query(`INSERT INTO product(prodcode,description,unit,is_deleted,stamp) VALUES
    ('P00001','Alpha Pump','pc',false,'fixture A'),('P00002','Future Only','ea',false,'fixture B'),
    ('P00003','No Price','mtr',false,NULL),('P00004','Inactive Pump','pc',true,'fixture hidden'),
    ('P00005','Literal %_\\','pc',false,'fixture literal'),('P00006','Precision Product','ltr',false,'fixture money'),
    ('P00007','Deleted Price Only','pkg',false,NULL);
    INSERT INTO pricehist(prodcode,effdate,unitprice,is_deleted) VALUES
    ('P00001',CURRENT_DATE-30,1.23,false),('P00001',CURRENT_DATE,2.34,false),
    ('P00001',CURRENT_DATE+1,99.99,false),('P00001',CURRENT_DATE-1,88.88,true),
    ('P00002',CURRENT_DATE+1,5.67,false),('P00004',CURRENT_DATE-10,3.21,false),
    ('P00005',CURRENT_DATE-20,0.10,false),('P00006',CURRENT_DATE,99999999.99,false),
    ('P00007',CURRENT_DATE-5,7.89,true);`);
  await t.test('User requests for inactive/all are SQL-constrained to active products without status/stamp/counts', async () => {
    for (const status of ['active','inactive','all']) {
      const data = await list('?status=' + status,'user'); assert.equal(data.filter.status,'active'); assert.equal(data.products.length,6); assert.equal(Object.hasOwn(data,'counts'),false);
      for (const p of data.products) { assert.notEqual(p.prodcode,'P00004'); assert.deepEqual(Object.keys(p).sort(),['currentPrice','description','prodcode','unit']); }
    }
    assert.deepEqual((await list('?status=all&search=Inactive','user')).products,[]);
    assert.equal((await request('/api/products?status=all&role=superadmin','user')).status,400);
  });
  await t.test('Admin/Superadmin filters, stable ordering and search-scoped counts are correct', async () => {
    for (const role of ['admin','superadmin']) {
      assert.equal((await list('',role)).products.length,6); const inactive=await list('?status=inactive',role); assert.equal(inactive.products.length,1); assert.equal(inactive.products[0].prodcode,'P00004'); assert.equal(inactive.products[0].stamp,'fixture hidden');
      const all=await list('?status=all',role); assert.equal(all.products.length,7); assert.deepEqual(all.counts,{active:6,inactive:1,all:7}); assert.deepEqual(all.products.map(p=>p.prodcode),all.products.map(p=>p.prodcode).sort());
      const combined=await list('?search=pump&status=inactive',role); assert.equal(combined.products.length,1); assert.deepEqual(combined.counts,{active:1,inactive:1,all:2});
    }
  });
  await t.test('code/description search is case-insensitive, injection-like input and wildcard text remain literal', async () => {
    for (const term of ['p00001','aLpHa']) assert.deepEqual((await list('?search='+term)).products.map(p=>p.prodcode),['P00001']);
    for (const term of ['%','_','\\']) assert.deepEqual((await list('?search='+encodeURIComponent(term))).products.map(p=>p.prodcode),['P00005']);
    for (const term of ['nonexistent',"' OR 1=1 --"]) assert.deepEqual((await list('?status=all&search='+encodeURIComponent(term))).products,[]);
    assert.equal((await list('?search=%20%20')).products.length,6);
  });
  await t.test('currentPrice selects latest active eligible date, excludes future/deleted rows, and is independent of product status', async () => {
    const map=Object.fromEntries((await list('?status=all')).products.map(p=>[p.prodcode,p.currentPrice]));
    assert.equal(map.P00001,'2.34'); assert.equal(map.P00002,null); assert.equal(map.P00003,null); assert.equal(map.P00004,'3.21'); assert.equal(map.P00005,'0.10'); assert.equal(map.P00007,null);
    assert.equal(map.P00006,'99999999.99'); assert.equal(typeof map.P00006,'string');
  });
  await t.test('a historical eligible price remains available when newer entries are deleted or future-dated', async () => {
    await pool.query("UPDATE pricehist SET is_deleted=true WHERE prodcode='P00001' AND effdate=CURRENT_DATE");
    assert.equal((await list('?search=P00001')).products[0].currentPrice,'1.23');
    await pool.query("UPDATE pricehist SET is_deleted=false WHERE prodcode='P00001' AND effdate=CURRENT_DATE");
  });
  await t.test('nullable latest amount is unavailable rather than fabricated zero or an older fallback price', async () => {
    // The tracked legacy schema allows NULL unitprice; this is missing data, not
    // a valid monetary amount. Preserve the exact latest-row selection contract.
    await pool.query("UPDATE pricehist SET unitprice=NULL WHERE prodcode='P00001' AND effdate=CURRENT_DATE");
    assert.equal((await list('?search=P00001')).products[0].currentPrice,null);
    await pool.query("UPDATE pricehist SET unitprice=2.34 WHERE prodcode='P00001' AND effdate=CURRENT_DATE");
  });
  await t.test('invalid queries fail; price-only module grants work; page/assets/health integrate without mutation endpoints', async () => {
    for (const query of ['?status=bad','?search=a&search=b','?status=all&status=inactive','?search[x]=a','?search='+'x'.repeat(101)]) assert.equal((await request('/api/products'+query)).status,400);
    const price=await list('','price'); assert.equal(price.capabilities.prices,true); assert.equal(price.capabilities.edit,false);
    const page=await request('/workspace/product','user'); assert.equal(page.status,200); assert.match(await page.text(),/productSearch/);
    for (const file of ['/products.js','/products.css','/api/health']) assert.equal((await request(file)).status,200);
    for (const method of ['POST','PUT','DELETE']) assert.equal((await request('/api/products','admin',{method})).status,404);
  });
  await t.test('revocation and blocked actors fail closed on later requests', async () => {
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1',[actors.user.user_id]); assert.equal((await request('/api/products','user')).status,403);
    await pool.query('UPDATE user_permission SET is_deleted=false WHERE user_id=$1',[actors.user.user_id]); assert.equal((await request('/api/products','user')).status,200);
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1',[actors.user.user_id]); assert.equal((await request('/api/products','user')).status,403);
    // Catalogue eligibility is also independently covered by existing RBAC tests;
    // disable the grant for the price-only User to verify exact source is respected.
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1',[actors.price.user_id]); assert.equal((await request('/api/products','price')).status,403);
  });
  await t.test('listing leaves product/price-history rows unchanged', async () => {
    const before=JSON.stringify((await pool.query('SELECT prodcode,description,unit,is_deleted,stamp FROM product ORDER BY prodcode')).rows);
    const prices=JSON.stringify((await pool.query('SELECT * FROM pricehist ORDER BY prodcode,effdate')).rows);
    await list('?status=all'); await list('?status=inactive');
    assert.equal(JSON.stringify((await pool.query('SELECT prodcode,description,unit,is_deleted,stamp FROM product ORDER BY prodcode')).rows),before); assert.equal(JSON.stringify((await pool.query('SELECT * FROM pricehist ORDER BY prodcode,effdate')).rows),prices);
  });
});
