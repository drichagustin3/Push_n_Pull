const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Price history: isolated effective-date, precision, permissions and audit acceptance', {
  skip: process.env.PRICE_HISTORY_INTEGRATION !== '1' ? 'Requires run_price_history.py disposable cluster.' : false,
}, async t => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const pool = new Pool({ query_timeout: 5000 }); let server, app;
  t.after(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await app?.locals.closeAuthStore(); await pool.end(); });
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  assert.equal((await pool.query("SELECT count(*)::int n FROM app_user WHERE email LIKE 'price-history-%'")).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password, 12), actors = {}, cookies = {};
  for (const role of ['admin','superadmin','add','edit','delete','none']) {
    actors[role] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Write','Fixture',$1,$2,$3,'active') RETURNING user_id,email", [`price-history-${role}@example.test`, hash, ['admin','superadmin'].includes(role) ? role : 'user'])).rows[0];
    if (['add','delete','edit'].includes(role)) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)', [actors[role].user_id, 'price.'+role]);
  }
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config }); server = createServer(app); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const request = (url, who = 'admin', options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { redirect: 'manual', ...options, headers: { Origin: config.origin, Accept: 'application/json', ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...options.headers } });
  for (const who of Object.keys(actors)) {
    const res = await request('/login', who, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email: actors[who].email, password }) }); assert.equal(res.status,200); cookies[who]=res.headers.getSetCookie()[0].split(';')[0];
  }


  await pool.query("CREATE TRIGGER product_bu_check BEFORE UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_check_children(); INSERT INTO product(prodcode,description,unit) VALUES('H-001','History Fixture','pc'),('H-002','Empty History','pc'),('H-003','Inactive Fixture','pc'); UPDATE product SET is_deleted=true WHERE prodcode='H-003';");
  const {readFileSync}=require('node:fs');
  await pool.query(readFileSync('supabase/schemas/public/functions/trg_audit_log.sql','utf8').split('\nGRANT ')[0]);
  await pool.query(`CREATE TRIGGER pricehist_biu_stamp BEFORE INSERT OR UPDATE ON pricehist FOR EACH ROW EXECUTE FUNCTION trg_set_stamp();
    CREATE TRIGGER pricehist_aiu_audit AFTER INSERT OR UPDATE ON pricehist FOR EACH ROW EXECUTE FUNCTION trg_audit_log('effdate','prodcode');
    CREATE TRIGGER pricehist_bu_check BEFORE UPDATE ON pricehist FOR EACH ROW EXECUTE FUNCTION trg_check_children();`);
  const path=(code='H-001',suffix='')=>'/api/products/'+encodeURIComponent(code)+'/prices'+suffix;
  const write=(method,date,body={},who='admin',code='H-001')=>request(path(code,date?'/'+date:''),who,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const add=(effDate,unitPrice,who='admin',code='H-001')=>write('POST','',{effDate,unitPrice},who,code);
  const list=async(who='admin',status='all',code='H-001')=>{const res=await request(path(code,'?status='+status),who);assert.equal(res.status,200);return res.json();};
  const log=async()=> (await pool.query("SELECT * FROM audit_log WHERE table_name='pricehist' AND record_key LIKE '%|H-001' ORDER BY audit_id")).rows;
  const current=async()=>{const res=await request('/api/products?search=H-001');return(await res.json()).products[0].currentPrice;};
  const today=(await pool.query('SELECT CURRENT_DATE::text today')).rows[0].today;
  const past=(await pool.query("SELECT (CURRENT_DATE-5)::text AS value")).rows[0].value;
  const future=(await pool.query("SELECT (CURRENT_DATE+5)::text AS value")).rows[0].value;
  await t.test('snapshot stamp capacity rejects writes without changing history or audit',async()=>{
    const before=await log();assert.equal((await add(today,'10.00')).status,503);assert.deepEqual(await log(),before);assert.deepEqual((await list()).prices,[]);
  });
  await pool.query('ALTER TABLE pricehist ALTER COLUMN stamp TYPE text');
  await t.test('legacy labels roll back history and trigger audit atomically',async()=>{
    const before=await log();assert.equal((await add(today,'10.00')).status,503);assert.deepEqual(await log(),before);assert.deepEqual((await list()).prices,[]);
  });
  // PROPOSED price-specific stamp fixture ONLY, not an official migration.
  await pool.query(`CREATE FUNCTION pricehist_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='INSERT' THEN NEW.stamp:=audit_stamp('CREATED');
    ELSIF (to_jsonb(OLD)-'stamp')=(to_jsonb(NEW)-'stamp') THEN NEW.stamp:=OLD.stamp;
    ELSIF NOT OLD.is_deleted AND NEW.is_deleted THEN NEW.stamp:=audit_stamp('DELETED');
    ELSIF OLD.is_deleted AND NOT NEW.is_deleted THEN NEW.stamp:=audit_stamp('RESTORED');
    ELSE NEW.stamp:=audit_stamp('EDITED');END IF;RETURN NEW;END $$;
    CREATE OR REPLACE TRIGGER pricehist_biu_stamp BEFORE INSERT OR UPDATE ON pricehist FOR EACH ROW EXECUTE FUNCTION pricehist_set_stamp();`);
  await t.test('module access and exact action guards, strict privileged restore and safe inputs',async()=>{
    assert.equal((await request(path(),'anonymous')).status,401);assert.equal((await request(path(),'none')).status,403);
    for(const who of ['edit','delete','none'])assert.equal((await add(today,'10.00',who)).status,403);
    assert.equal((await write('PUT',today,{unitPrice:'1.00'},'add')).status,403);assert.equal((await write('DELETE',today,{},'add')).status,403);
    for(const who of ['add','edit','delete'])assert.equal((await write('PUT',today+'/restore',{},who)).status,403);
    assert.equal((await request(path(), 'admin',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
    for(const body of [{}, {effDate:'2026-02-30',unitPrice:'1.00'},{effDate:today,unitPrice:'0'},{effDate:today,unitPrice:'1.001'},{effDate:today,unitPrice:'100000000'},{effDate:today,unitPrice:1},{effDate:today,unitPrice:'1.00',stamp:'spoof'}])assert.equal((await write('POST','',body)).status,400);
    assert.equal((await request(path(), 'admin',{method:'POST',headers:{'Content-Type':'application/json'},body:'{invalid'})).status,400);
    assert.equal((await write('PUT',"' OR 1",{unitPrice:'1.00'})).status,400);
    assert.equal((await request('/api/products/'+encodeURIComponent("';--")+'/prices')).status,400);
    assert.equal((await request(path('H-001','?status=all&role=admin'))).status,400);
  });
  await t.test('historical/today/future creation, precise text bounds, DESC ordering and CREATED actor audit',async()=>{
    assert.equal((await add(past,'0.01','add')).status,201);assert.equal((await add(today,'99999999.99')).status,201);assert.equal((await add(future,'12.34','superadmin')).status,201);
    const data=await list();assert.deepEqual(data.prices.map(p=>p.effDate),[future,today,past]);assert.equal(data.prices[1].unitPrice,'99999999.99');assert.equal(typeof data.prices[1].unitPrice,'string');assert.ok(data.prices[2].stamp.startsWith('CREATED '+actors.add.email+' '));
    const entries=await log();assert.equal(entries.length,3);assert.equal(entries[0].record_key,past+'|H-001');assert.equal(entries[0].action_by,actors.add.email);assert.equal(entries[0].action,'ADD');assert.equal(entries[0].new_values.prodcode,'H-001');assert.equal(await current(),'99999999.99');
  });
  await t.test('duplicate dates conflict including inactive records; neighboring points are valid',async()=>{
    assert.equal((await add(today,'1.00')).status,409);assert.equal((await add(past,'1.00')).status,409);
  });
  await t.test('edit only amount, preserve dates, no-op no duplicate audit and refresh current price',async()=>{
    const before=(await log()).length;assert.equal((await write('PUT',today,{unitPrice:'5.67'},'edit')).status,200);assert.equal(await current(),'5.67');
    const logs=await log();assert.equal(logs.length,before+1);assert.equal(logs.at(-1).action_by,actors.edit.email);assert.equal(logs.at(-1).old_values.unitprice,99999999.99);assert.equal(logs.at(-1).new_values.unitprice,5.67);
    const data=await list();assert.ok(data.prices.find(p=>p.effDate===today).stamp.startsWith('EDITED '+actors.edit.email+' '));
    assert.equal((await write('PUT',today,{unitPrice:'5.670'})).status,400);assert.equal((await write('PUT',today,{unitPrice:'5.67'})).status,200);assert.equal((await log()).length,logs.length);
    assert.equal((await write('PUT',today,{unitPrice:'2.00',effDate:future})).status,400);
  });
  await pool.query("INSERT INTO sales(transno,salesdate) VALUES('HIST0001',CURRENT_DATE); INSERT INTO salesdetail(transno,prodcode,quantity,is_deleted) VALUES('HIST0001','H-001',3,false)");
  const historical=JSON.stringify((await pool.query("SELECT * FROM salesdetail WHERE prodcode='H-001'")).rows);
  await t.test('soft delete keeps rows and sales, fallback price, User metadata/status privacy',async()=>{
    const res=await write('DELETE',today,{},'delete');assert.equal(res.status,200);assert.deepEqual(Object.keys((await res.json()).price),['effDate']);assert.equal(await current(),'0.01');
    assert.equal((await pool.query("SELECT count(*)::int n FROM pricehist WHERE prodcode='H-001'")).rows[0].n,3);assert.equal(JSON.stringify((await pool.query("SELECT * FROM salesdetail WHERE prodcode='H-001'")).rows),historical);
    for(const status of ['all','inactive','active']){const data=await list('add',status);assert.equal(data.filter.status,'active');assert.equal(data.prices.length,2);for(const price of data.prices)assert.deepEqual(Object.keys(price).sort(),['effDate','unitPrice']);assert.equal(data.capabilities.restore,false);}
    assert.equal((await list('admin','inactive')).prices.length,1);assert.ok((await list('superadmin','all')).prices.some(p=>p.status==='inactive'&&p.stamp.startsWith('DELETED '+actors.delete.email+' ')));
    assert.equal((await add(today,'1.00')).status,409);assert.equal((await write('DELETE',today)).status,400);assert.equal((await write('DELETE',today,{},'delete')).status,404);assert.equal((await write('PUT',today,{unitPrice:'1.00'})).status,409);
  });
  await t.test('restore exact row and price, strict roles, repeated transition and history integrity',async()=>{
    assert.equal((await write('PUT',today+'/restore',{},'superadmin')).status,200);assert.equal(await current(),'5.67');assert.ok((await list()).prices.find(p=>p.effDate===today).stamp.startsWith('RESTORED '+actors.superadmin.email+' '));
    assert.equal((await write('PUT',today+'/restore')).status,400);assert.equal(JSON.stringify((await pool.query("SELECT * FROM salesdetail WHERE prodcode='H-001'")).rows),historical);
    assert.equal((await write('DELETE',today)).status,200);assert.equal((await write('PUT',today+'/restore')).status,200);
  });
  await t.test('missing/inactive parent and history, no eligible price and null response semantics',async()=>{
    assert.equal((await request(path('ABSENT'))).status,404);assert.equal((await add(today,'1.00','admin','ABSENT')).status,404);assert.equal((await request(path('H-003'),'add')).status,404);assert.equal((await add(today,'1.00','admin','H-003')).status,409);assert.equal((await add(today,'1.00','add','H-003')).status,404);
    for(const method of ['PUT','DELETE'])assert.equal((await write(method,'1990-01-01',method==='PUT'?{unitPrice:'1.00'}:{})).status,404);assert.equal((await write('PUT','1990-01-01/restore')).status,404);
    assert.deepEqual((await list('admin','all','H-002')).prices,[]);
    await write('DELETE',today);await write('DELETE',past);assert.equal(await current(),null);await write('PUT',past+'/restore');await write('PUT',today+'/restore');
  });
  await t.test('concurrent duplicate inserts and state transitions produce one committed mutation',async()=>{
    const date='2000-01-01';const added=await Promise.all([add(date,'1.00'),add(date,'2.00')]);assert.deepEqual(added.map(r=>r.status).sort(),[201,409]);
    const deleted=await Promise.all([write('DELETE',date),write('DELETE',date)]);assert.deepEqual(deleted.map(r=>r.status).sort(),[200,400]);
    const restored=await Promise.all([write('PUT',date+'/restore'),write('PUT',date+'/restore')]);assert.deepEqual(restored.map(r=>r.status).sort(),[200,400]);
  });
  await t.test('revoked/blocked sessions and missing audit trigger fail closed, no SQL leak',async()=>{
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1',[actors.add.user_id]);assert.equal((await add('2001-01-01','1.00','add')).status,403);
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1',[actors.edit.user_id]);assert.equal((await write('PUT',today,{unitPrice:'2.00'},'edit')).status,403);
    await pool.query('DROP TRIGGER pricehist_aiu_audit ON pricehist');const before=await log();const res=await add('2001-01-01','1.00');assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/SELECT|password_hash/);assert.deepEqual(await log(),before);
  });
});
