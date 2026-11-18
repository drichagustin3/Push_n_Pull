const assert = require('node:assert/strict');
const { test } = require('node:test');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { MemoryStore } = require('express-session');
const { createApp } = require('../src/app');
const { readAuthConfig } = require('../src/auth/config');
const { readResetConfig } = require('../src/password-reset/config');
const { createResetMailer } = require('../src/password-reset/mail');
const { createDeliveryQueue } = require('../src/password-reset/queue');
const { completeReset } = require('../src/password-reset/service');
const { startServer } = require('../src/server');

const origin = 'http://localhost:3000';
test('reset config restricts console delivery to development and validates mail settings', () => {
  const auth = { origin };
  assert.equal(readResetConfig({}, 'development', auth).mode, 'console');
  const base = { APP_URL: origin, MAIL_FROM: 'noreply@example.test', SMTP_HOST: 'localhost' };
  const config = readResetConfig({ ...base, SMTP_PORT: '465', SMTP_USER: 'example-user', SMTP_PASS: 'example-pass' }, 'test', auth);
  assert.equal(config.smtp.secure, true);
  assert.equal(config.smtp.debug, false);
  assert.equal(readResetConfig(base, 'production', auth).smtp.requireTLS, true);
  for (const env of [{}, { ...base, APP_URL: 'https://attacker.example' },
    { ...base, SMTP_USER: 'user' }, { ...base, SMTP_PASS: 'secret' },
    { ...base, SMTP_HOST: '', SMTP_USER: 'user', SMTP_PASS: 'secret' },
    { ...base, SMTP_PORT: '0' }, { ...base, SMTP_PORT: '65536' },
    { ...base, SMTP_PORT: '3x' }, { ...base, SMTP_HOST: 'bad/host' },
    { ...base, MAIL_FROM: 'x\r\nBcc: someone@example.test' }]) {
    assert.throws(() => readResetConfig(env, 'test', auth));
  }
  assert.throws(() => readResetConfig({ APP_URL: origin, MAIL_FROM: base.MAIL_FROM }, 'production', auth), /SMTP_HOST/);
});

test('development fallback constructs a fixed-origin fragment link with the token', async () => {
  const output = [];
  const mailer = createResetMailer(readResetConfig({}, 'development', { origin }), { log: (...args) => output.push(args) });
  const token = randomBytes(32).toString('hex');
  await mailer.send('fixture@example.test', token);
  assert.equal(output.length, 1);
  const link = new URL(output[0][1]);
  assert.equal(link.origin, origin);
  assert.equal(link.search, '');
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('token'), token);
  mailer.close();
});

test('bounded delivery queue limits concurrency, drains on close, and redacts failures', async () => {
  let running = 0, peak = 0, completed = 0;
  const releases = [], logs = [];
  const queue = createDeliveryQueue({ error: (line) => logs.push(line) });
  for (let i = 0; i < 50; i += 1) assert.equal(queue.enqueue(async () => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((resolve) => releases.push(resolve));
    running -= 1; completed += 1;
    if (i === 0) throw new Error('private credential');
  }), true);
  assert.equal(queue.enqueue(() => {}), false);
  const closing = queue.close();
  assert.equal(queue.enqueue(() => {}), false);
  while (completed < 50) {
    await new Promise((resolve) => setImmediate(resolve));
    releases.splice(0).forEach((resolve) => resolve());
  }
  await closing;
  assert.equal(peak, 2);
  assert.deepEqual(logs, ['Password reset request processing failed.']);
});

test('reset transaction rolls back password/token changes if session revocation fails', async () => {
  const queries = [];
  let released = false;
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.startsWith('SELECT user_id,email')) return { rows: [{ user_id: '1', email: 'fixture@example.test', status: 'active', blocked: false, is_deleted: false }] };
      if (sql.startsWith('SELECT id FROM')) return { rows: [{ id: '2' }] };
      if (sql.startsWith('DELETE FROM auth_session')) throw new Error('private database error');
      return { rows: [] };
    },
    release() { released = true; },
  };
  const pool = { query: async () => ({ rows: [{ id: '2', user_id: '1' }] }), connect: async () => client };
  await assert.rejects(completeReset(pool, randomBytes(32).toString('hex'), 'FixturePassword123!'));
  assert.equal(queries.at(-1).sql, 'ROLLBACK');
  assert.equal(queries.some(({ sql }) => sql === 'COMMIT'), false);
  assert.equal(released, true);
  const update = queries.find(({ sql }) => sql.startsWith('UPDATE app_user'));
  assert.match(update.values[0], /^\$2[ab]\$12\$/);
  assert.equal(update.sql.includes('FixturePassword'), false);
});

test('reset HTTP guards reject invalid input, cross-origin requests, and rate-limit before account lookup', async (t) => {
  let queries = 0;
  const pool = { async connect() { queries += 1; throw new Error('must not reach database'); } };
  const authConfig = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: origin }, 'test');
  const app = createApp({ pool, authConfig, sessionStore: new MemoryStore(),
    resetConfig: readResetConfig({}, 'development', authConfig), resetOptions: { logger: { error() {} }, mailer: { send() {} } } });
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await app.locals.closePasswordReset();
  });
  const send = (path, body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  assert.equal((await send('/forgot-password', { email: 'fixture@example.test' }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await send('/forgot-password', {}, { 'Content-Type': 'text/plain' })).status, 415);
  for (const body of [null, [], {}, { email: 'invalid' }, { email: 1 }, { email: 'x@example.test', role: 'superadmin' }]) {
    assert.equal((await send('/forgot-password', body)).status, 400);
  }
  // Express rejects JSON null before the limiter; the other five reach it.
  for (let i = 0; i < 15; i += 1) assert.equal((await send('/reset-password', { token: 'bad' })).status, 400);
  assert.equal((await send('/forgot-password', { email: 'fixture@example.test' })).status, 429);
  assert.equal(queries, 0);
});

test('missing reset schema prevents startup and closes the pool', async () => {
  let closed = false;
  const pool = {
    async query(sql) {
      if (sql.includes('password_reset_token')) throw new Error('missing reset table');
      return { rows: [] };
    },
    async end() { closed = true; },
  };
  await assert.rejects(startServer({ config: { port: 0, reset: {} }, pool }), /missing reset table/);
  assert.equal(closed, true);
});
