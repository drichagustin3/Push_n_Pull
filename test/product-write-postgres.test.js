const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Product writes: legacy fail-closed and proposed Issue #76 contract on disposable PostgreSQL', {
  skip: process.env.PRODUCT_WRITE_INTEGRATION !== '1' ? 'Requires run_product_writes.py disposable cluster.' : false,
}, async t => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const pool = new Pool({ query_timeout: 5000 }); let server, app;
  t.after(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await app?.locals.closeAuthStore(); await pool.end(); });
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  assert.equal((await pool.query('SELECT count(*)::int n FROM app_user')).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password, 12), actors = {}, cookies = {};
  for (const role of ['admin','superadmin','add','edit','price','none']) {
    actors[role] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Write','Fixture',$1,$2,$3,'active') RETURNING user_id,email", [`product-write-${role}@example.test`, hash, ['admin','superadmin'].includes(role) ? role : 'user'])).rows[0];
    if (['add','edit','price'].includes(role)) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)', [actors[role].user_id, role === 'price' ? 'price.add' : 'product.'+role]);
  }
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config }); server = createServer(app); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const request = (url, who = 'admin', options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { redirect: 'manual', ...options, headers: { Origin: config.origin, Accept: 'application/json', ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...options.headers } });
  for (const who of Object.keys(actors)) {
    const res = await request('/login', who, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email: actors[who].email, password }) }); assert.equal(res.status,200); cookies[who]=res.headers.getSetCookie()[0].split(';')[0];
  }
  const post = (body, who='admin', options={}) => request('/api/products', who, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), ...options });
  const put = (code,body,who='admin') => request('/api/products/'+encodeURIComponent(code),who,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const good = { prodCode:'P-001', description:'Pump', unit:'pcs' };
  const audits = async () => (await pool.query("SELECT * FROM audit_log WHERE table_name='product' ORDER BY audit_id")).rows;
  await t.test('legacy schema rejects safely with no product or audit mutation',async()=>{
    assert.equal((await post(good)).status,503);
    assert.equal((await pool.query('SELECT count(*)::int n FROM product')).rows[0].n,0);
    assert.equal((await audits()).length,0);
  });
  // PROPOSED contract fixture ONLY. Not a migration, never applied to a shared DB.
  await pool.query(`ALTER TABLE product ALTER COLUMN description TYPE varchar(100), ALTER COLUMN unit TYPE varchar(5), ALTER COLUMN stamp TYPE text;
    ALTER TABLE product DROP CONSTRAINT unit_ck;
    ALTER TABLE product ADD CONSTRAINT unit_ck CHECK(unit IN ('pc','ea','mtr','pkg','ltr','pcs','can','pair','meter'));
    CREATE FUNCTION public.product_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='INSERT' THEN NEW.stamp:=public.audit_stamp('CREATED');
      ELSIF (to_jsonb(OLD)-'stamp')=(to_jsonb(NEW)-'stamp') THEN NEW.stamp:=OLD.stamp;
      ELSE NEW.stamp:=public.audit_stamp('EDITED'); END IF; RETURN NEW; END $$;
    CREATE OR REPLACE TRIGGER product_biu_stamp BEFORE INSERT OR UPDATE ON product FOR EACH ROW EXECUTE FUNCTION product_set_stamp();`);
  await t.test('anonymous, wrong action rights, cross-origin and non-JSON writes rejected',async()=>{
    assert.equal((await post(good,'anonymous')).status,401);
    for (const who of ['none','edit','price']) assert.equal((await post(good,who)).status,403);
    assert.equal((await put('P-001',{description:'Edit',unit:'pcs'},'add')).status,403);
    assert.equal((await post(good,'admin',{headers:{'Content-Type':'application/json',Origin:'https://evil.example'}})).status,403);
    assert.equal((await post(good,'admin',{headers:{'Content-Type':'text/plain'}})).status,415);
  });
  await t.test('malformed JSON, wrong body shapes and oversized bodies have safe validation responses', async () => {
    assert.equal((await post(null)).status,400); assert.equal((await post([])).status,400);
    assert.equal((await post(good,'admin',{body:'{broken'})).status,400);
    assert.equal((await post(good,'admin',{body:JSON.stringify({description:'x'.repeat(110000)})})).status,413);
  });
  await t.test('create sets active DB-owned CREATED stamp, one actor audit, no price; duplicate is 400',async()=>{
    const res=await post(good,'add'); assert.equal(res.status,201); const json=await res.json(); assert.deepEqual(Object.keys(json.product).sort(),['description','prodcode','unit']);
    const row=(await pool.query("SELECT * FROM product WHERE prodcode='P-001'")).rows[0]; assert.equal(row.is_deleted,false); assert.ok(row.stamp.startsWith('CREATED '+actors.add.email+' '));
    const log=(await audits())[0]; assert.equal(log.action_by,actors.add.email); assert.equal(log.action,'ADD'); assert.equal(log.new_values.unit,'pcs');
    assert.equal((await pool.query('SELECT count(*)::int n FROM pricehist')).rows[0].n,0);
    assert.equal((await post(good)).status,400); assert.equal((await audits()).length,1);
    const list=await (await request('/api/products')).json(); assert.equal(list.products[0].currentPrice,null);
  });
  await t.test('all supported units, exact 100 characters, parameterized injection-like description',async()=>{
    for (const [index,unit] of ['pcs','can','pair','meter','pc','ea','mtr','pkg','ltr'].entries()) assert.equal((await post({prodCode:'U'+index, description:'x'.repeat(100),unit},'superadmin')).status,201);
    assert.equal((await post({prodCode:'SQL-1',description:"' OR 1=1 --",unit:'can'})).status,201);
    assert.equal((await pool.query("SELECT description FROM product WHERE prodcode='SQL-1'")).rows[0].description,"' OR 1=1 --");
  });
  await t.test('required, format, length, units and forbidden system/pricing fields rejected',async()=>{
    for (const body of [{}, {...good,description:''},{...good,description:'x'.repeat(101)},{...good,unit:'invalid'},{...good,prodCode:"';--"},{...good,status:'active'},{...good,stamp:'spoof'},{...good,currentPrice:'1.00'}]) assert.equal((await post(body)).status,400);
    assert.equal((await put('P-001',{...good})).status,400);
  });
  await t.test('edit immutable code, EDITED actor audit, price/relationships preserved and no-op silent',async()=>{
    await pool.query("INSERT INTO pricehist(prodcode,effdate,unitprice) VALUES('P-001',CURRENT_DATE,12.34)");
    const before=await audits(); const res=await put('P-001',{description:'Updated',unit:'meter'},'edit'); assert.equal(res.status,200);
    const row=(await pool.query("SELECT * FROM product WHERE prodcode='P-001'")).rows[0]; assert.ok(row.stamp.startsWith('EDITED '+actors.edit.email+' '));
    const logs=await audits(); assert.equal(logs.length,before.length+1); const log=logs.at(-1); assert.equal(log.action_by,actors.edit.email); assert.equal(log.old_values.description,'Pump'); assert.equal(log.new_values.description,'Updated');
    assert.equal((await pool.query("SELECT unitprice FROM pricehist WHERE prodcode='P-001'")).rows[0].unitprice,'12.34');
    assert.equal((await put('P-001',{description:'Updated',unit:'meter'},'edit')).status,200); assert.equal((await audits()).length,logs.length);
  });
  await t.test('missing and soft-deleted edit is 404 without restoration',async()=>{
    assert.equal((await put('ABSENT',{description:'X',unit:'pcs'})).status,404);
    await pool.query("UPDATE product SET is_deleted=true WHERE prodcode='U0'");
    assert.equal((await put('U0',{description:'X',unit:'pcs'})).status,404);
    assert.equal((await pool.query("SELECT is_deleted FROM product WHERE prodcode='U0'")).rows[0].is_deleted,true);
  });
  await t.test('legacy stamp output rolls back product and trigger audit atomically',async()=>{
    await pool.query('CREATE OR REPLACE TRIGGER product_biu_stamp BEFORE INSERT OR UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_set_stamp()');
    const before=(await audits()).length; assert.equal((await post({...good,prodCode:'FAIL-1'})).status,503);
    assert.equal((await pool.query("SELECT count(*)::int n FROM product WHERE prodcode='FAIL-1'")).rows[0].n,0); assert.equal((await audits()).length,before);
    await pool.query('CREATE OR REPLACE TRIGGER product_biu_stamp BEFORE INSERT OR UPDATE ON product FOR EACH ROW EXECUTE FUNCTION product_set_stamp()');
  });
  await t.test('revoked rights and blocked authenticated actors fail closed',async()=>{
    const { writeProduct } = require('../src/products/mutations');
    const staleActor = (await pool.query('SELECT user_id,session_version FROM app_user WHERE user_id=$1',[actors.add.user_id])).rows[0];
    await assert.rejects(writeProduct(pool,{user:{user_id:staleActor.user_id},version:staleActor.session_version-1},'product.add',good), error => error.status === 401);
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1',[actors.add.user_id]);
    await assert.rejects(writeProduct(pool,{user:{user_id:staleActor.user_id},version:staleActor.session_version},'product.add',good), error => error.status === 403); assert.equal((await post({...good,prodCode:'REV-1'},'add')).status,403);
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1',[actors.edit.user_id]); assert.equal((await put('P-001',{description:'Blocked',unit:'pcs'},'edit')).status,403);
  });
  await t.test('missing audit trigger rejects writes without leaking SQL details',async()=>{
    await pool.query('DROP TRIGGER product_aiu_audit ON product'); const res=await post({...good,prodCode:'ERR-1'}); assert.equal(res.status,503); const text=await res.text(); assert.ok(!text.includes('SELECT')&&!text.includes('password'));
    assert.equal((await pool.query("SELECT count(*)::int n FROM product WHERE prodcode='ERR-1'")).rows[0].n,0);
  });
});
