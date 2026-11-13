const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { test } = require('node:test');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { validateRegistration } = require('../src/registration/validation');

const valid = {
  firstName: ' Ana ', lastName: "O'Connor", email: ' ANA@EXAMPLE.COM ',
  password: 'SecurePass123!', confirmPassword: 'SecurePass123!',
};

async function serve(t, pool) {
  const server = createServer(createApp({ pool }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    post: (body, headers = { 'Content-Type': 'application/json' }) => fetch(`${url}/api/register`, {
      method: 'POST', headers, body: JSON.stringify(body),
    }),
  };
}

test('validation normalizes identity values and preserves passwords', () => {
  const result = validateRegistration(valid);
  assert.deepEqual(result.errors, {});
  assert.equal(result.data.firstName, 'Ana');
  assert.equal(result.data.lastName, "O'Connor");
  assert.equal(result.data.email, 'ana@example.com');
  assert.equal(result.data.password, valid.password);
});

test('validation rejects absent, mistyped, and oversized identity fields', () => {
  for (const field of ['firstName', 'lastName', 'email']) {
    for (const value of [undefined, null, [], {}, 10, '', ' ', 'x'.repeat(255), '\u0000']) {
      assert.ok(validateRegistration({ ...valid, [field]: value }).errors[field]);
    }
  }
  for (const email of ['person', 'a@b', 'a b@example.com', 'a@example..com', 'a@-example.com', '.a@example.com', 'a.@example.com', 'a..b@example.com', 'a'.repeat(65) + '@example.com']) {
    assert.ok(validateRegistration({ ...valid, email }).errors.email);
  }
  for (const body of [null, undefined, [], 'text', 10]) {
    assert.ok(validateRegistration(body).errors.form);
  }
});

test('password strength, confirmation, NUL, and bcrypt byte limits are enforced', () => {
  for (const password of [undefined, null, [], 'shortA1', 'alllowercase123', 'ALLUPPERCASE123', 'NoNumbersHere', 'A1' + 'a'.repeat(71), 'A1a' + '界'.repeat(24), 'StrongPassword123\u0000']) {
    assert.ok(validateRegistration({ ...valid, password, confirmPassword: password }).errors.password);
  }
  assert.ok(validateRegistration({ ...valid, confirmPassword: 'different' }).errors.confirmPassword);
  assert.ok(validateRegistration({ ...valid, confirmPassword: undefined }).errors.confirmPassword);
  const password = 'A1' + 'a'.repeat(70);
  assert.deepEqual(validateRegistration({ ...valid, password, confirmPassword: password }).errors, {});
});

test('registration stores a bcrypt hash through SQL parameters and fixes pending user defaults', async (t) => {
  let call;
  const { post } = await serve(t, { async query(sql, parameters) { call = { sql, parameters }; return { rowCount: 1 }; } });
  const response = await post(valid);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.status, 'pending');
  assert.match(body.message, /approve/);
  assert.deepEqual(Object.keys(body).sort(), ['message', 'status']);
  assert.deepEqual(call.parameters.slice(0, 3), ['Ana', "O'Connor", 'ana@example.com']);
  assert.equal(await bcrypt.compare(valid.password, call.parameters[3]), true);
  assert.equal(bcrypt.getRounds(call.parameters[3]), 12);
  assert.match(call.sql, /\$1, \$2, \$3, \$4, 'user', FALSE, 'pending'/);
  assert.equal(call.sql.includes(valid.lastName), false);
  assert.equal(JSON.stringify(body).includes(call.parameters[3]), false);
});

test('invalid input and privilege injection never reach PostgreSQL', async (t) => {
  let queries = 0;
  const { post } = await serve(t, { async query() { queries += 1; } });
  for (const body of [{}, { ...valid, role: 'superadmin' }, { ...valid, status: 'active' }, { ...valid, blocked: false }, { ...valid, stamp: 'fake' }, { ...valid, user_id: 1 }, { ...valid, confirmPassword: 'bad' }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(queries, 0);
});

test('database unique violation is a safe 409, and other database failures are safe 500', async (t) => {
  for (const code of ['23505', '42P01', 'ECONNREFUSED']) {
    const { post } = await serve(t, { async query() { throw Object.assign(new Error('private SQL details'), { code }); } });
    const response = await post(valid);
    assert.equal(response.status, code === '23505' ? 409 : 500);
    const body = await response.text();
    assert.equal(body.includes('private SQL details'), false);
    assert.equal(body.includes(code), false);
  }
});

test('non-JSON requests get 415 and an unconfigured pool gets 503', async (t) => {
  const { post } = await serve(t);
  assert.equal((await post(valid, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(valid)).status, 503);
});

test('registration attempts are rate limited before database access', async (t) => {
  const { post } = await serve(t);
  for (let attempt = 0; attempt < 20; attempt += 1) assert.equal((await post({})).status, 400);
  const response = await post(valid);
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('retry-after'));
  assert.match((await response.json()).error, /Too many/);
});

test('registration form and assets are served without exposing other prototype modules', async (t) => {
  const { url } = await serve(t);
  const response = await fetch(`${url}/register`);
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const field of ['firstName', 'lastName', 'email', 'password', 'confirmPassword']) assert.ok(html.includes(`name="${field}"`));
  assert.equal((await fetch(`${url}/register.js`)).status, 200);
  assert.equal((await fetch(`${url}/register.css`)).status, 200);
  assert.equal((await fetch(`${url}/api/login`, { method: 'POST' })).status, 404);
});
