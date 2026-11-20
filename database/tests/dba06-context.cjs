// DBA-06 tests import unchanged Developer consumers from an isolated checkout.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const path = require('node:path');
const { randomBytes, createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');

test('Logged-in actor attribution, secret scrubbing and pooled transaction isolation', {
  skip: process.env.DBA06_CONTEXT_INTEGRATION !== '1' ? 'Requires isolated Unix-socket hopedb and DBA06_APP_ROOT.' : false,
}, async (t) => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb' && process.env.DBA06_APP_ROOT);
  const consumer = createRequire(path.join(process.env.DBA06_APP_ROOT, 'package.json'));
  const { Pool } = consumer('pg');
  const bcrypt = consumer('bcrypt');
  const { createApp } = consumer('./src/app');
  const { readAuthConfig } = consumer('./src/auth/config');
  const pool = new Pool({ max: 1, connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const pids = new Set(), ids = [];
  pool.on('connect', (client) => pids.add(client.processID));
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const app = createApp({ pool, authConfig: config });
  const server = createServer(app);
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    app.locals.closeAuthStore();
    try {
      await pool.query('UPDATE user_permission SET is_deleted=true WHERE user_id=ANY($1::bigint[])', [ids]);
      await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=ANY($1::text[])", [ids]);
      await pool.query('UPDATE app_user SET is_deleted=true WHERE user_id=ANY($1::bigint[])', [ids]);
    } finally { await pool.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const baseline = (await pool.query('SELECT session_user::text AS actor,pg_backend_pid() AS pid')).rows[0];
  const password = 'Aa1' + randomBytes(20).toString('hex');
  const hash = await bcrypt.hash(password, 12);
  const prefix = 'dba06-' + randomBytes(10).toString('hex');
  async function request(route, { method = 'GET', body, cookie } = {}) {
    return fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method, headers: { Origin: config.origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  const cookieOf = (response) => response.headers.getSetCookie()[0].split(';')[0];
  async function actor(suffix) {
    const email = `${prefix}-${suffix}@example.test`;
    const id = String((await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('DBA06','Synthetic',$1,$2,'admin','active') RETURNING user_id", [email, hash])).rows[0].user_id);
    ids.push(id);
    const response = await request('/login', { method: 'POST', body: { email, password } });
    assert.equal(response.status, 200);
    return { id, email, cookie: cookieOf(response) };
  }
  const a = await actor('a'), b = await actor('b');
  let target;
  const lastEvent = async (table, key) => (await pool.query('SELECT * FROM audit_log WHERE table_name=$1 AND record_key=$2 ORDER BY audit_id DESC LIMIT 1', [table, key])).rows[0];
  const countEvents = async () => (await pool.query('SELECT count(*)::integer AS n FROM audit_log')).rows[0].n;
  const scrubbed = (row) => !row || !['password_hash','setup_token_hash','setup_token_expires_at','reset_token_hash'].some((key) => Object.hasOwn(row, key));
  async function noLeak() {
    const row = (await pool.query('SELECT public.audit_user() AS actor,pg_backend_pid() AS pid')).rows[0];
    assert.ok(row.actor === baseline.actor && row.pid === baseline.pid, 'Reused connection must have database fallback outside the request transaction');
    assert.equal(pids.size, 1);
  }
  await t.test('User A INSERT/UPDATE are attributed to the authenticated account with OLD/NEW/stamp and no-op suppression', async () => {
    const email = `${prefix}-target@example.test`;
    const body = { firstName: 'Pool', lastName: 'Created', email, password, confirmPassword: password };
    const response = await request('/api/users', { method: 'POST', body, cookie: a.cookie });
    assert.equal(response.status, 201);
    target = { id: String((await response.json()).user.user_id), email };
    ids.push(target.id);
    let event = await lastEvent('app_user', target.id);
    assert.ok(event.action === 'ADD' && event.action_by === a.email && event.old_values === null && event.new_values.last_name === 'Created');
    assert.ok(scrubbed(event.new_values) && event.action_at && event.new_values.stamp.startsWith('ADD ' + a.email + ' '));
    await noLeak();
    const profile = { firstName: 'Pool', lastName: 'A Changed', email };
    assert.equal((await request('/api/users/' + target.id, { method: 'PUT', body: profile, cookie: a.cookie })).status, 200);
    event = await lastEvent('app_user', target.id);
    assert.ok(event.action === 'EDIT' && event.action_by === a.email && event.old_values.last_name === 'Created' && event.new_values.last_name === 'A Changed');
    assert.ok(event.new_values.stamp.startsWith('EDIT ' + a.email + ' '));
    const n = await countEvents();
    assert.equal((await request('/api/users/' + target.id, { method: 'PUT', body: profile, cookie: a.cookie })).status, 200);
    assert.equal(await countEvents(), n);
    await noLeak();
  });
  await t.test('User B reuses the physical connection with correct rights grant/revocation attribution and no client actor override', async () => {
    assert.ok(target);
    const endpoint = '/api/users/' + target.id + '/rights';
    const before = await countEvents();
    assert.equal((await request(endpoint, { method: 'PUT', body: { rightCodes: ['customer.add'] }, cookie: b.cookie })).status, 200);
    let event = await lastEvent('user_permission', target.id + '|customer.add');
    assert.ok(event.action === 'ADD' && event.action_by === b.email && event.old_values === null);
    assert.equal(await countEvents(), before + 1, 'Permission grant must not create a duplicate account event');
    assert.equal((await request(endpoint, { method: 'PUT', body: { rightCodes: [] }, cookie: b.cookie })).status, 200);
    event = await lastEvent('user_permission', target.id + '|customer.add');
    assert.ok(event.action === 'DELETE' && event.action_by === b.email && event.old_values.is_deleted === false && event.new_values.is_deleted === true);
    assert.ok(event.new_values.stamp.startsWith('DELETE ' + b.email + ' '));
    assert.equal(await countEvents(), before + 2);
    const profile = { firstName: 'Pool', lastName: 'B Changed', email: target.email };
    assert.equal((await request('/api/users/' + target.id, { method: 'PUT', body: { ...profile, action_by: a.email }, cookie: b.cookie })).status, 400);
    assert.equal(await countEvents(), before + 2);
    assert.equal((await request('/api/users/' + target.id, { method: 'PUT', body: profile, cookie: b.cookie })).status, 200);
    event = await lastEvent('app_user', target.id);
    assert.ok(event.action_by === b.email && event.old_values.last_name === 'A Changed' && event.new_values.last_name === 'B Changed');
    await noLeak();
  });
  await t.test('Permitted hard DELETE uses User A and scrubbed OLD data; system mutation afterward uses database fallback', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.username',$1,true)", [a.email]);
      await client.query('CREATE TEMP TABLE dba06_delete_probe(probe_code text PRIMARY KEY,label text) ON COMMIT DROP');
      await client.query('CREATE TRIGGER dba06_probe AFTER INSERT OR UPDATE OR DELETE ON dba06_delete_probe FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()');
      await client.query("INSERT INTO dba06_delete_probe VALUES($1,'before')", [prefix]);
      await client.query("UPDATE dba06_delete_probe SET label='after'");
      await client.query('DELETE FROM dba06_delete_probe');
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    const events = (await pool.query("SELECT * FROM audit_log WHERE table_name='dba06_delete_probe' AND record_key=$1 ORDER BY audit_id", [prefix])).rows;
    assert.deepEqual(events.map((event) => event.action), ['ADD','EDIT','DELETE']);
    assert.ok(events.every((event) => event.action_by === a.email));
    assert.ok(events[2].old_values.label === 'after' && events[2].new_values === null);
    await noLeak();
    await pool.query("UPDATE app_user SET first_name='System' WHERE user_id=$1", [target.id]);
    assert.ok((await lastEvent('app_user', target.id)).action_by === baseline.actor);
  });
  await t.test('Post-mutation failure rolls back data, log entry and actor before connection reuse', async () => {
    const before = await countEvents();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.username',$1,true)", [a.email]);
      await client.query("UPDATE app_user SET last_name='MustRollback' WHERE user_id=$1", [target.id]);
      assert.equal((await client.query('SELECT count(*)::integer AS n FROM audit_log')).rows[0].n, before + 1);
      await client.query('SELECT 1/0');
      assert.fail('Expected controlled failure');
    } catch (error) {
      await client.query('ROLLBACK');
      assert.equal(error.code, '22012');
    } finally { client.release(); }
    assert.equal(await countEvents(), before);
    assert.ok((await pool.query('SELECT last_name FROM app_user WHERE user_id=$1', [target.id])).rows[0].last_name === 'B Changed');
    await noLeak();
  });
  await t.test('Actual first-password mutation and other account secret fields never enter audit snapshots', async () => {
    const response = await request('/login', { method: 'POST', body: { email: target.email, password } });
    assert.equal(response.status, 200);
    const next = 'Bb2' + randomBytes(20).toString('hex');
    const setup = await request('/set-password', { method: 'POST', body: { new_password: next, confirm_password: next }, cookie: cookieOf(response) });
    assert.equal(setup.status, 200);
    let event = await lastEvent('app_user', target.id);
    assert.ok(event.action_by === target.email && scrubbed(event.old_values) && scrubbed(event.new_values));
    const stored = (await pool.query('SELECT password_hash FROM app_user WHERE user_id=$1', [target.id])).rows[0];
    assert.ok(await bcrypt.compare(next, stored.password_hash), 'Runtime-generated fixture password must be hashed');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.username',$1,true)", [a.email]);
      const digest = createHash('sha256').update(randomBytes(32)).digest('hex');
      await client.query("UPDATE app_user SET must_change_password=true,setup_token_hash=$1,setup_token_expires_at=now()+interval '1 hour' WHERE user_id=$2", [digest, target.id]);
      const row = (await client.query("SELECT * FROM audit_log WHERE table_name='app_user' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [target.id])).rows[0];
      assert.ok(row.action_by === a.email && scrubbed(row.old_values) && scrubbed(row.new_values));
      await client.query('ROLLBACK');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    await noLeak();
  });
});
