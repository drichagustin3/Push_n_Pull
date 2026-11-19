const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { readAuthConfig } = require('../src/auth/config');

test('User Management over live Express and PostgreSQL', {
  skip: process.env.USERS_INTEGRATION !== '1' ? 'Opt in with USERS_INTEGRATION=1 and an authorized local database.' : false,
}, async (t) => {
  assert.ok(process.env.PGDATABASE === 'hopedb_auth_test' || (process.env.PGDATABASE === 'hopedb' && process.env.USERS_ALLOW_HOPEDB_TEST === '1'));
  const pool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const ids = [], prefix = `manage-${randomBytes(8).toString('hex')}`;
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const app = createApp({ pool, authConfig: config });
  const server = createServer(app);
  const faultPools = [], faultApps = [], faultServers = [];
  t.after(async () => {
    for (const srv of [server, ...faultServers]) await new Promise((resolve) => { srv.close(resolve); srv.closeAllConnections(); });
    for (const a of [app, ...faultApps]) await a.locals.closeAuthStore();
    try {
      // Includes API-created accounts even if an assertion failed before recording their ids.
      const fixtures = await pool.query('SELECT user_id FROM app_user WHERE email LIKE $1', [prefix + '%']);
      const cleanup = [...new Set([...ids, ...fixtures.rows.map((row) => String(row.user_id))])];
      await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=ANY($1::text[])", [cleanup]);
      await pool.query('DELETE FROM password_reset_token WHERE user_id=ANY($1::bigint[])', [cleanup]);
      await pool.query('UPDATE app_user SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [cleanup]);
    } finally { for (const p of faultPools) await p.end(); await pool.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const password = 'Aa1' + randomBytes(20).toString('hex');
  const replacement = 'Bb2' + randomBytes(20).toString('hex');
  const hash = await bcrypt.hash(password, 12);
  async function fixture(role, { deleted = false, status = 'active', blocked = false } = {}) {
    const email = `${prefix}-${randomBytes(6).toString('hex')}@example.test`;
    const row = (await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,role,status,blocked,is_deleted)
      VALUES('Manager','Fixture',$1,$2,$3,$4,$5,$6) RETURNING user_id`, [email, hash, role, status, blocked, deleted])).rows[0];
    const id = String(row.user_id); ids.push(id); return { id, email };
  }
  async function request(path, { method = 'GET', body, cookie, origin = config.origin, contentType = 'application/json' } = {}, target = server) {
    return fetch(`http://127.0.0.1:${target.address().port}${path}`, { method,
      headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': contentType }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const cookieOf = (res) => res.headers.getSetCookie()[0]?.split(';')[0];
  const login = async (u, pwd = password) => request('/login', { method: 'POST', body: { email: u.email, password: pwd } });
  const superadmin = await fixture('superadmin'), admin = await fixture('admin'), otherAdmin = await fixture('admin'), user = await fixture('user');
  const deleted = await fixture('user', { deleted: true }), pending = await fixture('user', { status: 'pending' });
  const cookies = { superadmin: cookieOf(await login(superadmin)), admin: cookieOf(await login(admin)), user: cookieOf(await login(user)) };
  const profile = (email) => ({ firstName: 'Updated', lastName: 'Fixture', email, empno: null });
  const createBody = () => ({ ...profile(`${prefix}-new-${randomBytes(6).toString('hex')}@example.test`), password, confirmPassword: password });
  const list = async (cookie, suffix = '') => request('/api/users?search=' + prefix + suffix, { cookie });

  await t.test('anonymous and User role cannot access screens or any management endpoint', async () => {
    assert.equal((await request('/users')).status, 401);
    for (const [path, method, body] of [['/users', 'GET'], ['/api/users', 'GET'], [`/api/users/${superadmin.id}`, 'GET'], ['/api/users', 'POST', createBody()],
      [`/api/users/${user.id}`, 'PUT', profile(user.email)], [`/api/users/${user.id}/blocked`, 'PATCH', { blocked: true }]]) {
      assert.equal((await request(path, { method, body, cookie: cookies.user })).status, 403);
    }
    assert.equal((await request(`/api/users/${user.id}/block`, { method: 'PUT', body: {}, cookie: cookies.user })).status, 403);
    assert.equal((await request('/users/index.html', { cookie: cookies.admin })).status, 404);
  });
  await t.test('Superadmin sees all roles plus deleted rows and metadata; Admin hides Superadmins and deleted rows', async () => {
    const full = await (await list(cookies.superadmin)).json();
    for (const u of [superadmin, admin, otherAdmin, user, deleted, pending]) assert.ok(full.users.some((row) => row.user_id === u.id));
    assert.ok(full.users.every((row) => Object.hasOwn(row, 'stamp') && Object.hasOwn(row, 'status') && Object.hasOwn(row, 'is_deleted')));
    const result = await list(cookies.admin);
    const json = await result.json();
    const serialized = JSON.stringify(json);
    assert.equal(serialized.includes(superadmin.email), false);
    assert.equal(serialized.includes('superadmin'), false);
    assert.equal(json.users.some((row) => row.user_id === deleted.id), false);
    assert.ok(json.users.every((row) => !Object.hasOwn(row, 'stamp') && !Object.hasOwn(row, 'status') && !Object.hasOwn(row, 'is_deleted')));
    assert.equal(json.users.find((row) => row.user_id === otherAdmin.id).can_edit, false);
    const html = await (await request('/users', { cookie: cookies.admin })).text();
    assert.equal(html.includes('Superadmin'), false); assert.equal(html.includes('Deleted rows'), false);
    assert.equal((await list(cookies.admin, '&deleted=true')).status, 403);
    assert.equal((await list(cookies.admin, '&role=superadmin')).status, 400);
  });
  await t.test('Admin direct-ID access cannot inspect, edit, block, or unblock other Admins or Superadmins', async () => {
    for (const target of [superadmin, otherAdmin, deleted]) {
      const results = [await request(`/api/users/${target.id}`, { cookie: cookies.admin }),
        await request(`/api/users/${target.id}`, { method: 'PUT', body: profile(target.email), cookie: cookies.admin }),
        await request(`/api/users/${target.id}/blocked`, { method: 'PATCH', body: { blocked: true }, cookie: cookies.admin }),
        await request(`/api/users/${target.id}/blocked`, { method: 'PATCH', body: { blocked: false }, cookie: cookies.admin }),
        await request(`/api/users/${target.id}/block`, { method: 'PUT', body: {}, cookie: cookies.admin })];
      for (const res of results) { assert.equal(res.status, 404); assert.deepEqual(await res.json(), { error: 'Account not found.' }); }
    }
  });
  await t.test('issue #43: only Superadmins create elevated roles, with private hashes and mandatory setup', async () => {
    const html = await (await request('/users', { cookie: cookies.superadmin })).text();
    assert.match(html, /name="role"><option value="user">User<\/option><option value="admin">Admin<\/option><option value="superadmin">Superadmin/);
    for (const role of ['admin', 'superadmin']) {
      const body = { ...createBody(), role };
      const result = await request('/api/users', { method: 'POST', body, cookie: cookies.superadmin });
      assert.equal(result.status, 201);
      const json = await result.json(); const created = { id: json.user.user_id, email: json.user.email }; ids.push(created.id);
      assert.equal(json.user.role, role);
      for (const field of ['password_hash', 'setup_token_hash', 'session_version', 'password']) assert.equal(Object.hasOwn(json.user, field), false);
      const stored = (await pool.query('SELECT password_hash,must_change_password,status,role FROM app_user WHERE user_id=$1', [created.id])).rows[0];
      assert.equal(stored.role, role); assert.equal(stored.status, 'active'); assert.equal(stored.must_change_password, true);
      assert.equal(bcrypt.getRounds(stored.password_hash), 12);
      const restricted = await login(created);
      assert.equal(restricted.status, 200);
      assert.equal((await request('/api/users', { cookie: cookieOf(restricted) })).status, 403);
      assert.equal((await request('/api/users', { method: 'POST', body, cookie: cookies.admin })).status, 403);
      const edited = await request(`/api/users/${created.id}`, { method: 'PUT', body: profile(created.email), cookie: cookies.superadmin });
      assert.equal(edited.status, 200); assert.equal((await edited.json()).user.role, role);
      assert.equal((await request(`/api/users/${created.id}`, { method: 'PUT', body: profile(created.email), cookie: cookies.admin })).status, 404);
      const audit = (await pool.query("SELECT action_by FROM audit_log WHERE table_name='app_user' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [created.id])).rows[0];
      assert.equal(audit.action_by, superadmin.email);
    }
    assert.equal((await request('/api/users', { method: 'POST', body: { ...createBody(), role: 'owner' }, cookie: cookies.superadmin })).status, 400);
  });
  let added;
  await t.test('Admin creates only active Users with bcrypt and mandatory first-login change; role/status injection denied', async () => {
    const body = createBody();
    const result = await request('/api/users', { method: 'POST', body, cookie: cookies.admin });
    assert.equal(result.status, 201);
    const json = await result.json(); added = { id: json.user.user_id, email: json.user.email }; ids.push(added.id);
    assert.equal(JSON.stringify(json).includes(password), false);
    assert.equal(Object.hasOwn(json.user, 'status'), false);
    assert.equal((await request('/api/users', { method: 'POST', body, cookie: cookies.admin })).status, 409);
    for (const invalid of [{ ...createBody(), email: 'invalid' }, { ...createBody(), firstName: '' }, { ...createBody(), password: 'weak', confirmPassword: 'weak' }]) {
      assert.equal((await request('/api/users', { method: 'POST', body: invalid, cookie: cookies.admin })).status, 400);
    }
    const row = (await pool.query('SELECT * FROM app_user WHERE user_id=$1', [added.id])).rows[0];
    assert.equal(row.role, 'user'); assert.equal(row.status, 'active'); assert.equal(row.blocked, false);
    assert.equal(row.must_change_password, true); assert.equal(bcrypt.getRounds(row.password_hash), 12);
    assert.equal(await bcrypt.compare(password, row.password_hash), true);
    for (const role of ['admin', 'superadmin']) assert.equal((await request('/api/users', { method: 'POST', body: { ...createBody(), role }, cookie: cookies.admin })).status, 403);
    assert.equal((await request('/api/users', { method: 'POST', body: { ...createBody(), status: 'active' }, cookie: cookies.admin })).status, 400);
    const restricted = await login(added); assert.equal(restricted.status, 200);
    const restrictedCookie = cookieOf(restricted);
    assert.equal((await request('/api/v1/auth/session', { cookie: restrictedCookie })).status, 403);
    assert.equal((await request('/set-password', { method: 'POST', cookie: restrictedCookie, body: { new_password: replacement, confirm_password: replacement } })).status, 200);
    assert.equal((await login(added, replacement)).status, 200);
    const audit = (await pool.query("SELECT action_by FROM audit_log WHERE table_name='app_user' AND record_key=$1 AND action='ADD' ORDER BY audit_id DESC LIMIT 1", [added.id])).rows[0];
    assert.equal(audit.action_by, admin.email);
  });
  await t.test('profile edits persist; duplicate emails, foreign keys, role/status/password injection rejected', async () => {
    const body = { ...profile(user.email), firstName: '<img src=x onerror=alert(1)>', empno: '00001' };
    const response = await request(`/api/users/${user.id}`, { method: 'PUT', body, cookie: cookies.admin });
    assert.equal(response.status, 200); assert.equal((await response.json()).user.first_name, body.firstName);
    assert.equal((await pool.query('SELECT empno FROM app_user WHERE user_id=$1', [user.id])).rows[0].empno, '00001');
    assert.equal((await request(`/api/users/${user.id}`, { method: 'PUT', body: profile(otherAdmin.email), cookie: cookies.admin })).status, 409);
    assert.equal((await request(`/api/users/${user.id}`, { method: 'PUT', body: { ...profile(user.email), empno: 'ZZZZZ' }, cookie: cookies.admin })).status, 400);
    for (const extra of [{ role: 'admin' }, { status: 'active' }, { blocked: true }, { is_deleted: true }, { password: replacement }]) {
      assert.ok([400, 403].includes((await request(`/api/users/${user.id}`, { method: 'PUT', body: { ...profile(user.email), ...extra }, cookie: cookies.admin })).status));
    }
    const row = (await pool.query('SELECT * FROM app_user WHERE user_id=$1', [user.id])).rows[0];
    assert.equal(row.role, 'user'); assert.equal(row.email, user.email); assert.equal(row.empno, '00001');
    const audit = (await pool.query("SELECT action_by,new_values FROM audit_log WHERE table_name='app_user' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [user.id])).rows[0];
    assert.equal(audit.action_by, admin.email); assert.equal(Object.hasOwn(audit.new_values, 'password_hash'), false);
  });
  await t.test('blocking revokes logged-in access immediately; unblock restores login; self-block returns 400', async () => {
    const before = cookieOf(await login(user));
    const target = `/api/users/${user.id}/blocked`;
    assert.equal((await request(target, { method: 'PATCH', body: { blocked: true }, cookie: cookies.admin })).status, 200);
    assert.equal((await pool.query('SELECT blocked FROM app_user WHERE user_id=$1', [user.id])).rows[0].blocked, true);
    assert.equal((await login(user)).status, 403);
    assert.equal((await request('/api/v1/auth/session', { cookie: before })).status, 401);
    assert.equal((await request('/api/users', { cookie: cookies.admin })).status, 200);
    assert.equal((await request(target, { method: 'PATCH', body: { blocked: false }, cookie: cookies.admin })).status, 200);
    assert.equal((await login(user)).status, 200);
    assert.equal((await request(`/api/users/${admin.id}/blocked`, { method: 'PATCH', cookie: cookies.admin, body: { blocked: true } })).status, 400);
    // DEV-06 permits Superadmin operations under its transactional last-account guard.
    assert.equal((await request(`/api/users/${superadmin.id}/blocked`, { method: 'PATCH', cookie: cookies.superadmin, body: { blocked: false } })).status, 200);
    assert.equal((await request(`/api/users/${pending.id}`, { method: 'PUT', cookie: cookies.superadmin, body: { ...profile(pending.email), status: 'active' } })).status, 400);
  });
  await t.test('issue #43: canonical PUT block toggles atomically, stamps/audits the actor and revokes sessions', async () => {
    const target = await fixture('user');
    const cookie = cookieOf(await login(target));
    const path = `/api/users/${target.id}/block`;
    const first = await request(path, { method: 'PUT', cookie: cookies.admin, body: {} });
    assert.equal(first.status, 200); assert.equal((await first.json()).user.blocked, true);
    let row = (await pool.query('SELECT blocked,stamp FROM app_user WHERE user_id=$1', [target.id])).rows[0];
    assert.equal(row.blocked, true); assert.ok(row.stamp.startsWith('EDIT ' + admin.email + ' '));
    assert.equal((await request('/api/v1/auth/session', { cookie })).status, 401);
    assert.equal((await login(target)).status, 403);
    const second = await request(path, { method: 'PUT', cookie: cookies.admin }); // No body is a toggle too.
    assert.equal(second.status, 200); assert.equal((await second.json()).user.blocked, false);
    assert.equal((await login(target)).status, 200);
    assert.equal((await request('/api/v1/auth/session', { cookie })).status, 401, 'old cookies never revive');
    const audits = (await pool.query("SELECT action_by,new_values,old_values FROM audit_log WHERE table_name='app_user' AND record_key=$1 AND action='EDIT' ORDER BY audit_id DESC", [target.id])).rows;
    assert.equal(audits.length, 2); assert.ok(audits.every((entry) => entry.action_by === admin.email));
    assert.equal(audits[0].old_values.blocked, true); assert.equal(audits[0].new_values.blocked, false);
    assert.equal(audits[1].old_values.blocked, false); assert.equal(audits[1].new_values.blocked, true);
    assert.equal((await request(path, { method: 'PUT', cookie: cookies.admin, body: { isBlocked: true } })).status, 200);
    assert.equal((await pool.query('SELECT blocked FROM app_user WHERE user_id=$1', [target.id])).rows[0].blocked, true);
    for (const body of [{ isBlocked: 'true' }, { role: 'superadmin' }, { isBlocked: false, blocked: true }]) assert.equal((await request(path, { method: 'PUT', cookie: cookies.admin, body })).status, 400);
    assert.equal((await request(path, { method: 'PUT', cookie: cookies.admin, body: {}, origin: 'https://other.example' })).status, 403);
    assert.equal((await request(path, { method: 'PUT', cookie: cookies.admin, body: {}, contentType: 'text/plain' })).status, 415);
    assert.equal((await request(`/api/users/${admin.id}/block`, { method: 'PUT', cookie: cookies.admin, body: {} })).status, 400);
    const concurrent = await Promise.all([cookies.admin, cookies.superadmin].map((cookie) => request(path, { method: 'PUT', cookie, body: {} })));
    assert.ok(concurrent.every((response) => response.status === 200));
    const states = await Promise.all(concurrent.map(async (response) => (await response.json()).user.blocked));
    assert.deepEqual(states.sort(), [false, true]);
    assert.equal((await pool.query('SELECT blocked FROM app_user WHERE user_id=$1', [target.id])).rows[0].blocked, true);
  });
  await t.test('filters, literal SQL wildcard search, pagination, CSRF and JSON guards work', async () => {
    assert.equal((await request('/api/users?search=%25', { cookie: cookies.admin })).status, 200);
    assert.equal((await list(cookies.admin, '&page=0')).status, 400);
    assert.equal((await list(cookies.admin, '&blocked=no')).status, 400);
    assert.equal((await request('/api/users/9223372036854775808', { cookie: cookies.admin })).status, 404);
    assert.equal((await request('/api/users', { method: 'POST', body: createBody(), cookie: cookies.admin, origin: 'https://other.example' })).status, 403);
    assert.equal((await request('/api/users', { method: 'POST', body: createBody(), cookie: cookies.admin, contentType: 'text/plain' })).status, 415);
    const page = await (await list(cookies.superadmin, '&role=admin&blocked=false&page=1')).json();
    assert.ok(page.users.every((row) => row.role === 'admin' && row.blocked === false));
    const deletedPage = await (await list(cookies.superadmin, '&deleted=true')).json();
    assert.ok(deletedPage.users.every((row) => row.is_deleted));
    const injection = await (await request('/api/users?search=' + encodeURIComponent(prefix + "%' OR 1=1--"), { cookie: cookies.admin })).json();
    assert.equal(injection.users.length, 0);
  });
  await t.test('pagination returns bounded, non-overlapping pages and searches treat percent/underscore literally', async () => {
    await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,status)
      SELECT 'Page%_Fixture','Pagination',$1 || '-page-' || n || '@example.test',$2,'active' FROM generate_series(1,53) AS n`, [prefix, hash]);
    const path = '/api/users?search=' + prefix + '-page-';
    const first = await (await request(path, { cookie: cookies.admin })).json();
    const second = await (await request(path + '&page=2', { cookie: cookies.admin })).json();
    assert.equal(first.users.length, 50); assert.equal(first.hasMore, true);
    assert.equal(second.users.length, 3); assert.equal(second.hasMore, false);
    assert.equal(new Set([...first.users, ...second.users].map((row) => row.user_id)).size, 53);
    const literal = await (await request('/api/users?search=' + encodeURIComponent('Page%_Fixture'), { cookie: cookies.admin })).json();
    assert.equal(literal.users.length, 50);
    assert.ok(literal.users.every((row) => row.first_name === 'Page%_Fixture'));
  });
  await t.test('live PostgreSQL failure produces a safe 500 without schema details', async () => {
    // Permit session/auth lookups but fail management SQL, using actual PostgreSQL.
    const fault = new Pool({ options: '-c search_path=pg_catalog', query_timeout: 5000 }); faultPools.push(fault);
    const backend = { query: (sql, values) => sql.startsWith('SELECT user_id,first_name') ? fault.query(sql, values) : pool.query(sql, values) };
    const broken = createApp({ pool: backend, authConfig: config }); faultApps.push(broken);
    const srv = createServer(broken); faultServers.push(srv); srv.listen(0, '127.0.0.1'); await once(srv, 'listening');
    const response = await request('/api/users', { cookie: cookies.admin }, srv);
    assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: 'User Management is temporarily unavailable. Try again later.' });
  });
});
