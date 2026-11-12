const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { test } = require('node:test');
const { createApp } = require('../src/app');

async function serve(t) {
  const server = createServer(createApp());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('health returns only a minimal liveness response', async (t) => {
  const base = await serve(t);
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
  assert.equal(response.headers.get('x-powered-by'), null);
});

test('unimplemented routes return JSON 404 and no internal details', async (t) => {
  const base = await serve(t);
  const response = await fetch(`${base}/missing`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Route not found.' });
});

test('malformed JSON returns a safe 400 response', async (t) => {
  const base = await serve(t);
  const response = await fetch(`${base}/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"secret":',
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid JSON body.' });
});

test('oversized JSON returns a safe 413 response', async (t) => {
  const base = await serve(t);
  const response = await fetch(`${base}/health`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(102401) }),
  });
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'Request body is too large.' });
});
