const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Customer writes: real authentication, target contract, audit atomicity and incompatible-schema rejection', {
  skip: process.env.CUSTOMER_WRITES_INTEGRATION !== '1' ? 'Requires the fresh disposable customer forms runner.' : false,
}, async (t) => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_customer_test');
  const pool = new Pool({ max: 1, query_timeout: 5000, connectionTimeoutMillis: 5000 });
  let app, server;
  t.after(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await app?.locals.closeAuthStore(); await pool.end(); });
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_user')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM customer')).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password, 12), actors = {};
  for (const kind of ['add', 'edit', 'none', 'admin', 'superadmin']) {
    actors[kind] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Forms','Fixture',$1,$2,$3,'active') RETURNING user_id,email", [`cf-${kind}@example.test`, hash, ['admin', 'superadmin'].includes(kind) ? kind : 'user'])).rows[0];
    if (['add', 'edit'].includes(kind)) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)', [actors[kind].user_id, 'customer.' + kind]);
  }
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config }); server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = (url, cookie, method = 'GET', body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, {
    method, headers: { Origin: config.origin, Accept: 'application/json', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookies = {};
  for (const kind of Object.keys(actors)) {
    const res = await request('/login', null, 'POST', { email: actors[kind].email, password }); assert.equal(res.status, 200); cookies[kind] = res.headers.getSetCookie()[0].split(';')[0];
  }
  const payload = { custNo: 'F0001', custName: 'Customer One', address: 'Sample City', payTerms: 'Net 30' };
  const create = (body = payload, who = 'admin') => request('/api/customers', cookies[who], 'POST', body);
  const edit = (id, body, who = 'edit') => request('/api/customers/' + encodeURIComponent(id), cookies[who], 'PUT', body);
  const audits = async (id) => (await pool.query("SELECT action,action_by,record_key,old_values,new_values FROM audit_log WHERE table_name='customer' AND record_key=$1 ORDER BY audit_id", [id])).rows;
  const state = async () => (await pool.query("SELECT (SELECT count(*) FROM customer)::text AS customers,(SELECT count(*) FROM audit_log WHERE table_name='customer')::text AS audits")).rows[0];
  await t.test('anonymous/exact-action/CSRF/media-type checks reject before mutation', async () => {
    const before = await state();
    assert.equal((await request('/api/customers', null, 'POST', payload)).status, 401);
    for (const who of ['none', 'edit']) assert.equal((await create(payload, who)).status, 403);
    assert.equal((await request('/api/customers', cookies.admin, 'POST', payload, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await request('/api/customers', cookies.admin, 'POST', payload, { 'Content-Type': 'text/plain' })).status, 415);
    assert.deepEqual(await state(), before);
  });
  await t.test('current schema is rejected without committed rows or audit events', async () => {
    const before = await state(), res = await create(); assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'customer_schema_unavailable'); assert.deepEqual(await state(), before);
  });
  // Target contract fixture only. This is NOT an official migration, deployment
  // claim or authorization to change the shared database. It exercises Issue #73.
  await pool.query(`ALTER TABLE customer ALTER COLUMN custname TYPE varchar(100), ALTER COLUMN stamp TYPE text;
    ALTER TABLE customer DROP CONSTRAINT pay_ck;
    ALTER TABLE customer ADD CONSTRAINT pay_ck CHECK(payterm IN ('COD','15D','30D','45D','PRE'));
    CREATE FUNCTION public.customer_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $fixture$
    BEGIN
      IF TG_OP='INSERT' THEN NEW.stamp:=public.audit_stamp('CREATED');
      ELSIF (to_jsonb(OLD)-'stamp') IS DISTINCT FROM (to_jsonb(NEW)-'stamp') THEN NEW.stamp:=public.audit_stamp('EDITED');
      ELSE NEW.stamp:=OLD.stamp; END IF;
      RETURN NEW;
    END $fixture$;
    DROP TRIGGER customer_biu_stamp ON customer;
    CREATE TRIGGER customer_biu_stamp BEFORE INSERT OR UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION public.customer_set_stamp();`);
  await t.test('official name length and all five payment labels round-trip in target fixture', async () => {
    for (const [i, label] of ['COD', 'Net 15', 'Net 30', 'Net 45', 'Prepaid'].entries()) {
      const id = 'P000' + i; const res = await create({ ...payload, custNo: id, custName: 'n'.repeat(100), payTerms: label });
      assert.equal(res.status, 201); const body = await res.json(); assert.equal(body.customer.custname.length, 100); assert.match(body.customer.stamp, /^CREATED cf-admin@example.test \d{4}-\d{2}-\d{2} \d{2}:\d{2} (AM|PM)$/);
      assert.equal(body.customer.status, 'active');
    }
  });
  await t.test('create stores active customer; one auditable ADD has authenticated actor, record and timestamp', async () => {
    const res = await create(payload, 'add'); assert.equal(res.status, 201);
    const body = await res.json(); assert.deepEqual(Object.keys(body.customer).sort(), ['address', 'custname', 'custno', 'payterm']);
    const rows = await audits('F0001'); assert.equal(rows.length, 1); assert.equal(rows[0].action, 'ADD'); assert.equal(rows[0].action_by, actors.add.email); assert.equal(rows[0].old_values, null); assert.equal(rows[0].new_values.is_deleted, false);
    assert.equal((await pool.query("SELECT action_at IS NOT NULL AS stamped FROM audit_log WHERE table_name='customer' AND record_key='F0001'")).rows[0].stamped, true);
  });
  await t.test('duplicate including inactive customers returns safe 409; invalid/system fields return 400', async () => {
    const before = await state(); assert.equal((await create()).status, 409);
    for (const body of [{ ...payload, custName: 'x'.repeat(101) }, { ...payload, payTerms: 'Unknown' }, { ...payload, stamp: 'spoof' }, { ...payload, status: 'inactive' }]) assert.equal((await create(body)).status, 400);
    assert.deepEqual(await state(), before);
    await pool.query("INSERT INTO customer(custno,custname,payterm,is_deleted) VALUES('D0001','Archived','COD',true)");
    assert.equal((await create({ ...payload, custNo: 'D0001' })).status, 409);
  });
  await t.test('edit updates fields with exact right, EDITED stamp and one correct before/after audit', async () => {
    const body = { custName: 'Edited Customer', address: 'New City', payTerms: 'Prepaid' };
    assert.equal((await edit('F0001', body, 'add')).status, 403);
    assert.equal((await edit('F0001', body)).status, 200);
    const rows = await audits('F0001'); assert.equal(rows.length, 2); assert.equal(rows[1].action, 'EDIT'); assert.equal(rows[1].action_by, actors.edit.email);
    assert.equal(rows[1].old_values.custname, 'Customer One'); assert.equal(rows[1].new_values.custname, 'Edited Customer'); assert.equal(rows[1].new_values.payterm, 'PRE'); assert.match(rows[1].new_values.stamp, /^EDITED cf-edit@example.test /);
    assert.equal((await edit('F0001', { ...body, custNo: 'NEW' })).status, 400);
    assert.equal((await edit('D0001', body)).status, 404); assert.equal((await edit('MISS', body)).status, 404);
    assert.equal((await edit('F0001', body)).status, 200); assert.equal((await audits('F0001')).length, 2, 'No-op save produces no duplicate audit');
  });
  await t.test('parameterized text cannot change SQL structure or become executable customer data', async () => {
    const name = "O'Neil <b>Demo</b>", address = "x'); DROP TABLE customer; --";
    const res = await create({ custNo: 'Q0001', custName: name, address, payTerms: 'COD' }); assert.equal(res.status, 201);
    const row = (await pool.query("SELECT custname,address FROM customer WHERE custno='Q0001'")).rows[0]; assert.equal(row.custname, name); assert.equal(row.address, address);
    assert.equal((await request('/api/customers', cookies.admin)).status, 200);
  });
  await t.test('full authenticated actor survives long stamp values without truncation', async () => {
    const email = 'l'.repeat(50) + '@example.test';
    await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Long','Fixture',$1,$2,'admin','active')", [email, hash]);
    const login = await request('/login', null, 'POST', { email, password }); assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie()[0].split(';')[0];
    const res = await request('/api/customers', cookie, 'POST', { ...payload, custNo: 'L0001' }); assert.equal(res.status, 201);
    const body = await res.json(); assert.ok(body.customer.stamp.startsWith('CREATED ' + email + ' ')); assert.ok(body.customer.stamp.length > 60);
    assert.equal((await audits('L0001'))[0].action_by, email);
  });
  await t.test('audit insertion failure rolls back the customer mutation atomically', async () => {
    await pool.query(`CREATE FUNCTION public.customer_fixture_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.table_name='customer' AND NEW.record_key='X0004' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END$$;
      CREATE TRIGGER customer_fixture_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION public.customer_fixture_audit_failure();`);
    const before = await state();
    try { assert.equal((await create({ ...payload, custNo: 'X0004' })).status, 503); assert.deepEqual(await state(), before); }
    finally { await pool.query('DROP TRIGGER customer_fixture_failure ON audit_log; DROP FUNCTION public.customer_fixture_audit_failure()'); }
  });
  await t.test('missing audit coverage and wrong stamp behavior roll back, rather than bypassing triggers', async () => {
    let faultApp, faultServer;
    try {
      // Simulate missing catalog coverage without disabling/dropping any audit trigger.
      const scoped = { query: pool.query.bind(pool), connect: async () => {
        const client = await pool.connect();
        return { query: async (sql, args) => {
          const result = await client.query(sql, args);
          return sql.includes('FROM pg_trigger') ? { ...result, rows: result.rows.filter(row => row.tgname !== 'customer_aiu_audit') } : result;
        }, release: () => client.release() };
      } };
      faultApp = createApp({ pool: scoped, authConfig: config }); faultServer = createServer(faultApp); faultServer.listen(0, '127.0.0.1'); await once(faultServer, 'listening');
      const res = await fetch(`http://127.0.0.1:${faultServer.address().port}/api/customers`, { method: 'POST', headers: { Origin: config.origin, Cookie: cookies.admin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, custNo: 'X0001' }) });
      assert.equal(res.status, 503); assert.equal((await pool.query("SELECT count(*)::int AS n FROM customer WHERE custno='X0001'")).rows[0].n, 0);
    } finally { if (faultServer) await new Promise(r => { faultServer.close(r); faultServer.closeAllConnections(); }); await faultApp?.locals.closeAuthStore(); }
    const before = await state();
    const correctStamp = (await pool.query("SELECT pg_get_functiondef('public.customer_set_stamp()'::regprocedure) AS definition")).rows[0].definition;
    await pool.query('CREATE OR REPLACE FUNCTION public.customer_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.stamp:=public.audit_stamp(\'ADD\'); RETURN NEW; END$$');
    assert.equal((await create({ ...payload, custNo: 'X0002' })).status, 503); assert.deepEqual(await state(), before);
    await pool.query(correctStamp);
  });
  await t.test('permission revocation and blocking deny subsequent writes; rollback clears pooled actor', async () => {
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1', [actors.add.user_id]);
    assert.equal((await create({ ...payload, custNo: 'X0003' }, 'add')).status, 403);
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1', [actors.edit.user_id]);
    assert.equal((await edit('F0001', { custName: 'Blocked', address: '', payTerms: 'COD' })).status, 403);
    const client = await pool.connect(); try { const value = (await client.query("SELECT nullif(current_setting('app.username',true),'') AS actor")).rows[0].actor; assert.equal(value, null); } finally { client.release(); }
    assert.equal((await request('/api/customers', cookies.admin)).status, 200);
  });
});
