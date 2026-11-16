const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { readAuthConfig } = require('../src/auth/config');
const { startServer } = require('../src/server');

test('real PostgreSQL session persistence, revocation, and concurrent one-time setup', {
  skip: process.env.AUTH_INTEGRATION !== '1' ? 'Opt in with AUTH_INTEGRATION=1 and a disposable hopedb_auth_test database.' : false,
}, async (t) => {
  assert.equal(process.env.PGDATABASE, 'hopedb_auth_test', 'Integration tests only accept the disposable hopedb_auth_test database.');
  const pool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const ids = [];
  const servers = [];
  const apps = [];
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    for (const app of apps) await app.locals.closeAuthStore();
    try {
      if (ids.length) {
        await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id' = ANY($1::text[])", [ids]);
        await pool.query('UPDATE app_user SET is_deleted = TRUE WHERE user_id = ANY($1::bigint[])', [ids]);
      }
    } finally { await pool.end(); }
  });
  const password = 'Aa1' + randomBytes(24).toString('hex');
  const replacement = 'Bb2' + randomBytes(24).toString('hex');
  const token = randomBytes(32).toString('hex');
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const passwordHash = await bcrypt.hash(password, 12);
  async function createUser(unset) {
    const email = `auth-test-${randomBytes(12).toString('hex')}@example.test`;
    const result = await pool.query(`INSERT INTO app_user
      (first_name, last_name, email, password_hash, role, blocked, status, stamp,
        must_change_password, setup_token_hash, setup_token_expires_at)
      VALUES ('Integration', 'Fixture', $1, $2, 'user', FALSE, 'active', 'TEST ' || session_user,
        $3, $4, $5) RETURNING user_id`, [email, unset ? null : passwordHash, unset,
      unset ? createHash('sha256').update(token).digest('hex') : null,
      unset ? new Date(Date.now() + 600000) : null]);
    ids.push(String(result.rows[0].user_id));
    return { id: String(result.rows[0].user_id), email };
  }
  async function serve() {
    const app = createApp({ pool, authConfig: config }); // Real connect-pg-simple store.
    apps.push(app);
    const server = createServer(app);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return async (path, { body, cookie } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
      headers: { Origin: config.origin, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const cookieOf = (response) => response.headers.getSetCookie()[0]?.split(';')[0];
  const active = await createUser(false);
  const first = await serve();
  let response = await first('/api/v1/auth/login', { body: { email: active.email, password } });
  assert.equal(response.status, 200);
  let cookie = cookieOf(response);
  const stored = await pool.query("SELECT sess FROM auth_session WHERE sess->'user'->>'user_id' = $1", [active.id]);
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].sess.user.username, active.email);
  // A new app instance with the same secret/pool can load the stored cookie.
  await new Promise((resolve) => { servers[0].close(resolve); servers[0].closeAllConnections(); });
  await apps[0].locals.closeAuthStore();
  const second = await serve();
  assert.equal((await second('/api/v1/auth/session', { cookie })).status, 200);
  response = await second('/logout', { cookie, body: {} });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /session_id=;/);
  assert.equal((await second('/api/v1/auth/session', { cookie })).status, 401);
  const afterLogout = await pool.query("SELECT 1 FROM auth_session WHERE sess->'user'->>'user_id' = $1", [active.id]);
  assert.equal(afterLogout.rowCount, 0);

  cookie = cookieOf(await second('/login', { body: { email: active.email, password } }));
  await pool.query('UPDATE app_user SET blocked = TRUE WHERE user_id = $1', [active.id]);
  assert.equal((await second('/api/v1/auth/session', { cookie })).status, 403);
  assert.equal((await second('/login', { body: { email: active.email, password } })).status, 403);
  await pool.query('UPDATE app_user SET blocked = FALSE WHERE user_id = $1', [active.id]);
  assert.equal((await second('/api/v1/auth/session', { cookie })).status, 401);
  cookie = cookieOf(await second('/login', { body: { email: active.email, password } }));
  await pool.query('UPDATE app_user SET is_deleted = TRUE WHERE user_id = $1', [active.id]);
  assert.equal((await second('/api/v1/auth/session', { cookie })).status, 401);
  assert.equal((await second('/login', { body: { email: active.email, password } })).status, 401);

  const registrationEmail = `register-${randomBytes(12).toString('hex')}@example.test`;
  response = await second('/api/register', { body: { firstName: 'Registration', lastName: 'Fixture', email: registrationEmail.toUpperCase(), password, confirmPassword: password } });
  assert.equal(response.status, 201);
  const registered = (await pool.query('SELECT * FROM app_user WHERE email = $1', [registrationEmail])).rows[0];
  ids.push(String(registered.user_id));
  assert.equal(registered.status, 'pending');
  assert.equal(registered.role, 'user');
  assert.equal(registered.blocked, false);
  assert.equal(registered.is_deleted, false);
  assert.equal(await bcrypt.compare(password, registered.password_hash), true);
  assert.equal((await second('/login', { body: { email: registrationEmail, password } })).status, 403);
  assert.equal((await second('/login', { body: { email: registrationEmail, password: 'WrongCredential123!' } })).status, 401);
  assert.equal((await second('/api/register', { body: { firstName: 'Duplicate', lastName: 'Fixture', email: registrationEmail, password, confirmPassword: password } })).status, 409);

  const seeded = await createUser(true);
  const setupLogin = () => second('/login', { body: { email: seeded.email, setup_token: token } });
  const cookies = [cookieOf(await setupLogin()), cookieOf(await setupLogin())];
  assert.ok(cookies.every(Boolean));
  const results = await Promise.all(cookies.map((sessionCookie) => second('/set-password', {
    cookie: sessionCookie, body: { new_password: replacement, confirm_password: replacement },
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
  const row = (await pool.query('SELECT password_hash, must_change_password, setup_token_hash, setup_token_expires_at, session_version FROM app_user WHERE user_id = $1', [seeded.id])).rows[0];
  assert.equal(await bcrypt.compare(replacement, row.password_hash), true);
  assert.equal(row.must_change_password, false);
  assert.equal(row.setup_token_hash, null);
  assert.equal(row.setup_token_expires_at, null);
  assert.equal(row.session_version, 1);
  const audit = (await pool.query("SELECT action_by, new_values FROM audit_log WHERE table_name='app_user' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [seeded.id])).rows[0];
  assert.equal(audit.action_by, seeded.email);
  assert.equal(Object.hasOwn(audit.new_values, 'password_hash'), false);
  assert.equal(Object.hasOwn(audit.new_values, 'setup_token_hash'), false);
  assert.equal((await pool.query("SELECT nullif(current_setting('app.username', true), '') AS actor")).rows[0].actor, null);
  assert.equal((await setupLogin()).status, 401);
  for (const oldCookie of cookies) assert.equal((await second('/api/v1/auth/session', { cookie: oldCookie })).status, 401);
  const winner = results.find((result) => result.status === 200);
  assert.equal((await second('/api/v1/auth/session', { cookie: cookieOf(winner) })).status, 200);
  assert.equal((await second('/login', { body: { email: seeded.email, password: replacement } })).status, 200);
  const startupPool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const running = await startServer({ config: { port: 0, auth: config }, pool: startupPool });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${running.server.address().port}/health`)).status, 200);
  } finally { await running.shutdown(); }
  assert.equal(startupPool.ended, true);
});
