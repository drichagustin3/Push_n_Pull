const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { validateCustomerStateBody, customerNumber } = require('../src/customers/validation');

test('state transitions reject injected fields and malformed identifiers', () => {
  validateCustomerStateBody(undefined); validateCustomerStateBody({});
  for (const body of [null, [], { status: 'active' }, { stamp: 'spoof' }, { role: 'superadmin' }, { is_deleted: false }]) assert.throws(() => validateCustomerStateBody(body), e => e.status === 400);
  for (const id of ['', '\0', '123456', ['C0001']]) assert.throws(() => customerNumber(id), e => e.status === 400);
});
function mount(fetch, confirm = true) {
  const message = { textContent: '', focus() {} }, events = [], redirects = [], button = { disabled: false };
  const window = { confirm: () => confirm, location: { assign: url => redirects.push(url) } };
  vm.runInNewContext(readFileSync('public/customer-state.js', 'utf8'), { window, document: { getElementById: () => message, dispatchEvent: e => events.push(e.type) }, Event: class { constructor(type) { this.type = type; } }, fetch, Set });
  return { window, message, events, redirects, button };
}
const response = (status, message) => ({ status, ok: status < 400, json: async () => ({ message }) });
test('confirmation cancellation makes no request; pending customer requests cannot be duplicated', async () => {
  const canceled = mount(() => assert.fail('cancelled action'), false); await canceled.window.customerState.change({ custno: 'C0001' }, false, canceled.button);
  let finish, calls = 0;
  const ui = mount(async (url, options) => { ++calls; assert.equal(url, '/api/customers/C0001'); assert.equal(options.method, 'DELETE'); assert.equal(options.body, '{}'); return new Promise(r => { finish = r; }); });
  const first = ui.window.customerState.change({ custno: 'C0001' }, false, ui.button);
  await ui.window.customerState.change({ custno: 'C0001' }, false, ui.button);
  assert.equal(calls, 1); assert.equal(ui.button.disabled, true); finish(response(200)); await first;
  assert.deepEqual(ui.events, ['customers:changed']); assert.match(ui.message.textContent, /made inactive/); assert.equal(ui.button.disabled, false);
});
test('restore uses encoded identifier and correct method; conflicts and revocation refresh stale data', async () => {
  const ui = mount(async (url, options) => { assert.equal(url, '/api/customers/C%2F001/restore'); assert.equal(options.method, 'PUT'); return response(200); });
  await ui.window.customerState.change({ custno: 'C/001' }, true, ui.button); assert.match(ui.message.textContent, /restored/);
  for (const status of [400, 403, 404]) {
    const rejected = mount(async () => response(status, 'State conflict.')); await rejected.window.customerState.change({ custno: 'C0001' }, false, rejected.button);
    assert.deepEqual(rejected.events, ['customers:changed']);
  }
});
test('dependency/network errors hide diagnostics and expired sessions redirect', async () => {
  const unavailable = mount(async () => response(503, 'private SQL detail')); await unavailable.window.customerState.change({ custno: 'C0001' }, false, unavailable.button);
  assert.doesNotMatch(unavailable.message.textContent, /private|SQL/);
  const network = mount(async () => { throw new Error('private network detail'); }); await network.window.customerState.change({ custno: 'C0001' }, false, network.button); assert.match(network.message.textContent, /Refresh the list before retrying/);
  const expired = mount(async () => response(401)); await expired.window.customerState.change({ custno: 'C0001' }, false, expired.button); assert.deepEqual(expired.redirects, ['/login?terminated=1']);
});
