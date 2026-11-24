const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Customer list on isolated PostgreSQL with real login, sessions and RBAC', {
  skip: process.env.CUSTOMERS_INTEGRATION !== '1' ? 'Requires a fresh disposable Unix-socket hopedb_customer_test.' : false,
}, async (t) => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_customer_test');
  const pool = new Pool({ query_timeout: 5000, connectionTimeoutMillis: 5000 });
  t.after(() => pool.end());
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer')).rows[0].n, 0, 'Never run against existing customer data');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_user')).rows[0].n, 0, 'Only a fresh disposable database is allowed');
  const password = 'Aa1' + randomBytes(16).toString('hex');
  const hash = await bcrypt.hash(password, 12);
  const accounts = {};
  for (const role of ['user', 'admin', 'superadmin']) {
    accounts[role] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Customer','Fixture',$1,$2,$3,'active') RETURNING user_id,email", [`customers-${role}@example.test`, hash, role])).rows[0];
  }
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const app = createApp({ pool, authConfig: config });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); await app.locals.closeAuthStore(); });
  const request = (url, cookie, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, {
    redirect: 'manual', ...options, headers: { Accept: 'application/json', Origin: config.origin, ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
  });
  const cookies = {};
  for (const role of Object.keys(accounts)) {
    const login = await request('/login', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[role].email, password }) });
    assert.equal(login.status, 200); cookies[role] = login.headers.getSetCookie()[0].split(';')[0];
  }
  const get = async (query = '', role = 'admin') => {
    const response = await request('/api/customers' + query, cookies[role]);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.json();
  };
  await t.test('anonymous and no-rights User denied; genuinely empty table has valid zero counts', async () => {
    assert.equal((await request('/api/customers')).status, 401);
    assert.equal((await request('/api/customers', cookies.user)).status, 403);
    const result = await get(); assert.deepEqual(result.customers, []); assert.deepEqual(result.counts, { active: 0, inactive: 0, all: 0 });
    await pool.query("INSERT INTO user_permission(user_id,right_code) VALUES($1,'customer.edit')", [accounts.user.user_id]);
  });
  await pool.query(`INSERT INTO customer(custno,custname,address,payterm,is_deleted,stamp) VALUES
    ('T0002','Beta','Harbor Road','COD',false,'fixture B'),
    ('T0001','Alpha','Metro City','30D',false,'fixture A'),
    ('T0003','Alpha Archived','Metro City','45D',true,'fixture hidden'),
    ('T0004','Literal %_\\','Backslash Lane','COD',false,NULL)`);
  await t.test('Admin and Superadmin status filters and search-scoped counts share correct rows', async () => {
    for (const role of ['admin', 'superadmin']) {
      assert.deepEqual((await get('', role)).customers.map((row) => row.custno), ['T0001', 'T0002', 'T0004']);
      const inactive = await get('?status=inactive', role);
      assert.deepEqual(inactive.customers.map((row) => row.custno), ['T0003']); assert.equal(inactive.customers[0].status, 'inactive'); assert.equal(inactive.customers[0].stamp, 'fixture hidden');
      const all = await get('?status=all', role); assert.equal(all.customers.length, 4); assert.deepEqual(all.counts, { active: 3, inactive: 1, all: 4 });
      const combined = await get('?search=alpha&status=inactive', role);
      assert.deepEqual(combined.customers.map((row) => row.custno), ['T0003']); assert.deepEqual(combined.counts, { active: 1, inactive: 1, all: 2 });
    }
  });
  await t.test('User ignores inactive/all, cannot recover deleted rows or metadata/counts', async () => {
    for (const status of ['active', 'inactive', 'all']) {
      const result = await get('?status=' + status, 'user');
      assert.equal(result.filter.status, 'active'); assert.equal(Object.hasOwn(result, 'counts'), false);
      assert.deepEqual(result.customers.map((row) => row.custno), ['T0001', 'T0002', 'T0004']);
      for (const row of result.customers) assert.deepEqual(Object.keys(row).sort(), ['address', 'custname', 'custno', 'payterm']);
    }
    assert.deepEqual((await get('?search=Archived&status=all', 'user')).customers, []);
    assert.equal((await request('/api/customers?role=superadmin&status=all', cookies.user)).status, 400);
  });
  await t.test('search matches number/name/address case-insensitively; wildcards and SQL payloads are literal', async () => {
    for (const search of ['t0002', 'bEtA', 'harbor']) assert.deepEqual((await get('?search=' + search)).customers.map((row) => row.custno), ['T0002']);
    for (const search of ['%', '_', '\\']) assert.deepEqual((await get('?search=' + encodeURIComponent(search))).customers.map((row) => row.custno), ['T0004']);
    for (const search of ['nonexistent', "' OR 1=1 --"]) assert.deepEqual((await get('?search=' + encodeURIComponent(search) + '&status=all')).customers, []);
    assert.equal((await get('?search=%20%20&status=all')).customers.length, 4);
  });
  await t.test('invalid query parameters fail and assets/page integrate with existing workspace', async () => {
    for (const query of ['?status=unknown','?status=all&status=inactive','?search=a&search=b','?search[x]=a','?search=' + 'a'.repeat(101)]) assert.equal((await request('/api/customers' + query, cookies.admin)).status, 400);
    const page = await request('/workspace/customer', cookies.user); assert.equal(page.status, 200); assert.match(await page.text(), /customerTable/);
    for (const file of ['/customers.js', '/customers.css']) assert.equal((await request(file)).status, 200);
    assert.equal((await request('/api/health')).status, 200);
  });
  await t.test('permission revocation and blocking affect subsequent protected requests', async () => {
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1', [accounts.user.user_id]);
    assert.equal((await request('/api/customers', cookies.user)).status, 403);
    await pool.query('UPDATE user_permission SET is_deleted=false WHERE user_id=$1', [accounts.user.user_id]);
    assert.equal((await request('/api/customers', cookies.user)).status, 200);
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1', [accounts.user.user_id]);
    assert.equal((await request('/api/customers', cookies.user)).status, 403);
    assert.equal((await request('/api/customers', cookies.admin)).status, 200);
  });
  await t.test('reads preserve all customer data and application never exposes new mutations', async () => {
    const before = JSON.stringify((await pool.query('SELECT * FROM customer ORDER BY custno')).rows);
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const result = await request('/api/customers', cookies.admin, { method }); assert.equal(result.status, 404);
    }
    assert.equal(JSON.stringify((await pool.query('SELECT * FROM customer ORDER BY custno')).rows), before);
  });
});
