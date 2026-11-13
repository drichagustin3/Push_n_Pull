const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { before, test } = require('node:test');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { readAuthConfig } = require('../src/auth/config');

const password = 'ExistingPassword123!';
const newPassword = 'ReplacementPassword456!';
const origin = 'http://localhost:3000';
let hash;
before(async () => { hash = await bcrypt.hash(password, 12); });

function account(changes = {}) {
  return { user_id: '1', email: 'ana@example.com', role: 'user', empno: null,
    password_hash: hash, status: 'active', blocked: false, must_change_password: false,
    setup_token_hash: null, setup_token_expires_at: null, session_version: 0, ...changes };
}

// Pool double for deterministic account transitions and injected failures.
// PostgreSQL locking/store integration is verified separately against a real database.
async function serve(t, initial = {}, options = {}) {
  let user = account(initial);
  const queries = [];
  let fail = false;
  let updateFail = false;
  let releases = 0;
  let beforeConnect;
  const pool = {
    async query(sql, args = []) {
      queries.push({ sql, args });
      if (fail) throw new Error('private database details');
      if (sql.startsWith('SELECT')) {
        const match = sql.includes('email =') ? args[0] === user?.email : String(args[0]) === String(user?.user_id);
        return { rows: user && match ? [{ ...user }] : [] };
      }
      if (sql.startsWith('UPDATE')) {
        if (updateFail) throw new Error('private update details');
        user = { ...user, password_hash: args[0], must_change_password: false, setup_token_hash: null, setup_token_expires_at: null, session_version: user.session_version + 1 };
        return { rows: [{ ...user }] };
      }
      return { rows: [] };
    },
    async connect() { beforeConnect?.(); return { query: pool.query.bind(pool), release() { releases += 1; } }; },
  };
  const store = new session.MemoryStore(); // Tests only; production always uses PgStore.
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: origin }, 'test');
  const app = createApp({ pool, authConfig: { ...config, ...options }, sessionStore: store });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { body, cookie, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
    return fetch(`${base}${path}`, { method, redirect: 'manual',
      headers: { Origin: options.origin || origin, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  return { request, store, queries, config,
    get user() { return user; }, set user(value) { user = value; },
    set fail(value) { fail = value; }, set updateFail(value) { updateFail = value; },
    get releases() { return releases; },
    set beforeConnect(callback) { beforeConnect = callback; },
    login: (body = { email: 'ana@example.com', password: password }) => request('/api/v1/auth/login', { body }),
  };
}

const cookieOf = (response) => response.headers.getSetCookie()[0]?.split(';')[0];
const setupBody = { new_password: newPassword, confirm_password: newPassword };

test('auth config requires private secret, exact origin, production HTTPS, and bounded proxy trust', () => {
  const env = { SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: origin };
  for (const secret of [undefined, '', ' '.repeat(32), 'short', 'replace_with_a_random_secret_of_at_least_32_bytes']) assert.throws(() => readAuthConfig({ ...env, SESSION_SECRET: secret }, 'test'), /SESSION_SECRET/);
  for (const url of ['', 'null', 'https://site.test/path', 'https://site.test/', 'https://user:pass@site.test']) assert.throws(() => readAuthConfig({ ...env, APP_ORIGIN: url }, 'test'), /APP_ORIGIN/);
  assert.throws(() => readAuthConfig(env, 'production'), /HTTPS/);
  assert.throws(() => readAuthConfig({ ...env, TRUST_PROXY: 'true' }, 'test'), /TRUST_PROXY/);
  const production = readAuthConfig({ ...env, APP_ORIGIN: 'https://erp.example.test', TRUST_PROXY: 'loopback' }, 'production');
  assert.equal(production.secure, true);
  assert.equal(production.trustProxy, 'loopback');
});

test('active login persists a signed session with safe context and logout revokes the old cookie', async (t) => {
  const api = await serve(t, { empno: '00001', role: 'admin' });
  const login = await api.login({ email: ' ANA@EXAMPLE.COM ', password });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  const cookie = cookieOf(login);
  const saved = JSON.parse(Object.values(api.store.sessions)[0]);
  assert.deepEqual(saved.user, { user_id: '1', username: 'ana@example.com', role: 'admin', empno: '00001' });
  assert.equal(JSON.stringify(saved).includes(password), false);
  assert.equal(JSON.stringify(saved).includes(hash), false);
  const response = await api.request('/api/v1/auth/session', { cookie });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.email, 'ana@example.com');
  const logout = await api.request('/api/v1/auth/logout', { cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /session_id=;/);
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
  assert.equal(Object.keys(api.store.sessions).length, 0);
  assert.equal((await api.request('/api/v1/auth/session', { cookie })).status, 401);
});

test('unknown email and wrong password have identical generic errors', async (t) => {
  const api = await serve(t);
  const results = [];
  for (const body of [{ email: 'unknown@example.com', password }, { email: 'ana@example.com', password: 'IncorrectPassword123!' }]) {
    const result = await api.login(body);
    assert.equal(result.status, 401);
    assert.equal(result.headers.get('set-cookie'), null);
    results.push(await result.json());
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], { error: 'invalid_credentials', message: 'Invalid email or password.' });
});

for (const [state, code] of [[{ blocked: true }, 'account_blocked'], [{ status: 'pending' }, 'account_pending'], [{ status: 'inactive' }, 'account_inactive']]) {
  test(`${code} rejects correct credentials without issuing a session`, async (t) => {
    const api = await serve(t, state);
    const response = await api.login();
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, code);
    assert.equal(Object.keys(api.store.sessions).length, 0);
    assert.equal((await api.login({ email: 'ana@example.com', password: 'WrongPassword123!' })).status, 401);
  });
}

for (const change of [{ blocked: true }, { status: 'pending' }, { status: 'inactive' }, { session_version: 1 }]) {
  test(`existing session loses access after ${JSON.stringify(change)}`, async (t) => {
    const api = await serve(t);
    const cookie = cookieOf(await api.login());
    api.user = { ...api.user, ...change };
    const response = await api.request('/api/v1/auth/session', { cookie });
    assert.ok([401, 403].includes(response.status));
    assert.equal(Object.keys(api.store.sessions).length, 0);
    assert.match(response.headers.get('set-cookie'), /session_id=;/);
  });
}

test('session guard rejects deletion, absolute expiry, absent sessions, and tampered cookies', async (t) => {
  const api = await serve(t);
  assert.equal((await api.request('/api/v1/auth/session')).status, 401);
  let cookie = cookieOf(await api.login());
  assert.equal((await api.request('/api/v1/auth/session', { cookie: cookie + 'tampered' })).status, 401);
  const sid = Object.keys(api.store.sessions)[0];
  const saved = JSON.parse(api.store.sessions[sid]);
  saved.expiresAt = Date.now() - 1;
  api.store.sessions[sid] = JSON.stringify(saved);
  assert.equal((await api.request('/api/v1/auth/session', { cookie })).status, 401);
  cookie = cookieOf(await api.login());
  api.user = null;
  assert.equal((await api.request('/api/v1/auth/session', { cookie })).status, 401);
});

test('temporary-password login is restricted; setup hashes, rotates ID, and cannot be repeated', async (t) => {
  const api = await serve(t, { must_change_password: true });
  const response = await api.login();
  assert.equal((await response.json()).user.requires_password_reset, true);
  const cookie = cookieOf(response);
  const restricted = await api.request('/api/v1/auth/session', { cookie });
  assert.equal(restricted.status, 403);
  assert.equal((await restricted.json()).error, 'password_setup_required');
  const page = await api.request('/account', { cookie });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/set-password');
  assert.equal((await api.request('/set-password', { cookie })).status, 200);
  assert.equal((await api.request('/api/v1/auth/set-password', { cookie, body: { new_password: password, confirm_password: password } })).status, 400);
  const updated = await api.request('/api/v1/auth/set-password', { cookie, body: setupBody });
  assert.equal(updated.status, 200);
  const newCookie = cookieOf(updated);
  assert.notEqual(newCookie, cookie);
  assert.equal(await bcrypt.compare(newPassword, api.user.password_hash), true);
  assert.equal(bcrypt.getRounds(api.user.password_hash), 12);
  assert.equal(api.user.must_change_password, false);
  assert.equal(api.user.session_version, 1);
  assert.equal(api.releases, 1);
  assert.deepEqual(api.queries.find((query) => query.sql.includes('set_config')).args, ['ana@example.com']);
  assert.equal((await api.request('/api/v1/auth/session', { cookie })).status, 401);
  assert.equal((await api.request('/api/v1/auth/session', { cookie: newCookie })).status, 200);
  assert.equal((await api.request('/api/v1/auth/set-password', { cookie: newCookie, body: setupBody })).status, 409);
  assert.equal((await api.login()).status, 401);
  assert.equal((await api.login({ email: 'ana@example.com', password: newPassword })).status, 200);
});

test('unset password requires a private unexpired token and clears it after setup', async (t) => {
  const token = randomBytes(32).toString('hex');
  const api = await serve(t, { password_hash: null, must_change_password: true,
    setup_token_hash: createHash('sha256').update(token).digest('hex'), setup_token_expires_at: new Date(Date.now() + 60000).toISOString() });
  assert.equal((await api.login()).status, 401);
  assert.equal((await api.login({ email: 'ana@example.com' })).status, 400);
  assert.equal((await api.login({ email: 'ana@example.com', setup_token: randomBytes(32).toString('hex') })).status, 401);
  const result = await api.login({ email: 'ana@example.com', setup_token: token });
  assert.equal(result.status, 200);
  const cookie = cookieOf(result);
  assert.equal((await api.request('/set-password', { cookie, body: setupBody })).status, 200);
  assert.equal(api.user.setup_token_hash, null);
  assert.equal(api.user.setup_token_expires_at, null);
  assert.equal((await api.login({ email: 'ana@example.com', setup_token: token })).status, 401);
});

test('setup token expiry or reissue revokes already-issued restricted sessions', async (t) => {
  for (const change of [{ setup_token_expires_at: new Date(Date.now() - 1000).toISOString() }, { setup_token_hash: randomBytes(32).toString('hex') }]) {
    const token = randomBytes(32).toString('hex');
    const api = await serve(t, { password_hash: null, must_change_password: true,
      setup_token_hash: createHash('sha256').update(token).digest('hex'), setup_token_expires_at: new Date(Date.now() + 60000).toISOString() });
    const cookie = cookieOf(await api.login({ email: 'ana@example.com', setup_token: token }));
    api.user = { ...api.user, ...change };
    assert.equal((await api.request('/set-password', { cookie, body: setupBody })).status, 401);
    assert.equal(api.user.password_hash, null);
  }
});

test('expired setup token is rejected without granting a session', async (t) => {
  const token = randomBytes(32).toString('hex');
  const api = await serve(t, { password_hash: null, must_change_password: true, setup_token_hash: createHash('sha256').update(token).digest('hex'), setup_token_expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await api.login({ email: 'ana@example.com', setup_token: token })).status, 401);
});

test('cross-origin or missing-origin login/logout/setup and non-JSON input are rejected', async (t) => {
  const api = await serve(t);
  const cookie = cookieOf(await api.login());
  for (const path of ['/login', '/logout', '/set-password']) {
    assert.equal((await api.request(path, { cookie, body: {}, headers: { Origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await api.request(path, { cookie, body: {}, headers: { Origin: '' } })).status, 403);
  }
  assert.equal((await api.request('/login', { body: {}, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await api.request('/api/v1/auth/session', { cookie })).status, 200);
});

test('validation rejects bad bodies without querying the database', async (t) => {
  const api = await serve(t);
  for (const body of [null, [], {}, { email: 'bad', password }, { email: 'ana@example.com', password, role: 'admin' }, { email: 'ana@example.com', password, setup_token: randomBytes(32).toString('hex') }, { email: 'ana@example.com', password: 'A'.repeat(73) }]) assert.equal((await api.login(body)).status, 400);
  assert.equal(api.queries.length, 0);
});

test('password setup validation rejects weak, mismatched, oversized, or injected values', async (t) => {
  const api = await serve(t, { must_change_password: true });
  const cookie = cookieOf(await api.login());
  for (const body of [{}, { ...setupBody, confirm_password: 'no' }, { new_password: 'weak', confirm_password: 'weak' }, { ...setupBody, role: 'admin' }, { new_password: 'A1a' + '界'.repeat(24), confirm_password: 'A1a' + '界'.repeat(24) }]) assert.equal((await api.request('/set-password', { cookie, body })).status, 400);
  assert.equal(api.releases, 0);
});

test('account state is rechecked inside the setup transaction; failures rollback and release', async (t) => {
  const api = await serve(t, { must_change_password: true });
  const cookie = cookieOf(await api.login());
  api.updateFail = true;
  const response = await api.request('/set-password', { cookie, body: setupBody });
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('private'), false);
  assert.equal(api.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(api.releases, 1);
  assert.equal(api.user.must_change_password, true);
});

test('database and session-store errors fail closed without internal error text', async (t) => {
  const api = await serve(t);
  api.fail = true;
  let response = await api.login();
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('private'), false);
  api.fail = false;
  api.store.set = (sid, value, callback) => callback(new Error('private store details'));
  response = await api.login();
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes('private'), false);
});

test('HTTPS configuration emits Secure cookies behind an explicitly trusted local proxy', async (t) => {
  const api = await serve(t, {}, { origin: 'https://erp.example.test', secure: true, trustProxy: 'loopback' });
  const response = await api.request('/login', { body: { email: 'ana@example.com', password }, headers: { 'X-Forwarded-Proto': 'https' } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /; Secure/);
  assert.equal((await api.request('/login', { body: { email: 'ana@example.com', password } })).status, 400);
});

test('authentication rate limit returns 429 before further credential checks', async (t) => {
  const api = await serve(t);
  for (let index = 0; index < 20; index += 1) assert.equal((await api.login({})).status, 400);
  const response = await api.login();
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'rate_limit_exceeded');
  assert.ok(response.headers.get('retry-after'));
  assert.equal(api.queries.length, 0);
});

test('startup closes the pool when the required auth schema is missing', async () => {
  const { startServer } = require('../src/server');
  let closed = false;
  const pool = {
    async query(sql) { if (sql !== 'SELECT 1') throw new Error('missing auth schema'); },
    async end() { closed = true; },
  };
  const auth = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: origin }, 'test');
  await assert.rejects(startServer({ config: { port: 0, auth }, pool }), /missing auth schema/);
  assert.equal(closed, true);
});

test('setup rechecks blocking, pending state, and version changes after the initial guard', async (t) => {
  for (const change of [{ blocked: true }, { status: 'pending' }, { session_version: 1 }]) {
    const api = await serve(t, { must_change_password: true });
    const cookie = cookieOf(await api.login());
    api.beforeConnect = () => { api.user = { ...api.user, ...change }; };
    const response = await api.request('/set-password', { cookie, body: setupBody });
    assert.equal(response.status, change.session_version ? 401 : 403);
    assert.equal(api.queries.some((query) => query.sql.startsWith('UPDATE')), false);
    assert.equal(api.queries.at(-1).sql, 'ROLLBACK');
    assert.equal(api.releases, 1);
  }
});

test('restricted and already-logged-out sessions can log out safely', async (t) => {
  const api = await serve(t, { must_change_password: true });
  const cookie = cookieOf(await api.login());
  assert.equal((await api.request('/logout', { cookie, body: {} })).status, 200);
  assert.equal((await api.request('/set-password', { cookie, body: setupBody })).status, 401);
  assert.equal((await api.request('/logout', { cookie, body: {} })).status, 200);
});
