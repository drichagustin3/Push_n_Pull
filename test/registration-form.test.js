const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function mount(fetch) {
  const fields = { firstName: 'Ana', lastName: 'Rivera', email: 'ana@example.com', password: 'SecurePass123!', confirmPassword: 'SecurePass123!' };
  const error = { textContent: '', focus() {} };
  const success = { textContent: '', focus() {} };
  const button = { disabled: false };
  const elements = { password: { value: fields.password }, confirmPassword: { value: fields.confirmPassword } };
  let submit;
  let resets = 0;
  const form = {
    elements, querySelector: () => button,
    addEventListener(event, callback) { assert.equal(event, 'submit'); submit = callback; },
    setAttribute() {}, removeAttribute() {}, reset() { resets += 1; },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../public/register.js'), 'utf8'), {
    document: { getElementById: (id) => ({ registerForm: form, registerError: error, registerSuccess: success })[id] },
    FormData: class { constructor() { return Object.entries(fields); } }, fetch,
  });
  return { fields, error, success, button, elements, resets: () => resets, submit: () => submit({ preventDefault() {} }) };
}

test('form submits only registration fields, displays pending success, clears passwords', async () => {
  let sent;
  const page = mount(async (url, options) => {
    sent = { url, options };
    return { ok: true, json: async () => ({ status: 'pending', message: 'Await approval.' }) };
  });
  await page.submit();
  assert.equal(sent.url, '/api/register');
  assert.equal(sent.options.method, 'POST');
  assert.deepEqual(JSON.parse(sent.options.body), page.fields);
  assert.equal(page.success.textContent, 'Await approval.');
  assert.equal(page.error.textContent, '');
  assert.equal(page.resets(), 1);
  assert.equal(page.elements.password.value, '');
  assert.equal(page.elements.confirmPassword.value, '');
  assert.equal(page.button.disabled, false);
});

test('form handles conflicts as text and enables retry', async () => {
  const message = '<img src=x onerror=alert(1)>';
  const page = mount(async () => ({ ok: false, json: async () => ({ error: message }) }));
  await page.submit();
  assert.equal(page.error.textContent, message);
  assert.equal(page.resets(), 0);
  assert.equal(page.button.disabled, false);
  assert.equal(page.elements.password.value, '');
});

test('form recovers from network failures and prevents duplicate in-flight requests', async () => {
  let calls = 0;
  let reject;
  const page = mount(() => { calls += 1; return new Promise((resolve, fail) => { reject = fail; }); });
  const first = page.submit();
  assert.equal(page.button.disabled, true);
  await page.submit();
  assert.equal(calls, 1);
  reject(new Error('private network detail'));
  await first;
  assert.match(page.error.textContent, /Check your connection/);
  assert.equal(page.error.textContent.includes('private network detail'), false);
  assert.equal(page.button.disabled, false);
  assert.equal(page.elements.password.value, '');
});

test('form catches confirmation mismatch before making a request', async () => {
  const page = mount(() => assert.fail('should not submit'));
  page.fields.confirmPassword = 'different';
  await page.submit();
  assert.equal(page.error.textContent, 'Passwords must match.');
  assert.equal(page.button.disabled, false);
});
