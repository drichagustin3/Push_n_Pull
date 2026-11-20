const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function mount({ reset = true, hash = '#token=' + 'a'.repeat(64), search = '', fetch }) {
  let submit;
  const fields = reset ? { newPassword: 'FixturePassword123!', confirmPassword: 'FixturePassword123!' } : { email: 'fixture@example.test' };
  const button = { disabled: false }, message = { textContent: '', focus() {} }, history = [];
  const secrets = [{ value: 'private' }, { value: 'private' }];
  const form = { querySelector: () => button, querySelectorAll: () => secrets,
    addEventListener(event, handler) { submit = handler; }, setAttribute() {}, removeAttribute() {}, reset() {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../public/password-reset.js'), 'utf8'), {
    document: { getElementById: (id) => ({ resetMessage: message, resetPasswordForm: reset ? form : null, forgotPasswordForm: reset ? null : form })[id] },
    window: { location: { hash, search }, history: { replaceState: (...args) => history.push(args) } },
    URLSearchParams, FormData: class { constructor() { return Object.entries(fields); } }, fetch,
  });
  return { fields, button, message, secrets, history, submit: () => submit({ preventDefault() {} }) };
}

test('reset form removes bearer token from history and prevents duplicate/replayed submission', async () => {
  let resolve, sent, calls = 0;
  const ui = mount({ fetch: (url, options) => { calls += 1; sent = { url, body: JSON.parse(options.body) }; return new Promise((done) => { resolve = done; }); } });
  assert.equal(ui.history[0][2], '/reset-password');
  const first = ui.submit();
  await ui.submit();
  assert.equal(calls, 1);
  assert.equal(sent.url, '/api/auth/reset-password');
  assert.equal(sent.body.token, 'a'.repeat(64));
  resolve({ ok: true, json: async () => ({ message: 'Password updated.' }) });
  await first;
  await ui.submit();
  assert.equal(calls, 1);
  assert.equal(ui.button.disabled, true);
  assert.ok(ui.secrets.every((input) => input.value === ''));
});

test('missing token disables reset; query links also work; password mismatch never submits', async () => {
  const invalid = mount({ hash: '', fetch: () => assert.fail('no submission') });
  assert.equal(invalid.button.disabled, true);
  await invalid.submit();
  const ui = mount({ hash: '', search: '?token=' + 'b'.repeat(64), fetch: () => assert.fail('mismatched passwords') });
  ui.fields.confirmPassword = 'DifferentPassword123!';
  await ui.submit();
  assert.equal(ui.message.textContent, 'Passwords must match.');
  assert.equal(ui.button.disabled, false);
});

test('forgot form sends email and displays safe text; network failure permits retry and clears passwords', async () => {
  let sent;
  const ui = mount({ reset: false, fetch: async (url, options) => {
    sent = { url, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ message: 'If an active account exists, a link has been sent.' }) };
  } });
  await ui.submit();
  assert.equal(sent.url, '/api/auth/forgot-password');
  assert.deepEqual(sent.body, { email: ui.fields.email });
  assert.equal(ui.button.disabled, false);
  const failure = mount({ fetch: async () => { throw new Error('private network detail'); } });
  await failure.submit();
  assert.equal(failure.message.textContent, 'Check your connection and try again.');
  assert.equal(failure.button.disabled, false);
  assert.ok(failure.secrets.every((input) => input.value === ''));
});
