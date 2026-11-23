const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');
const { changeCustomerState } = require('../src/customers/mutations');

test('Customer state transitions: isolated SQL, history, roles, concurrency, audit and rollback', {
  skip: process.env.CUSTOMER_STATES_INTEGRATION !== '1' ? 'Requires fresh disposable state-transition runner.' : false,
}, async (t) => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb_customer_test');
  const pool = new Pool({ max: 6, query_timeout: 5000, connectionTimeoutMillis: 5000 }); let server, app;
  t.after(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); await app?.locals.closeAuthStore(); await pool.end(); });
  assert.equal((await pool.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local, true);
  for (const table of ['customer', 'app_user', 'sales']) assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(16).toString('hex'), hash = await bcrypt.hash(password, 12), people = {};
  for (const role of ['admin', 'superadmin', 'delete', 'edit', 'none']) {
    people[role] = (await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('State','Fixture',$1,$2,$3,'active') RETURNING user_id,email,session_version", [`cs-${role}@example.test`, hash, ['admin','superadmin'].includes(role) ? role : 'user'])).rows[0];
    if (['delete','edit'].includes(role)) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES($1,$2)', [people[role].user_id, 'customer.' + role]);
  }
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config }); server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = (url, who = 'admin', method = 'GET', body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, {
    method, headers: { Origin: config.origin, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookies[who] ? { Cookie: cookies[who] } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const cookies = {};
  for (const who of Object.keys(people)) {
    const login = await request('/login', who, 'POST', { email: people[who].email, password }); assert.equal(login.status, 200); cookies[who] = login.headers.getSetCookie()[0].split(';')[0];
  }
  await pool.query("INSERT INTO customer(custno,custname,address,payterm) VALUES('S0001','State Customer','Synthetic City','COD'),('S0002','History Customer','History City','30D'),('S0003','Race Customer','Race City','COD')");
  const state = async (id = 'S0001') => (await pool.query('SELECT * FROM customer WHERE custno=$1', [id])).rows[0];
  const audit = async (id = 'S0001') => (await pool.query("SELECT action,action_by,action_at,old_values,new_values FROM audit_log WHERE table_name='customer' AND record_key=$1 ORDER BY audit_id", [id])).rows;
  const remove = (id = 'S0001', who = 'admin', body) => request('/api/customers/' + encodeURIComponent(id), who, 'DELETE', body);
  const restore = (id = 'S0001', who = 'admin', body) => request('/api/customers/' + encodeURIComponent(id) + '/restore', who, 'PUT', body);
  const targetStamp = `CREATE FUNCTION public.customer_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='INSERT' THEN NEW.stamp:=public.audit_stamp('CREATED');
      ELSIF (to_jsonb(OLD)-'stamp') IS NOT DISTINCT FROM (to_jsonb(NEW)-'stamp') THEN NEW.stamp:=OLD.stamp;
      ELSIF NEW.is_deleted AND NOT OLD.is_deleted THEN NEW.stamp:=public.audit_stamp('DELETED');
      ELSIF NOT NEW.is_deleted AND OLD.is_deleted THEN NEW.stamp:=public.audit_stamp('RESTORED');
      ELSE NEW.stamp:=public.audit_stamp('EDITED'); END IF; RETURN NEW; END$$;`;
  await t.test('legacy schema/stamps fail safely without state or audit changes', async () => {
    const before = await state(), records = await audit(); assert.equal((await remove()).status, 503); assert.deepEqual(await state(), before); assert.deepEqual(await audit(), records);
    await pool.query('ALTER TABLE customer ALTER COLUMN stamp TYPE text');
    assert.equal((await remove()).status, 503); assert.deepEqual(await state(), before); assert.deepEqual(await audit(), records);
  });
  // Target fixture only, not an official/shared migration. Name stays varchar(20)
  // to prove DEV-03 has no irrelevant dependency on DEV-02's name widening.
  await pool.query(targetStamp + 'DROP TRIGGER customer_biu_stamp ON customer; CREATE TRIGGER customer_biu_stamp BEFORE INSERT OR UPDATE ON customer FOR EACH ROW EXECUTE FUNCTION public.customer_set_stamp();');
  await t.test('unauthenticated, wrong-right and User restore attempts are denied, including direct service role recheck', async () => {
    assert.equal((await remove('S0001', 'anonymous')).status, 401);
    for (const who of ['edit', 'none']) assert.equal((await remove('S0001', who)).status, 403);
    assert.equal((await restore('S0001', 'delete')).status, 403);
    await assert.rejects(changeCustomerState(pool, { user: { user_id: people.delete.user_id }, version: 0 }, 'S0001', true), e => e.status === 403);
    assert.equal((await request('/api/customers/S0001', 'admin', 'DELETE', {}, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await remove('S0001', 'admin', { role: 'superadmin' })).status, 400);
    assert.equal((await remove('123456')).status, 400); assert.equal((await request('/api/customers/%ZZ', 'admin', 'DELETE')).status, 400);
  });
  await t.test('User deletion changes only state/stamp, keeps row, and produces one authenticated DELETE audit', async () => {
    const before = await state(), history = await audit(); const res = await remove('S0001', 'delete'); assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { customer: { custno: 'S0001' }, status: 'inactive' });
    const after = await state(); assert.equal(after.is_deleted, true); for (const key of ['custno','custname','address','payterm']) assert.equal(after[key], before[key]);
    assert.match(after.stamp, /^DELETED cs-delete@example.test \d{4}-\d{2}-\d{2} \d{2}:\d{2} (AM|PM)$/);
    const rows = await audit(); assert.equal(rows.length, history.length + 1); assert.equal(rows.at(-1).action, 'DELETE'); assert.equal(rows.at(-1).action_by, people.delete.email); assert.ok(rows.at(-1).action_at); assert.equal(rows.at(-1).old_values.is_deleted, false); assert.equal(rows.at(-1).new_values.is_deleted, true);
  });
  await t.test('list visibility/counts reflect inactive state and privileged restoration', async () => {
    const user = await (await request('/api/customers?status=all', 'delete')).json(); assert.equal(user.customers.some(c => c.custno === 'S0001'), false); assert.equal(Object.hasOwn(user, 'counts'), false);
    const admin = await (await request('/api/customers?status=all')).json(); assert.deepEqual(admin.counts, { active: 2, inactive: 1, all: 3 });
    assert.equal((await remove()).status, 400); assert.equal((await remove('MISS')).status, 404); assert.equal((await restore('MISS')).status, 404);
    const res = await restore('S0001', 'superadmin'); assert.equal(res.status, 200); const body = await res.json(); assert.equal(body.status, 'active'); assert.match(body.customer.stamp, /^RESTORED cs-superadmin@example.test /);
    assert.equal((await audit()).at(-1).action, 'RESTORE'); assert.equal((await audit()).at(-1).action_by, people.superadmin.email);
    assert.equal((await restore()).status, 400); assert.equal((await (await request('/api/customers?status=active', 'delete')).json()).customers.length, 3);
  });
  await t.test('active children block deletion; inactive history is retained with foreign keys through delete/restore', async () => {
    await pool.query("INSERT INTO sales(transno,custno,salesdate,is_deleted) VALUES('STATE001','S0002',CURRENT_DATE,false)");
    const before = await state('S0002'), history = await audit('S0002'); assert.equal((await remove('S0002')).status, 409); assert.deepEqual(await state('S0002'), before); assert.deepEqual(await audit('S0002'), history);
    await pool.query("UPDATE sales SET is_deleted=true WHERE transno='STATE001'"); const oldSale = (await pool.query("SELECT * FROM sales WHERE transno='STATE001'")).rows[0];
    assert.equal((await remove('S0002')).status, 200); assert.equal((await restore('S0002')).status, 200);
    assert.deepEqual((await pool.query("SELECT * FROM sales WHERE transno='STATE001'")).rows[0], oldSale);
  });
  await t.test('in-flight sales writes finish before dependency checking; newly committed active child blocks deletion', async () => {
    await pool.query("INSERT INTO customer(custno,custname,payterm) VALUES('S0004','Pending Child','COD')");
    const writer = await pool.connect(); let pending;
    try {
      await writer.query('BEGIN'); await writer.query("INSERT INTO sales(transno,custno,is_deleted) VALUES('STATE002','S0004',false)");
      pending = remove('S0004'); let waiting = false;
      for (let i = 0; i < 100; ++i) {
        waiting = (await pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE query='LOCK TABLE public.sales IN SHARE MODE' AND wait_event_type='Lock') AS waiting")).rows[0].waiting;
        if (waiting) break;
        await new Promise(r => setTimeout(r, 10));
      }
      assert.equal(waiting, true); await writer.query('COMMIT'); assert.equal((await pending).status, 409);
      assert.equal((await state('S0004')).is_deleted, false);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM sales WHERE transno='STATE002' AND custno='S0004'")).rows[0].n, 1);
    } finally { await writer.query('ROLLBACK').catch(() => {}); writer.release(); if (pending) await pending; }
  });
  await t.test('missing child-guard metadata fails closed without disabling the actual trigger', async () => {
    const before = await state('S0003'), records = await audit('S0003');
    const scoped = { connect: async () => { const client = await pool.connect(); return { release: () => client.release(), query: (sql, args) => sql.includes("t.tgname='customer_bu_check'") ? Promise.resolve({ rows: [] }) : client.query(sql, args) }; } };
    await assert.rejects(changeCustomerState(scoped, { user: { user_id: people.superadmin.user_id }, version: 0 }, 'S0003', false), e => e.status === 503);
    assert.deepEqual(await state('S0003'), before); assert.deepEqual(await audit('S0003'), records);
  });
  await t.test('concurrent identical deletes/restores serialize to one success and one 400 with no duplicate audits', async () => {
    const before = (await audit('S0003')).length;
    const deletes = await Promise.all([remove('S0003'), remove('S0003')]); assert.deepEqual(deletes.map(r => r.status).sort(), [200,400]); assert.equal((await audit('S0003')).length, before + 1);
    const restores = await Promise.all([restore('S0003'), restore('S0003')]); assert.deepEqual(restores.map(r => r.status).sort(), [200,400]); assert.equal((await audit('S0003')).length, before + 2); assert.equal((await state('S0003')).is_deleted, false);
  });
  await t.test('failed audit insertion rolls back state and stamp, preserving earlier audit history', async () => {
    await pool.query(`CREATE FUNCTION public.state_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.table_name='customer' AND NEW.record_key='S0003' AND NEW.action='DELETE' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END$$;
      CREATE TRIGGER state_fixture_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION public.state_fixture_failure();`);
    const before = await state('S0003'), history = await audit('S0003');
    try { const res = await remove('S0003'); assert.equal(res.status, 503); assert.doesNotMatch(JSON.stringify(await res.json()), /fixture|SQL/); assert.deepEqual(await state('S0003'), before); assert.deepEqual(await audit('S0003'), history); }
    finally { await pool.query('DROP TRIGGER state_fixture_failure ON audit_log; DROP FUNCTION public.state_fixture_failure()'); }
  });
  await t.test('revoked delete rights and blocked actors cannot mutate customer state', async () => {
    const before = await state();
    await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=$1', [people.delete.user_id]); assert.equal((await remove('S0001', 'delete')).status, 403);
    await pool.query('UPDATE app_user SET blocked=true WHERE user_id=$1', [people.admin.user_id]); assert.equal((await remove()).status, 403); assert.deepEqual(await state(), before);
  });
});
