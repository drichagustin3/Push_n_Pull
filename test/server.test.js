const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:net');
const path = require('node:path');
const { test } = require('node:test');
const { startServer } = require('../src/server');
const { createPool, verifyConnection } = require('../src/db/pool');
const { readConfig } = require('../src/config/env');

// Successful lifecycle tests isolate PostgreSQL using a pool double.
// These do not establish a successful connection to a real PostgreSQL server.
function poolDouble(query = async () => ({ rows: [{ '?column?': 1 }] })) {
  return {
    query,
    ends: 0,
    async end() { this.ends += 1; },
  };
}

async function reservePort(t) {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  t.after(() => new Promise((resolve) => socket.close(resolve)));
  return socket.address().port;
}

test('HTTP starts only after the database check; shutdown releases port and pool once', async (t) => {
  let completeCheck;
  const pool = poolDouble(() => new Promise((resolve) => { completeCheck = resolve; }));
  let listening = false;
  const starting = startServer({ config: { port: 0 }, pool }).then((result) => {
    listening = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(listening, false);
  completeCheck();
  const { server, shutdown } = await starting;
  t.after(shutdown);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  await Promise.all([shutdown(), shutdown()]);
  assert.equal(server.listening, false);
  assert.equal(pool.ends, 1);
});

test('failed database check rejects startup and closes the pool', async () => {
  const failure = new Error('sensitive database details');
  const pool = poolDouble(async () => { throw failure; });
  await assert.rejects(startServer({ config: { port: 0 }, pool }), failure);
  assert.equal(pool.ends, 1);
});

test('occupied HTTP port rejects startup and closes the pool', async (t) => {
  const port = await reservePort(t);
  const pool = poolDouble();
  await assert.rejects(startServer({ config: { port }, pool }), { code: 'EADDRINUSE' });
  assert.equal(pool.ends, 1);
});

test('actual pg pool handles refused connections and idle errors without exposing details', async (t) => {
  // Bind a local port without accepting PostgreSQL connections, then release it.
  // The subsequent query must fail rather than relying on a machine's port 5432.
  const guard = createServer();
  guard.listen(0, '127.0.0.1');
  await once(guard, 'listening');
  const port = guard.address().port;
  await new Promise((resolve) => guard.close(resolve));
  const errors = [];
  const config = readConfig({ PGUSER: 'test_user', PGPASSWORD: 'test_password', PGPORT: String(port) });
  const pool = createPool(config.database, { error: (message) => errors.push(message) });
  t.after(() => pool.end());
  await assert.rejects(verifyConnection(pool), { code: 'ECONNREFUSED' });
  pool.emit('error', new Error('sensitive connection details'));
  assert.deepEqual(errors, ['An idle database connection failed.']);
});

async function runEntry(file, env) {
  const child = spawn(process.execPath, [path.resolve(__dirname, '..', file)], {
    env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  const [code, signal] = await once(child, 'close');
  return { code, signal, stdout, stderr };
}

for (const entry of ['src/server.js', 'scripts/check-db.js']) {
  test(`${entry} exits 1 for invalid config and does not print secrets`, async () => {
    const result = await runEntry(entry, { PGUSER: '', PGPASSWORD: 'sensitive_password' });
    assert.equal(result.code, 1);
    assert.equal(result.signal, null);
    assert.match(result.stderr, /Configuration error: PGUSER is required/);
    assert.equal(result.stderr.includes('sensitive_password'), false);
    assert.equal(result.stdout, '');
  });

  test(`${entry} exits 1 when PostgreSQL refuses the connection`, async () => {
    const guard = createServer();
    guard.listen(0, '127.0.0.1');
    await once(guard, 'listening');
    const port = guard.address().port;
    await new Promise((resolve) => guard.close(resolve));
    const result = await runEntry(entry, {
      PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'hopedb',
      PGUSER: 'test_user', PGPASSWORD: 'sensitive_password',
      SESSION_SECRET: require('node:crypto').randomBytes(32).toString('hex'),
      APP_ORIGIN: 'http://localhost:3000',
    });
    assert.equal(result.code, 1);
    assert.equal(result.signal, null);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /(?:Startup|Database connection) failed/);
    assert.equal(result.stderr.includes('sensitive_password'), false);
    assert.equal(result.stderr.includes('ECONNREFUSED'), false);
  });
}
