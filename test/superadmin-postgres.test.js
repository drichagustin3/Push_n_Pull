const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { readAuthConfig } = require('../src/auth/config');
const { LAST_SUPERADMIN_MESSAGE } = require('../src/users/superadmin-guard');

test('Superadmin controls and last-account concurrency over live HTTP/PostgreSQL', {
  skip: process.env.SUPERADMIN_INTEGRATION !== '1' ? 'Opt in with SUPERADMIN_INTEGRATION=1 on an authorized isolated migrated database.' : false,
}, async (t) => {
  assert.ok(process.env.PGDATABASE === 'hopedb_auth_test' || (process.env.PGDATABASE === 'hopedb' && process.env.SUPERADMIN_ALLOW_HOPEDB_TEST === '1'));
  const pool = new Pool({ query_timeout: 5000, connectionTimeoutMillis: 5000 });
  const ids = [], servers = [], apps = [], faultPools = [];
  const prefix = `superadmin-test-${randomBytes(8).toString('hex')}`;
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    for (const app of apps) await app.locals.closeAuthStore();
    try {
      const fixtures = (await pool.query('SELECT user_id FROM app_user WHERE email LIKE $1', [prefix + '%'])).rows.map((row) => String(row.user_id));
      await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=ANY($1::text[])", [fixtures]);
      await pool.query('DELETE FROM password_reset_token WHERE user_id=ANY($1::bigint[])', [fixtures]);
      await pool.query('UPDATE user_permission SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [fixtures]);
      await pool.query('UPDATE app_user SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [fixtures]);
    } finally { for (const fault of faultPools) await fault.end(); await pool.end(); }
  });
  const activeCount = async () => (await pool.query("SELECT count(*)::integer AS count FROM app_user WHERE role='superadmin' AND status='active' AND NOT blocked AND NOT is_deleted")).rows[0].count;
  assert.equal(await activeCount(), 0, 'Use an isolated test database with no existing active Superadmins; run integration files sequentially. No real account is modified.');
  const password = 'Aa1' + randomBytes(20).toString('hex');
  const hash = await bcrypt.hash(password, 12);
  async function fixture(role = 'user', { status = 'active', blocked = false, deleted = false } = {}) {
    const email = `${prefix}-${randomBytes(6).toString('hex')}@example.test`;
    const row = (await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,role,status,blocked,is_deleted)
      VALUES('Superadmin','Fixture',$1,$2,$3,$4,$5,$6) RETURNING user_id`, [email, hash, role, status, blocked, deleted])).rows[0];
    const id = String(row.user_id); ids.push(id); return { id, email };
  }
  async function serve(backend = pool) {
    const app = createApp({ pool: backend, authConfig: config }); apps.push(app);
    const server = createServer(app); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return async (path, { method = 'GET', body, cookie, origin = config.origin, contentType = 'application/json' } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': contentType }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const cookieOf = (response) => response.headers.getSetCookie()[0]?.split(';')[0];
  const login = async (api, user) => api('/login', { method: 'POST', body: { email: user.email, password } });
  const authCookie = async (api, user) => { const res = await login(api, user); assert.equal(res.status, 200); return cookieOf(res); };
  let current = await fixture('superadmin');
  const admin = await fixture('admin'), user = await fixture('user');
  const initial = await serve();
  let currentCookie = await authCookie(initial, current);
  const adminCookie = await authCookie(initial, admin), userCookie = await authCookie(initial, user);
  async function protectedLast(api, target, cookie) {
    for (const [path, method, body] of [
      [`/api/users/${target.id}/role`, 'PUT', { role: 'user' }],
      [`/api/users/${target.id}/block`, 'PUT', { isBlocked: true }],
      [`/api/users/${target.id}/blocked`, 'PATCH', { blocked: true }],
      [`/api/users/${target.id}`, 'DELETE', {}],
    ]) {
      const res = await api(path, { method, body, cookie });
      assert.equal(res.status, 403); assert.deepEqual(await res.json(), { error: LAST_SUPERADMIN_MESSAGE });
    }
    assert.equal(await activeCount(), 1);
  }

  await t.test('Admin/User denied every Superadmin-only action; list metadata grants no authority', async () => {
    for (const cookie of [adminCookie, userCookie]) {
      for (const [suffix, method, body] of [['/approve', 'PUT', {}], ['/reject', 'PUT', {}], ['/role', 'PUT', { role: 'superadmin' }], ['', 'DELETE', {}]]) {
        assert.equal((await initial(`/api/users/${user.id}${suffix}`, { method, body, cookie })).status, 403);
      }
    }
    const list = await (await initial('/api/users?search=' + prefix, { cookie: adminCookie })).json();
    assert.ok(list.users.every((row) => !Object.hasOwn(row, 'can_approve') && !Object.hasOwn(row, 'can_change_role')));
  });
  await t.test('approve actual public signup, reject pending signup, audit actor, enforce pending/blocked eligibility', async () => {
    const api = await serve();
    async function register() {
      const email = `${prefix}-${randomBytes(6).toString('hex')}@example.test`;
      assert.equal((await api('/api/register', { method: 'POST', body: { firstName: 'Pending', lastName: 'Fixture', email, password, confirmPassword: password } })).status, 201);
      const id = String((await pool.query('SELECT user_id FROM app_user WHERE email=$1', [email])).rows[0].user_id); ids.push(id); return { email, id };
    }
    const approved = await register(), rejected = await register();
    assert.equal((await login(api, approved)).status, 403);
    const result = await api(`/api/users/${approved.id}/approve`, { method: 'PUT', body: {}, cookie: currentCookie });
    assert.equal(result.status, 200); assert.equal((await result.json()).user.status, 'active');
    assert.equal((await login(api, approved)).status, 200);
    assert.equal((await api(`/api/users/${approved.id}/approve`, { method: 'PUT', body: {}, cookie: currentCookie })).status, 409);
    assert.equal((await api(`/api/users/${rejected.id}/reject`, { method: 'PUT', body: {}, cookie: currentCookie })).status, 200);
    assert.equal((await pool.query('SELECT status FROM app_user WHERE user_id=$1', [rejected.id])).rows[0].status, 'inactive');
    assert.equal((await login(api, rejected)).status, 403);
    const pendingBlocked = await fixture('user', { status: 'pending', blocked: true });
    assert.equal((await api(`/api/users/${pendingBlocked.id}/approve`, { method: 'PUT', body: {}, cookie: currentCookie })).status, 409);
    const audit = (await pool.query("SELECT action_by,new_values FROM audit_log WHERE table_name='app_user' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [approved.id])).rows[0];
    assert.equal(audit.action_by, current.email); assert.equal(audit.new_values.status, 'active');
    assert.equal(Object.hasOwn(audit.new_values, 'password_hash'), false);
  });
  await t.test('promote/demote all roles, revoke stale sessions, audit every real role change, reject unavailable targets', async () => {
    const api = await serve();
    const target = await fixture();
    let cookie = await authCookie(api, target);
    for (const role of ['admin', 'user', 'superadmin', 'user']) {
      const result = await api(`/api/users/${target.id}/role`, { method: 'PUT', body: { role }, cookie: currentCookie });
      assert.equal(result.status, 200); assert.equal((await result.json()).user.role, role);
      assert.equal((await api('/api/v1/auth/session', { cookie })).status, 401);
      cookie = await authCookie(api, target);
      assert.equal((await api('/api/v1/auth/session', { cookie })).status, 200);
      const stored = (await pool.query("SELECT sess FROM auth_session WHERE sess->'user'->>'user_id'=$1", [target.id])).rows;
      assert.equal(stored.length, 1); assert.equal(stored[0].sess.user.role, role);
    }
    const audits = (await pool.query("SELECT action_by,new_values FROM audit_log WHERE table_name='app_user' AND record_key=$1 AND action='EDIT' ORDER BY audit_id", [target.id])).rows;
    assert.deepEqual(audits.map((row) => row.new_values.role), ['admin', 'user', 'superadmin', 'user']);
    assert.ok(audits.every((row) => row.action_by === current.email));
    for (const options of [{ status: 'pending' }, { blocked: true }, { status: 'inactive' }]) {
      const unavailable = await fixture('user', options);
      assert.equal((await api(`/api/users/${unavailable.id}/role`, { method: 'PUT', body: { role: 'admin' }, cookie: currentCookie })).status, 409);
    }
    const deleted = await fixture('user', { deleted: true });
    assert.equal((await api(`/api/users/${deleted.id}/role`, { method: 'PUT', body: { role: 'admin' }, cookie: currentCookie })).status, 404);
    assert.equal(await activeCount(), 1);
  });
  await t.test('sole active Superadmin protected on role/PUT block/PATCH block/soft-delete, excluding ineligible accounts', async () => {
    const api = await serve();
    for (const options of [{ status: 'pending' }, { blocked: true }, { status: 'inactive' }, { deleted: true }]) await fixture('superadmin', options);
    const before = (await pool.query('SELECT session_version,stamp FROM app_user WHERE user_id=$1', [current.id])).rows[0];
    await protectedLast(api, current, currentCookie);
    assert.deepEqual((await pool.query('SELECT session_version,stamp FROM app_user WHERE user_id=$1', [current.id])).rows[0], before);
    assert.equal((await api('/api/v1/auth/session', { cookie: currentCookie })).status, 200);
  });
  await t.test('with two Superadmins demotion/block/delete succeeds; remaining account stays protected; old sessions never revive', async () => {
    const api = await serve();
    const demoted = await fixture('superadmin');
    assert.equal((await api(`/api/users/${demoted.id}/role`, { method: 'PUT', body: { role: 'admin' }, cookie: currentCookie })).status, 200);
    await protectedLast(api, current, currentCookie);
    const blocked = await fixture('superadmin'); const oldCookie = await authCookie(api, blocked);
    assert.equal((await api(`/api/users/${blocked.id}/block`, { method: 'PUT', body: {}, cookie: currentCookie })).status, 200);
    assert.equal((await login(api, blocked)).status, 403);
    assert.equal((await api('/api/v1/auth/session', { cookie: oldCookie })).status, 401);
    await protectedLast(api, current, currentCookie);
    assert.equal((await api(`/api/users/${blocked.id}/blocked`, { method: 'PATCH', body: { blocked: false }, cookie: currentCookie })).status, 200);
    assert.equal(await activeCount(), 2);
    assert.equal((await api('/api/v1/auth/session', { cookie: oldCookie })).status, 401);
    assert.equal((await api(`/api/users/${blocked.id}`, { method: 'DELETE', body: {}, cookie: currentCookie })).status, 200);
    const stored = (await pool.query('SELECT is_deleted,status FROM app_user WHERE user_id=$1', [blocked.id])).rows[0];
    assert.deepEqual(stored, { is_deleted: true, status: 'inactive' });
    const audit = (await pool.query("SELECT action,action_by FROM audit_log WHERE table_name='app_user' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [blocked.id])).rows[0];
    assert.equal(audit.action, 'DELETE'); assert.equal(audit.action_by, current.email);
    await protectedLast(api, current, currentCookie);
  });
  await t.test('soft deletion preserves active permission dependencies; malformed/origin requests fail safely', async () => {
    const api = await serve(); const target = await fixture();
    await pool.query("INSERT INTO user_permission(user_id,right_code) SELECT $1,right_code FROM rights_catalogue WHERE NOT is_deleted LIMIT 1", [target.id]);
    assert.equal((await api(`/api/users/${target.id}`, { method: 'DELETE', body: {}, cookie: currentCookie })).status, 409);
    for (const body of [{}, { role: 'owner' }, { role: 'admin', status: 'active' }]) assert.equal((await api(`/api/users/${target.id}/role`, { method: 'PUT', body, cookie: currentCookie })).status, 400);
    assert.equal((await api(`/api/users/${target.id}/role`, { method: 'PUT', body: { role: 'admin' }, cookie: currentCookie, origin: 'https://other.example' })).status, 403);
    assert.equal((await api(`/api/users/${target.id}/role`, { method: 'PUT', body: { role: 'admin' }, cookie: currentCookie, contentType: 'text/plain' })).status, 415);
    assert.equal((await api(`/api/users/${target.id}/approve`, { method: 'PUT', body: { status: 'active' }, cookie: currentCookie })).status, 400);
    assert.equal((await pool.query('SELECT is_deleted FROM app_user WHERE user_id=$1', [target.id])).rows[0].is_deleted, false);
  });
  await t.test('actual PostgreSQL mutation failure returns safe errors without changing accounts', async () => {
    const fault = new Pool({ options: '-c search_path=pg_catalog', query_timeout: 5000 }); faultPools.push(fault);
    const api = await serve({ query: (sql, values) => pool.query(sql, values), connect: () => fault.connect() });
    const response = await api(`/api/users/${user.id}/role`, { method: 'PUT', body: { role: 'admin' }, cookie: currentCookie });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'User Management is temporarily unavailable. Try again later.' });
    assert.equal((await pool.query('SELECT role FROM app_user WHERE user_id=$1', [user.id])).rows[0].role, 'user');
  });
  await t.test('concurrent self-demotion/block/delete on different rows can never remove both active Superadmins', async () => {
    const operations = [
      [ ['/role', 'PUT', { role: 'user' }], ['/block', 'PUT', { isBlocked: true }] ],
      [ ['/block', 'PUT', { isBlocked: true }], ['', 'DELETE', {}] ],
      [ ['', 'DELETE', {}], ['/role', 'PUT', { role: 'user' }] ],
    ];
    for (const pair of operations) {
      const api = await serve(); const second = await fixture('superadmin');
      const actors = [current, second]; const cookies = [await authCookie(api, current), await authCookie(api, second)];
      assert.equal(await activeCount(), 2);
      const results = await Promise.all(pair.map(([suffix, method, body], index) => api(`/api/users/${actors[index].id}${suffix}`, { method, body, cookie: cookies[index] })));
      assert.deepEqual(results.map((res) => res.status).sort(), [200, 403]);
      assert.equal(await activeCount(), 1);
      const survivor = (await pool.query("SELECT user_id,email FROM app_user WHERE role='superadmin' AND status='active' AND NOT blocked AND NOT is_deleted")).rows[0];
      current = { id: String(survivor.user_id), email: survivor.email };
      currentCookie = await authCookie(api, current);
      await protectedLast(api, current, currentCookie);
    }
  });
});
