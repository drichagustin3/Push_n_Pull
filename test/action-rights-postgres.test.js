const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Nine-action Customer/Product/Price matrix in disposable combined checkout', {
  skip: process.env.ACTION_RIGHTS_INTEGRATION !== '1' ? 'Requires documented disposable combined checkout and run_action_rights.py.' : false,
}, async t => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_product_test');
  const pool = new Pool({ query_timeout: 5000 }); let server, app;
  t.after(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await app?.locals.closeAuthStore(); await pool.end(); });
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  assert.equal((await pool.query("SELECT count(*)::int n FROM app_user WHERE email LIKE 'rights-matrix-%'")).rows[0].n, 0);
  const rights=['customer.add','customer.edit','customer.delete','product.add','product.edit','product.delete','price.add','price.edit','price.delete'];
  const security=[];
  const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password, 12), actors = {}, cookies = {};
  for (const role of [...rights,'admin','superadmin','none','blocked','inactive']) {
    actors[role] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Write','Fixture',$1,$2,$3,'active') RETURNING user_id,email", [`rights-matrix-${role}@example.test`, hash, ['admin','superadmin'].includes(role) ? role : 'user'])).rows[0];
    if (rights.includes(role)) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)', [actors[role].user_id, role]);
  }
  for(const name of ['blocked','inactive']) for(const right of rights) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)',[actors[name].user_id,right]);
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config, securityLogger: {warn:line=>security.push(JSON.parse(line))} }); server = createServer(app); server.listen(0,'127.0.0.1'); await once(server,'listening');
  const request = (url, who = 'admin', options = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { redirect: 'manual', ...options, headers: { Origin: config.origin, Accept: 'application/json', ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...options.headers } });
  for (const who of Object.keys(actors)) {
    const res = await request('/login', who, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ email: actors[who].email, password }) }); assert.equal(res.status,200); cookies[who]=res.headers.getSetCookie()[0].split(';')[0];
  }



  // Proposed Customer contract is isolated here, not a migration or application workaround.
  await pool.query(`ALTER TABLE customer ADD COLUMN is_deleted boolean NOT NULL DEFAULT false, ADD COLUMN stamp text;
    ALTER TABLE customer ALTER COLUMN custname TYPE varchar(100);
    ALTER TABLE sales ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
    CREATE FUNCTION customer_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF TG_OP='INSERT' THEN NEW.stamp:=audit_stamp('CREATED');
      ELSIF (to_jsonb(OLD)-'stamp')=(to_jsonb(NEW)-'stamp') THEN NEW.stamp:=OLD.stamp;
      ELSIF NOT OLD.is_deleted AND NEW.is_deleted THEN NEW.stamp:=audit_stamp('DELETED');
      ELSIF OLD.is_deleted AND NOT NEW.is_deleted THEN NEW.stamp:=audit_stamp('RESTORED');
      ELSE NEW.stamp:=audit_stamp('EDITED'); END IF;RETURN NEW;END $$;
    CREATE TRIGGER customer_biu_stamp BEFORE INSERT OR UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION customer_set_stamp();
    CREATE TRIGGER customer_aiu_audit AFTER INSERT OR UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION trg_audit_log('custno');
    CREATE TRIGGER customer_bu_check BEFORE UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION trg_check_children();
    CREATE TRIGGER pricehist_aiu_audit AFTER INSERT OR UPDATE ON pricehist FOR EACH ROW EXECUTE FUNCTION trg_audit_log('effdate','prodcode');`);
  const today=(await pool.query('SELECT CURRENT_DATE::text AS value')).rows[0].value;
  let serial=0;
  async function prepare(right){
    const [module,operation]=right.split('.'), n=String(++serial).padStart(4,'0'), code=(module==='customer'?'C':'R')+n;
    let url,method=operation==='add'?'POST':operation==='edit'?'PUT':'DELETE',body;
    if(module==='customer'){
      if(operation!=='add')await pool.query("INSERT INTO customer(custno,custname,payterm) VALUES($1,'Customer fixture','COD')",[code]);
      url='/api/customers'+(operation==='add'?'':'/'+code);body=operation==='add'?{custNo:code,custName:'Customer '+n,address:'Test',payTerms:'COD'}:operation==='edit'?{custName:'Edited '+n,address:'Test',payTerms:'COD'}:{};
    }else if(module==='product'){
      if(operation!=='add')await pool.query("INSERT INTO product(prodcode,description,unit) VALUES($1,'Product fixture','pc')",[code]);
      url='/api/products'+(operation==='add'?'':'/'+code);body=operation==='add'?{prodCode:code,description:'Product '+n,unit:'pc'}:operation==='edit'?{description:'Edited '+n,unit:'pc'}:{};
    }else{
      await pool.query("INSERT INTO product(prodcode,description,unit) VALUES($1,'Price fixture','pc')",[code]);
      if(operation!=='add')await pool.query('INSERT INTO pricehist(prodcode,effdate,unitprice) VALUES($1,$2,1.00)',[code,today]);
      url='/api/products/'+code+'/prices'+(operation==='add'?'':'/'+today);body=operation==='add'?{effDate:today,unitPrice:'2.34'}:operation==='edit'?{unitPrice:'3.45'}:{};
    }
    return{url,method,body,code};
  }
  const call=(operation,who,override={})=>request(override.url??operation.url,who,{method:operation.method,headers:{'Content-Type':'application/json'},body:JSON.stringify(override.body??operation.body)});
  async function digest(){
    const values=[];for(const table of ['customer','product','pricehist','sales','salesdetail','audit_log'])values.push((await pool.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'')) AS digest FROM public.${table} t`)).rows[0].digest);return values;
  }
  async function denied(operation,who,status,override={}){const before=await digest();const res=await call(operation,who,override);assert.ok((Array.isArray(status)?status:[status]).includes(res.status),operation.url+' '+who+' expected '+status+' got '+res.status);assert.deepEqual(await digest(),before);return res;}
  for(const right of rights)await t.test(right+': exact authorization, cross-action/module denial, revocation, spoofing and non-mutation',async()=>{
    const operation=await prepare(right);
    await denied(operation,'anonymous',401);await denied(operation,'none',403);
    for(const other of rights.filter(code=>code!==right))await denied(operation,other,403);
    await denied(operation,'none',403,{body:{...operation.body,role:'superadmin',rightCodes:rights},url:operation.url+'?role=superadmin'});
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1 AND right_code=$2',[actors[right].user_id,right]);await denied(operation,right,403);
    await pool.query('UPDATE user_permission SET is_deleted=false WHERE user_id=$1 AND right_code=$2',[actors[right].user_id,right]);
    assert.equal((await call(operation,right)).status,right.endsWith('.add')?201:200);
  });
  await t.test('all nine privilege variants succeed for Admin and Superadmin; no rights are assigned through client flags',async()=>{
    for(const who of ['admin','superadmin'])for(const right of rights){const operation=await prepare(right);assert.equal((await call(operation,who)).status,right.endsWith('.add')?201:200);}
  });
  await t.test('session/navigation reflect exact effective rights and live revocation without new login',async()=>{
    for(const right of rights){const session=await request('/api/v1/auth/session',right);assert.equal(session.status,200);const data=await session.json();assert.deepEqual(data.rightCodes,[right]);assert.equal(Object.keys(data.permissions).length,9);for(const code of rights)assert.equal(data.permissions[code],code===right);
      const navigation=await (await request('/api/navigation',right)).json();assert.deepEqual(navigation.rightCodes,[right]);assert.deepEqual(navigation.items.map(item=>item.code),[right.startsWith('customer.')?'customer':'product']);}
    const actor=actors['product.add'];await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1',[actor.user_id]);assert.equal((await(await request('/api/v1/auth/session','product.add')).json()).permissions['product.add'],false);await pool.query('UPDATE user_permission SET is_deleted=false WHERE user_id=$1',[actor.user_id]);
  });
  await t.test('blocked/inactive active sessions cannot mutate any action',async()=>{
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1',[actors.blocked.user_id]);await pool.query("UPDATE app_user SET status='inactive' WHERE user_id=$1",[actors.inactive.user_id]);
    for(const right of rights){const operation=await prepare(right);await denied(operation,'blocked',[401,403]);await denied(operation,'inactive',[401,403]);}
  });
  await t.test('all restore routes remain privileged, both workspace modules render and APIs coexist',async()=>{
    for(const module of ['customer','product','price']){
      const operation=await prepare(module+'.delete');assert.equal((await call(operation,'admin')).status,200);operation.url+='/restore';operation.method='PUT';operation.body={};
      for(const right of rights)await denied(operation,right,403);
      assert.equal((await call(operation,'superadmin')).status,200);
    }
    for(const module of ['customer','product']){const page=await request('/workspace/'+module);assert.equal(page.status,200);assert.match(await page.text(),module==='customer'?/customerSearch/:/productSearch/);assert.equal((await request('/api/'+(module==='customer'?'customers':'products'))).status,200);}
  });
  await t.test('denials emit fixed redacted security events, distinct from successful DB audit',()=>{
    assert.ok(security.length>=100);for(const event of security){assert.deepEqual(Object.keys(event).sort(),['action','at','event','status']);assert.ok(rights.includes(event.action));assert.ok([401,403].includes(event.status));assert.equal(event.event,'authorization_denied');}
    assert.doesNotMatch(JSON.stringify(security),/password|Cookie|role|@example|rightCodes/);
  });
});
