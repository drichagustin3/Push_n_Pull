const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');
const { startServer } = require('../src/server');

test('real PostgreSQL session persistence, revocation, and concurrent one-time setup', {
  skip: process.env.AUTH_INTEGRATION !== '1' ? 'Opt in with AUTH_INTEGRATION=1 and an explicitly authorized local test database.' : false,
}, async (t) => {
  const database = process.env.PGDATABASE;
  assert.ok(database === 'hopedb_auth_test' || (database === 'hopedb' && process.env.AUTH_ALLOW_HOPEDB_TEST === '1'),
    'Use disposable hopedb_auth_test, or explicitly authorize fixture tests in local hopedb with AUTH_ALLOW_HOPEDB_TEST=1.');
  const verifyResetSchema = process.env.AUTH_VERIFY_DBA04 === '1';
  const pool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const ids = [];
  const servers = [];
  const apps = [];
  const faultPools = [];
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    for (const app of apps) await app.locals.closeAuthStore();
    try {
      if (ids.length) {
        await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id' = ANY($1::text[])", [ids]);
        if (verifyResetSchema) await pool.query('DELETE FROM password_reset_token WHERE user_id = ANY($1::bigint[])', [ids]);
        await pool.query('UPDATE app_user SET is_deleted = TRUE WHERE user_id = ANY($1::bigint[])', [ids]);
      }
    } finally {
      for (const faultPool of faultPools) await faultPool.end();
      await pool.end();
    }
  });
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, database);
  const password = 'Aa1' + randomBytes(24).toString('hex');
  const replacement = 'Bb2' + randomBytes(24).toString('hex');
  const token = randomBytes(32).toString('hex');
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const passwordHash = await bcrypt.hash(password, 12);
  async function createUser(unset, { temporary = false, setupProof = true, role = 'user', empno = null } = {}) {
    const email = `auth-test-${randomBytes(12).toString('hex')}@example.test`;
    const result = await pool.query(`INSERT INTO app_user
      (first_name, last_name, email, password_hash, role, blocked, status, stamp,
        must_change_password, setup_token_hash, setup_token_expires_at, empno)
      VALUES ('Integration', 'Fixture', $1, $2, $6, FALSE, 'active', 'TEST ' || session_user,
        $3, $4, $5, $7) RETURNING user_id`, [email, unset ? null : passwordHash, unset,
        unset && setupProof ? createHash('sha256').update(token).digest('hex') : null,
      unset && setupProof ? new Date(Date.now() + 600000) : null, role, empno]);
    if (temporary) await pool.query('UPDATE app_user SET must_change_password = TRUE WHERE user_id = $1', [result.rows[0].user_id]);
    ids.push(String(result.rows[0].user_id));
    return { id: String(result.rows[0].user_id), email };
  }
  async function serve(backendPool = pool) {
    const app = createApp({ pool: backendPool, authConfig: config }); // Real connect-pg-simple store.
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
  const active = await createUser(false, { role: 'admin', empno: '00001' });
  const first = await serve();
  const health = await first('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal((await first('/account.html')).status, 404);
  assert.equal((await first('/set-password.html')).status, 404);
  let response = await first('/api/v1/auth/login', { body: { email: active.email, password } });
  assert.equal(response.status, 200);
  let cookie = cookieOf(response);
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
  const publicResponse = await response.json();
  assert.equal(JSON.stringify(publicResponse).includes(passwordHash), false);
  assert.equal(JSON.stringify(publicResponse).includes(password), false);
  const stored = await pool.query("SELECT sess FROM auth_session WHERE sess->'user'->>'user_id' = $1", [active.id]);
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].sess.user.username, active.email);
  assert.deepEqual(stored.rows[0].sess.user, { user_id: active.id, username: active.email, role: 'admin', empno: '00001' });
  assert.equal(JSON.stringify(stored.rows[0].sess).includes(password), false);
  assert.equal(JSON.stringify(stored.rows[0].sess).includes(passwordHash), false);
  const neighbour = await createUser(false);
  const neighbourLogin = await first('/login', { body: { email: neighbour.email, password } });
  const neighbourCookie = cookieOf(neighbourLogin);
  assert.equal(neighbourLogin.status, 200);
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
  assert.equal((await second('/api/v1/auth/session', { cookie: neighbourCookie })).status, 200);
  assert.equal((await pool.query("SELECT 1 FROM auth_session WHERE sess->'user'->>'user_id'=$1", [neighbour.id])).rowCount, 1);

  const wrong = await second('/login', { body: { email: active.email, password: 'IncorrectPassword123!' } });
  const unknown = await second('/login', { body: { email: `missing-${randomBytes(8).toString('hex')}@example.test`, password } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());

  cookie = cookieOf(await second('/login', { body: { email: active.email, password } }));
  const regenerated = await second('/login', { cookie, body: { email: active.email, password } });
  assert.equal(regenerated.status, 200);
  assert.notEqual(cookieOf(regenerated), cookie);
  assert.equal((await second('/api/v1/auth/session', { cookie })).status, 401);
  cookie = cookieOf(regenerated);
  await pool.query('UPDATE app_user SET blocked = TRUE WHERE user_id = $1', [active.id]);
  assert.equal((await second('/api/v1/auth/session', { cookie })).status, 403);
  assert.equal((await second('/login', { body: { email: active.email, password } })).status, 403);
  assert.equal((await second('/api/v1/auth/session', { cookie: neighbourCookie })).status, 200);
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

  const seeded = await createUser(true, { role: 'superadmin' });
  const setupLogin = () => second('/login', { body: { email: seeded.email, setup_token: token } });
  const cookies = [cookieOf(await setupLogin()), cookieOf(await setupLogin())];
  assert.ok(cookies.every(Boolean));
  const results = await Promise.all(cookies.map((sessionCookie) => second('/set-password', {
    cookie: sessionCookie, body: { new_password: replacement, confirm_password: replacement },
  })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 401]);
  const row = (await pool.query('SELECT password_hash, must_change_password, setup_token_hash, setup_token_expires_at, session_version FROM app_user WHERE user_id = $1', [seeded.id])).rows[0];
  assert.equal(await bcrypt.compare(replacement, row.password_hash), true);
  assert.equal(bcrypt.getRounds(row.password_hash), 12);
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

  const setupApi = await serve(); // Separate limiter instance for additional acceptance cases.
  assert.equal((await setupApi('/set-password', { body: { new_password: replacement, confirm_password: replacement } })).status, 401);
  const temporary = await createUser(false, { temporary: true });
  const restrictedLogin = await setupApi('/login', { body: { email: temporary.email, password } });
  assert.equal(restrictedLogin.status, 200);
  assert.equal((await restrictedLogin.json()).user.requires_password_reset, true);
  const restrictedCookie = cookieOf(restrictedLogin);
  assert.equal((await setupApi('/api/v1/auth/session', { cookie: restrictedCookie })).status, 403);
  assert.equal((await setupApi('/account', { cookie: restrictedCookie })).headers.get('location'), '/set-password');
  for (const body of [
    { new_password: 'weak', confirm_password: 'weak' },
    { new_password: replacement, confirm_password: 'different' },
    { new_password: password, confirm_password: password },
  ]) assert.equal((await setupApi('/set-password', { cookie: restrictedCookie, body })).status, 400);
  const setupSuccess = await setupApi('/set-password', { cookie: restrictedCookie, body: { new_password: replacement, confirm_password: replacement } });
  assert.equal(setupSuccess.status, 200);
  const fullCookie = cookieOf(setupSuccess);
  assert.notEqual(fullCookie, restrictedCookie);
  assert.equal((await setupApi('/api/v1/auth/session', { cookie: restrictedCookie })).status, 401);
  assert.equal((await setupApi('/api/v1/auth/session', { cookie: fullCookie })).status, 200);
  assert.equal((await setupApi('/set-password', { cookie: fullCookie, body: { new_password: replacement, confirm_password: replacement } })).status, 409);
  assert.equal((await setupApi('/login', { body: { email: temporary.email, password } })).status, 401);
  assert.equal((await setupApi('/login', { body: { email: temporary.email, password: replacement } })).status, 200);

  assert.equal((await second('/api/v1/auth/session', { cookie: neighbourCookie + 'tampered' })).status, 401);
  await pool.query("UPDATE auth_session SET sess=jsonb_set(sess::jsonb,'{expiresAt}',to_jsonb($2::bigint))::json WHERE sess->'user'->>'user_id'=$1", [neighbour.id, Date.now() - 1000]);
  assert.equal((await second('/api/v1/auth/session', { cookie: neighbourCookie })).status, 401);

  if (verifyResetSchema) {
    // Emailed reset tokens (DBA-04 / DEV-04) are never first-login proof (DEV-03).
    const noSetupProof = await createUser(true, { setupProof: false });
    const resetToken = randomBytes(32).toString('hex');
    const digest = createHash('sha256').update(resetToken).digest('hex');
    await pool.query('INSERT INTO password_reset_token(user_id,token_hash) VALUES($1,$2)', [noSetupProof.id, digest]);
    assert.equal((await setupApi('/login', { body: { email: noSetupProof.email, setup_token: resetToken } })).status, 401);
    assert.equal((await pool.query('SELECT is_used FROM password_reset_token WHERE user_id=$1', [noSetupProof.id])).rows[0].is_used, false);
    assert.equal((await pool.query('SELECT password_hash FROM app_user WHERE user_id=$1', [noSetupProof.id])).rows[0].password_hash, null);
  }

  // Real PostgreSQL query failure via an isolated search_path, without altering schema.
  const faultPool = new Pool({ options: '-c search_path=pg_catalog', connectionTimeoutMillis: 5000, query_timeout: 5000 });
  faultPools.push(faultPool);
  const faultApi = await serve(faultPool);
  const databaseFailure = await faultApi('/login', { body: { email: temporary.email, password: replacement } });
  assert.equal(databaseFailure.status, 500);
  assert.deepEqual(await databaseFailure.json(), { error: 'authentication_unavailable', message: 'Authentication is temporarily unavailable. Try again later.' });
  const startupPool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const running = await startServer({ config: { port: 0, auth: config }, pool: startupPool });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${running.server.address().port}/health`)).status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${running.server.address().port}/api/health`)).status, 200);
  } finally { await running.shutdown(); }
  assert.equal(startupPool.ended, true);
});
