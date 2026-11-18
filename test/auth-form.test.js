const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function mount({ endpoint = 'login', fetch, account = false, search = '' }) {
  let submit;
  let logout;
  const redirects = [];
  const fields = endpoint === 'login' ? { email: ' ana@example.com ', password: 'Password12345!', setup_token: '' } : { new_password: 'Password12345!', confirm_password: 'Password12345!' };
  const message = { textContent: '', focus() {} };
  const button = { disabled: false };
  const secrets = [{ value: 'private' }, { value: 'private' }];
  const email = { textContent: '' };
  const form = {
    addEventListener(event, fn) { submit = fn; }, querySelector: () => button,
    querySelectorAll: () => secrets, setAttribute() {}, removeAttribute() {}, reset() {},
  };
  const signOut = { addEventListener(event, fn) { logout = fn; } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../public/auth.js'), 'utf8'), {
    document: { getElementById: (id) => ({ authMessage: message, [endpoint === 'login' ? 'loginForm' : 'setPasswordForm']: account ? null : form, logout: signOut, accountEmail: account ? email : null })[id] },
    window: { location: { search, assign: (url) => redirects.push(url) } },
    TypeError, URLSearchParams, FormData: class { constructor() { return Object.entries(fields); } }, fetch,
  });
  return { fields, redirects, message, button, secrets, email,
    submit: () => submit({ preventDefault() {} }), logout: () => logout({ currentTarget: button }) };
}

test('login submits credentials and redirects restricted sessions without browser storage', async () => {
  let sent;
  const ui = mount({ fetch: async (url, options) => {
    sent = { url, options };
    return { ok: true, json: async () => ({ redirect: '/set-password' }) };
  } });
  await ui.submit();
  assert.equal(sent.url, '/api/v1/auth/login');
  assert.deepEqual(JSON.parse(sent.options.body), { email: 'ana@example.com', password: 'Password12345!' });
  assert.deepEqual(ui.redirects, ['/set-password']);
  assert.ok(ui.secrets.every((input) => input.value === ''));
});

test('first-login token replaces password; safe account errors allow retry', async () => {
  let sent;
  const ui = mount({ fetch: async (url, options) => {
    sent = JSON.parse(options.body);
    return { ok: false, status: 403, json: async () => ({ message: 'Your account is awaiting approval.' }) };
  } });
  ui.fields.password = '';
  ui.fields.setup_token = 'private setup credential';
  await ui.submit();
  assert.equal(sent.password, undefined);
  assert.equal(sent.setup_token, ui.fields.setup_token);
  assert.equal(ui.message.textContent, 'Your account is awaiting approval.');
  assert.equal(ui.button.disabled, false);
  assert.deepEqual(ui.redirects, []);
});

test('password setup submits once and handles revoked sessions', async () => {
  let resolve;
  let calls = 0;
  const ui = mount({ endpoint: 'set-password', fetch: () => { calls += 1; return new Promise((done) => { resolve = done; }); } });
  const first = ui.submit();
  await ui.submit();
  assert.equal(calls, 1);
  resolve({ ok: false, status: 401, json: async () => ({ message: 'Please sign in again.' }) });
  await first;
  assert.deepEqual(ui.redirects, ['/login?terminated=1']);
  assert.equal(ui.button.disabled, false);
});

test('network errors clear secrets and re-enable the form', async () => {
  const ui = mount({ fetch: async () => { throw new TypeError('private network details'); } });
  await ui.submit();
  assert.match(ui.message.textContent, /Check your connection/);
  assert.ok(ui.secrets.every((input) => input.value === ''));
  assert.equal(ui.button.disabled, false);
});

test('logout returns to login, and revoked account sessions redirect with a notice', async () => {
  let endpoint;
  const ui = mount({ fetch: async (url) => { endpoint = url; return { ok: true, json: async () => ({ message: 'Logged out successfully.' }) }; } });
  await ui.logout();
  assert.equal(endpoint, '/api/v1/auth/logout');
  assert.deepEqual(ui.redirects, ['/login']);
  const revoked = mount({ account: true, search: '?terminated=1', fetch: async () => ({ ok: false, json: async () => ({ message: 'Your account has been blocked.' }) }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(revoked.redirects, ['/login?terminated=1']);
  assert.match(revoked.message.textContent, /session ended/);
});
