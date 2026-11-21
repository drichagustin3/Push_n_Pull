const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { SMTPServer } = require('smtp-server');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');
const { readResetConfig } = require('../src/password-reset/config');
const { digestToken } = require('../src/password-reset/service');
const { GENERIC_MESSAGE } = require('../src/password-reset/controller');
const { startServer } = require('../src/server');

test('password reset over live HTTP, PostgreSQL, and local SMTP', {
  skip: process.env.RESET_INTEGRATION !== '1' ? 'Opt in with RESET_INTEGRATION=1 and an authorized local database.' : false,
}, async (t) => {
  assert.ok(process.env.PGDATABASE === 'hopedb_auth_test'
    || (process.env.PGDATABASE === 'hopedb' && process.env.RESET_ALLOW_HOPEDB_TEST === '1'));
  const pool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const ids = [], apps = [], servers = [], faultPools = [], messages = [], logs = [];
  const logger = { error: (...args) => logs.push(args.join(' ')), log: (...args) => logs.push(args.join(' ')) };
  const smtp = new SMTPServer({ authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'],
    disableReverseLookup: true, logger: false, closeTimeout: 1000,
    onData(stream, session, done) {
      let data = '';
      stream.on('data', (chunk) => { data += chunk; });
      stream.on('end', () => { messages.push(data); done(); });
    },
  });
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    for (const app of apps) { await app.locals.closePasswordReset(); await app.locals.closeAuthStore(); }
    await new Promise((resolve) => smtp.close(resolve));
    try {
      if (ids.length) {
        await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=ANY($1::text[])", [ids]);
        await pool.query('DELETE FROM password_reset_token WHERE user_id=ANY($1::bigint[])', [ids]);
        await pool.query('UPDATE app_user SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [ids]);
      }
    } finally { for (const p of faultPools) await p.end(); await pool.end(); }
  });
  await new Promise((resolve, reject) => {
    smtp.once('error', reject);
    smtp.listen(0, '127.0.0.1', resolve);
  });
  const authConfig = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const resetConfig = readResetConfig({ APP_URL: authConfig.origin, MAIL_FROM: 'noreply@example.test',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.server.address().port) }, 'test', authConfig);
  const password = 'Aa1' + randomBytes(20).toString('hex');
  const replacement = 'Bb2' + randomBytes(20).toString('hex');
  const passwordHash = await bcrypt.hash(password, 12);
  async function fixture({ status = 'active', blocked = false, deleted = false, firstLogin = false } = {}) {
    const email = `reset-test-${randomBytes(12).toString('hex')}@example.test`;
    const row = (await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,status,blocked,is_deleted,must_change_password)
      VALUES('Reset','Fixture',$1,$2,$3,$4,$5,$6) RETURNING user_id`, [email, passwordHash, status, blocked, deleted, firstLogin])).rows[0];
    const id = String(row.user_id);
    ids.push(id);
    return { email, id };
  }
  async function serve(backend = pool, options = {}) {
    const app = createApp({ pool: backend, authConfig, resetConfig, resetOptions: { logger, ...options } });
    apps.push(app);
    const server = createServer(app);
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const api = async (path, body, cookie) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Origin: authConfig.origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    api.idle = () => app.locals.waitForResetDelivery();
    return api;
  }
  const cookieOf = (res) => res.headers.getSetCookie()[0]?.split(';')[0];
  const resetBody = (token) => ({ token, newPassword: replacement, confirmPassword: replacement });
  const mailedToken = () => {
    const decoded = messages.at(-1).replace(/=\r?\n/g, '').replace(/=3D/g, '=');
    const link = decoded.match(/http:\/\/localhost:3000\/reset-password#token=([a-f0-9]{64})/);
    assert.ok(link, 'SMTP message contains the fixed-origin reset link');
    return link[1];
  };
  async function requestToken(api, user) {
    const res = await api('/api/auth/forgot-password', { email: user.email });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { message: GENERIC_MESSAGE });
    await api.idle();
    return mailedToken();
  }
  const active = await fixture({ firstLogin: true });
  let token;

  await t.test('startup checks the real reset schema; health and public forms work', async () => {
    const startupPool = new Pool();
    const running = await startServer({ config: { port: 0, auth: authConfig, reset: resetConfig }, pool: startupPool });
    try {
      const base = `http://127.0.0.1:${running.server.address().port}`;
      assert.equal((await fetch(base + '/api/health')).status, 200);
      for (const route of ['/forgot-password', '/reset-password']) {
        const res = await fetch(base + route);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
        assert.match(await res.text(), /password-reset.js/);
      }
    } finally { await running.shutdown(); }
    assert.equal(startupPool.ended, true);
  });
  await t.test('active request sends real SMTP mail; only a one-hour SHA-256 digest is stored', async () => {
    token = await requestToken(await serve(), active);
    const row = (await pool.query('SELECT * FROM password_reset_token WHERE user_id=$1', [active.id])).rows[0];
    assert.notEqual(row.token_hash, token);
    assert.equal(row.token_hash, digestToken(token));
    assert.ok(Math.abs(row.expires_at - row.created_at - 3600000) < 1000);
    assert.equal(row.is_used, false);
    assert.equal(logs.some((line) => line.includes(token)), false);
  });
  await t.test('unknown, pending, blocked, inactive, deleted accounts have identical responses and no tokens/mail', async () => {
    const api = await serve();
    const before = messages.length;
    const users = [{ email: `missing-${randomBytes(12).toString('hex')}@example.test` },
      await fixture({ status: 'pending' }), await fixture({ blocked: true }),
      await fixture({ status: 'inactive' }), await fixture({ deleted: true })];
    for (const user of users) {
      const res = await api('/forgot-password', { email: user.email });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { message: GENERIC_MESSAGE });
    }
    await api.idle();
    assert.equal(messages.length, before);
    assert.equal((await pool.query('SELECT 1 FROM password_reset_token WHERE user_id=ANY($1::bigint[])', [users.filter((u) => u.id).map((u) => u.id)])).rowCount, 0);
  });
  await t.test('new requests revoke older tokens; invalid passwords do not consume the current token', async () => {
    const api = await serve();
    const previous = token;
    token = await requestToken(api, active);
    assert.equal((await api('/reset-password', resetBody(previous))).status, 400);
    for (const body of [{ ...resetBody(token), newPassword: 'weak', confirmPassword: 'weak' },
      { ...resetBody(token), confirmPassword: 'Different123456' }]) assert.equal((await api('/reset-password', body)).status, 400);
    assert.equal((await pool.query('SELECT is_used FROM password_reset_token WHERE token_hash=$1', [digestToken(token)])).rows[0].is_used, false);
  });
  await t.test('reset hashes the password, clears setup state, consumes token, revokes only target sessions, and permits new login', async () => {
    const api = await serve();
    const neighbour = await fixture();
    const oldCookie = cookieOf(await api('/login', { email: active.email, password }));
    const otherCookie = cookieOf(await api('/login', { email: neighbour.email, password }));
    assert.ok(oldCookie && otherCookie);
    const response = await api('/api/auth/reset-password', resetBody(token));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null, 'reset does not auto-login');
    const row = (await pool.query('SELECT * FROM app_user WHERE user_id=$1', [active.id])).rows[0];
    assert.equal(await bcrypt.compare(replacement, row.password_hash), true);
    assert.equal(bcrypt.getRounds(row.password_hash), 12);
    assert.equal(row.must_change_password, false);
    assert.equal(row.setup_token_hash, null);
    assert.equal(row.setup_token_expires_at, null);
    assert.equal((await pool.query('SELECT is_used FROM password_reset_token WHERE token_hash=$1', [digestToken(token)])).rows[0].is_used, true);
    assert.equal((await api('/api/v1/auth/session', undefined, oldCookie)).status, 401);
    assert.equal((await api('/api/v1/auth/session', undefined, otherCookie)).status, 200);
    assert.equal((await api('/login', { email: active.email, password })).status, 401);
    assert.equal((await api('/login', { email: active.email, password: replacement })).status, 200);
    assert.equal((await api('/reset-password', resetBody(token))).status, 400);
    const audit = (await pool.query("SELECT action_by,new_values FROM audit_log WHERE table_name='app_user' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [active.id])).rows[0];
    assert.equal(audit.action_by, active.email);
    assert.equal(Object.hasOwn(audit.new_values, 'password_hash'), false);
  });
  await t.test('expired, tampered, missing tokens fail safely; blocking after issuance prevents use', async () => {
    const api = await serve();
    const expired = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO password_reset_token(user_id,token_hash,created_at,expires_at) VALUES($1,$2,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')", [active.id, digestToken(expired)]);
    for (const bad of [expired, randomBytes(32).toString('hex'), '', 'bad']) {
      const res = await api('/reset-password', resetBody(bad));
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: 'Invalid or expired password reset token' });
    }
    const blocked = await fixture();
    const blockedToken = await requestToken(api, blocked);
    await pool.query('UPDATE app_user SET blocked=TRUE WHERE user_id=$1', [blocked.id]);
    assert.equal((await api('/reset-password', resetBody(blockedToken))).status, 400);
    assert.equal((await pool.query('SELECT password_hash FROM app_user WHERE user_id=$1', [blocked.id])).rows[0].password_hash, passwordHash);
  });
  await t.test('concurrent redemption has exactly one winner', async () => {
    const api = await serve();
    const user = await fixture();
    const raw = await requestToken(api, user);
    const results = await Promise.all([api('/reset-password', resetBody(raw)), api('/reset-password', resetBody(raw))]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  });
  await t.test('SMTP failure preserves generic success, revokes the credential, and logs no secrets', async () => {
    const api = await serve(pool, { mailer: { async send() { throw new Error('PRIVATE SMTP DETAIL'); } } });
    const user = await fixture();
    assert.equal((await api('/forgot-password', { email: user.email })).status, 200);
    await api.idle();
    assert.equal((await pool.query('SELECT is_used FROM password_reset_token WHERE user_id=$1', [user.id])).rows[0].is_used, true);
    assert.equal(logs.some((line) => line.includes('PRIVATE SMTP DETAIL')), false);
    assert.ok(logs.includes('Password reset delivery failed.'));
  });
  await t.test('actual PostgreSQL failures do not leak SQL or account existence', async () => {
    const fault = new Pool({ options: '-c search_path=pg_catalog', query_timeout: 5000 });
    faultPools.push(fault);
    const api = await serve(fault);
    const res = await api('/forgot-password', { email: active.email });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { message: GENERIC_MESSAGE });
    await api.idle();
    const failed = await api('/reset-password', resetBody(randomBytes(32).toString('hex')));
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: 'Password reset is temporarily unavailable. Try again later.' });
  });
  await t.test('registration remains operational and new pending registrants cannot request tokens', async () => {
    const api = await serve();
    const email = `reset-registration-${randomBytes(12).toString('hex')}@example.test`;
    assert.equal((await api('/api/register', { firstName: 'Reset', lastName: 'Fixture', email, password, confirmPassword: password })).status, 201);
    const user = (await pool.query('SELECT user_id,status FROM app_user WHERE email=$1', [email])).rows[0];
    ids.push(String(user.user_id));
    assert.equal(user.status, 'pending');
    const count = messages.length;
    assert.equal((await api('/forgot-password', { email })).status, 200);
    await api.idle();
    assert.equal(messages.length, count);
  });
});
