const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Product state transitions: real guards and proposed Issue #77 fixture', {
  skip: process.env.PRODUCT_STATE_INTEGRATION !== '1' ? 'Requires run_product_writes.py disposable cluster.' : false,
}, async t => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const pool = new Pool({ query_timeout: 5000 }); let server, app;
  t.after(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await app?.locals.closeAuthStore(); await pool.end(); });
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  assert.equal((await pool.query("SELECT count(*)::int n FROM app_user WHERE email LIKE 'product-state-%'")).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password, 12), actors = {}, cookies = {};
  for (const role of ['admin','superadmin','delete','edit','none']) {
    actors[role] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Write','Fixture',$1,$2,$3,'active') RETURNING user_id,email", [`product-state-${role}@example.test`, hash, ['admin','superadmin'].includes(role) ? role : 'user'])).rows[0];
    if (['delete','edit'].includes(role)) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)', [actors[role].user_id, 'product.'+role]);
  }
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config }); server = createServer(app); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const request = (url, who = 'admin', options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { redirect: 'manual', ...options, headers: { Origin: config.origin, Accept: 'application/json', ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...options.headers } });
  for (const who of Object.keys(actors)) {
    const res = await request('/login', who, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email: actors[who].email, password }) }); assert.equal(res.status,200); cookies[who]=res.headers.getSetCookie()[0].split(';')[0];
  }

  const change = (code,restore=false,who='admin',body={}) => request('/api/products/'+encodeURIComponent(code)+(restore?'/restore':''),who,{method:restore?'PUT':'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const logs = async code => (await pool.query("SELECT * FROM audit_log WHERE table_name='product' AND record_key=$1 ORDER BY audit_id",[code])).rows;
  const row = async code => (await pool.query('SELECT * FROM product WHERE prodcode=$1',[code])).rows[0];
  // DEV-05 negative test removed this trigger. Restore it in this disposable DB.
  await pool.query("CREATE TRIGGER product_aiu_audit AFTER INSERT OR UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_audit_log('prodcode')");
  const { readFileSync } = require('node:fs');
  await pool.query(readFileSync('supabase/schemas/public/functions/trg_check_children.sql','utf8').split('\nGRANT ')[0]);
  await pool.query(`ALTER TABLE salesdetail ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
    CREATE TRIGGER product_bu_check BEFORE UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_check_children();
    INSERT INTO product(prodcode,description,unit) VALUES('S-001','State Fixture','pc'),('S-002','No children','pc'),('S-003','Race','pc');
    INSERT INTO pricehist(prodcode,effdate,unitprice) VALUES('S-001',CURRENT_DATE,12.34);
    INSERT INTO sales(transno,salesdate) VALUES('STATE001',CURRENT_DATE);
    INSERT INTO salesdetail(transno,prodcode,quantity) VALUES('STATE001','S-001',2);`);
  const prices=JSON.stringify((await pool.query("SELECT * FROM pricehist WHERE prodcode='S-001'")).rows);
  const sales=JSON.stringify((await pool.query("SELECT * FROM salesdetail WHERE prodcode='S-001'")).rows);
  await t.test('actual child guard returns safe 409 and preserves all data/audit',async()=>{
    const before=await logs('S-001');const res=await change('S-001');assert.equal(res.status,409);assert.equal((await row('S-001')).is_deleted,false);assert.deepEqual(await logs('S-001'),before);
  });
  await t.test('existing non-state stamp output rolls back state/audit together',async()=>{
    const before=await logs('S-002');assert.equal((await change('S-002')).status,503);assert.equal((await row('S-002')).is_deleted,false);assert.deepEqual(await logs('S-002'),before);
  });
  // PROPOSED DBA contract, solely in this disposable fixture: keep historical
  // dependencies and a product-specific state stamp. No deployed trigger bypass.
  await pool.query(`CREATE OR REPLACE FUNCTION product_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='INSERT' THEN NEW.stamp:=audit_stamp('CREATED');
    ELSIF (to_jsonb(OLD)-'stamp')=(to_jsonb(NEW)-'stamp') THEN NEW.stamp:=OLD.stamp;
    ELSIF NOT OLD.is_deleted AND NEW.is_deleted THEN NEW.stamp:=audit_stamp('DELETED');
    ELSIF OLD.is_deleted AND NOT NEW.is_deleted THEN NEW.stamp:=audit_stamp('RESTORED');
    ELSE NEW.stamp:=audit_stamp('EDITED'); END IF; RETURN NEW; END $$;`);
  await t.test('delete/restore without dependencies: row remains, exact stamps and single actor audits',async()=>{
    const before=(await logs('S-002')).length;
    assert.equal((await change('S-002',false,'delete')).status,200);let saved=await row('S-002');assert.equal(saved.is_deleted,true);assert.ok(saved.stamp.startsWith('DELETED '+actors.delete.email+' '));
    assert.equal((await change('S-002',true,'superadmin')).status,200);saved=await row('S-002');assert.equal(saved.is_deleted,false);assert.ok(saved.stamp.startsWith('RESTORED '+actors.superadmin.email+' '));
    const entries=(await logs('S-002')).slice(before);assert.deepEqual(entries.map(e=>e.action),['DELETE','RESTORE']);assert.equal(entries[0].action_by,actors.delete.email);assert.equal(entries[0].new_values.is_deleted,true);assert.equal(entries[1].old_values.is_deleted,true);
  });
  await t.test('401/403 exact delete rights, Users never restore, and payload spoofing fails',async()=>{
    assert.equal((await change('S-002',false,'anonymous')).status,401);
    for(const who of ['edit','none'])assert.equal((await change('S-002',false,who)).status,403);
    assert.equal((await change('S-002',true,'delete')).status,403);
    assert.equal((await change('S-002',false,'admin',{role:'superadmin'})).status,400);
    assert.equal((await change("' OR 1",false)).status,400);
    assert.equal((await change('ABSENT')).status,404);assert.equal((await change('ABSENT',true)).status,404);
  });
  await t.test('repeated transitions are safe, inactive User target hidden and no extra audit',async()=>{
    assert.equal((await change('S-002')).status,200);const before=await logs('S-002');
    assert.equal((await change('S-002')).status,400);assert.equal((await change('S-002',false,'delete')).status,404);assert.deepEqual(await logs('S-002'),before);
    assert.equal((await change('S-002',true)).status,200);const after=await logs('S-002');assert.equal((await change('S-002',true)).status,400);assert.deepEqual(await logs('S-002'),after);
  });
  await t.test('concurrent delete/restore serialize to one mutation each',async()=>{
    const before=(await logs('S-003')).length;
    const a=await Promise.all([change('S-003'),change('S-003')]);assert.deepEqual(a.map(r=>r.status).sort(),[200,400]);
    const b=await Promise.all([change('S-003',true),change('S-003',true)]);assert.deepEqual(b.map(r=>r.status).sort(),[200,400]);assert.equal((await logs('S-003')).length,before+2);
  });
  // Keep the guard enabled; this alternative function body is an explicitly
  // unapproved DBA policy fixture. Other table branches remain exactly tracked.
  const guard=readFileSync('supabase/schemas/public/functions/trg_check_children.sql','utf8').split('\nGRANT ')[0].replace("WHEN 'product' THEN", "WHEN 'product' THEN RETURN NEW; -- proposed historical-reference policy\n");
  await pool.query(guard);
  await t.test('proposed dependency policy preserves price/sales bytes, filtering, counts and current price',async()=>{
    const list=async(who,status)=>{const res=await request('/api/products?search=S-001&status='+status,who);assert.equal(res.status,200);return res.json();};
    assert.equal((await list('admin','active')).products[0].currentPrice,'12.34');
    assert.equal((await change('S-001')).status,200);const inactive=await list('admin','inactive');assert.equal(inactive.products[0].currentPrice,'12.34');assert.deepEqual(inactive.counts,{active:0,inactive:1,all:1});
    assert.deepEqual((await list('delete','all')).products,[]);assert.deepEqual((await list('admin','active')).products,[]);
    assert.equal((await change('S-001',true)).status,200);const active=await list('admin','active');assert.equal(active.products[0].currentPrice,'12.34');assert.deepEqual(active.counts,{active:1,inactive:0,all:1});
    assert.equal(JSON.stringify((await pool.query("SELECT * FROM pricehist WHERE prodcode='S-001'")).rows),prices);assert.equal(JSON.stringify((await pool.query("SELECT * FROM salesdetail WHERE prodcode='S-001'")).rows),sales);
    assert.equal((await row('S-001')).prodcode,'S-001');
  });
  await t.test('revocation/blocking and missing dependency guard fail closed',async()=>{
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1',[actors.delete.user_id]);assert.equal((await change('S-002',false,'delete')).status,403);
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1',[actors.superadmin.user_id]);assert.equal((await change('S-002',true,'superadmin')).status,403);
    await pool.query('DROP TRIGGER product_bu_check ON product');assert.equal((await change('S-002')).status,503);assert.equal((await row('S-002')).is_deleted,false);
  });
});
