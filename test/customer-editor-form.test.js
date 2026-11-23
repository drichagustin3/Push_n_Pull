const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.value = ''; this.events = {}; this.disabled = false; this.open = false; this.textContent = ''; }
  addEventListener(name, fn) { this.events[name] = fn; }
  setAttribute() {} removeAttribute() {} focus() { this.focused = true; }
  showModal() { this.open = true; } close() { this.open = false; }
  reportValidity() { return this.valid !== false; }
}
const response = (status, message) => ({ status, ok: status < 400, json: async () => ({ message }) });
function mount(fetch) {
  const names = ['customerEditor', 'customerForm', 'customerNumber', 'customerName', 'customerAddress', 'customerTerms', 'customerFormError', 'customerSave', 'customerCancel', 'customerAdd', 'customerEditorTitle'];
  const nodes = Object.fromEntries(names.map(name => [name, new Element()]));
  nodes.customerForm.reset = () => { for (const key of ['customerNumber', 'customerName', 'customerAddress', 'customerTerms']) nodes[key].value = ''; };
  const events = [], redirects = [], window = { location: { assign: url => redirects.push(url) } };
  vm.runInNewContext(readFileSync('public/customer-editor.js', 'utf8'), { window, document: { getElementById: id => nodes[id], activeElement: new Element(), dispatchEvent: e => events.push(e.type) }, Event: class { constructor(type) { this.type = type; } }, fetch });
  const submit = () => nodes.customerForm.events.submit({ preventDefault() {} });
  return { nodes, window, events, redirects, submit };
}
test('create form posts only contract fields; duplicate submission is blocked until completion', async () => {
  let finish, calls = 0;
  const ui = mount(async (url, options) => { ++calls; assert.equal(url, '/api/customers'); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), { custNo: 'B0001', custName: 'Sample', address: '', payTerms: 'Net 15' }); return new Promise(resolve => { finish = resolve; }); });
  ui.nodes.customerAdd.events.click();
  Object.assign(ui.nodes.customerNumber, { value: 'B0001' }); ui.nodes.customerName.value = 'Sample'; ui.nodes.customerTerms.value = 'Net 15';
  const first = ui.submit(); await ui.submit(); assert.equal(calls, 1); assert.equal(ui.nodes.customerSave.disabled, true);
  finish(response(201)); await first;
  assert.equal(ui.nodes.customerEditor.open, false); assert.equal(ui.nodes.customerName.value, ''); assert.deepEqual(ui.events, ['customers:changed']);
});
test('edit prefill maps storage codes, locks customer number and sends no immutable/system fields', async () => {
  const ui = mount(async (url, options) => { assert.equal(url, '/api/customers/B%2F001'); assert.equal(options.method, 'PUT'); assert.deepEqual(JSON.parse(options.body), { custName: 'Changed', address: 'City', payTerms: 'Prepaid' }); return response(200); });
  ui.window.customerEditor.open({ custno: 'B/001', custname: 'Sample', address: 'City', payterm: 'PRE' });
  assert.equal(ui.nodes.customerNumber.disabled, true); assert.equal(ui.nodes.customerTerms.value, 'Prepaid');
  ui.nodes.customerName.value = 'Changed'; await ui.submit(); assert.equal(ui.nodes.customerEditor.open, false);
});
test('validation/duplicate errors remain visible for correction; cancel resets; no invalid submit occurs', async () => {
  const ui = mount(async () => response(409, 'Customer number already exists.'));
  ui.nodes.customerAdd.events.click(); await ui.submit(); assert.equal(ui.nodes.customerEditor.open, true); assert.match(ui.nodes.customerFormError.textContent, /already exists/);
  ui.nodes.customerCancel.events.click(); assert.equal(ui.nodes.customerEditor.open, false);
  ui.nodes.customerAdd.events.click(); ui.nodes.customerForm.valid = false; await ui.submit(); assert.equal(ui.nodes.customerSave.disabled, false);
});
test('network failures do not echo diagnostics; permission/session loss clears customer form', async () => {
  const failed = mount(async () => { throw new Error('private diagnostic'); }); failed.nodes.customerAdd.events.click(); await failed.submit();
  assert.doesNotMatch(failed.nodes.customerFormError.textContent, /private/); assert.match(failed.nodes.customerFormError.textContent, /could not be confirmed/);
  for (const status of [401, 403]) {
    const ui = mount(async () => response(status)); ui.nodes.customerAdd.events.click(); ui.nodes.customerName.value = 'Customer'; await ui.submit();
    assert.equal(ui.nodes.customerEditor.open, false); assert.equal(ui.nodes.customerName.value, '');
    assert.deepEqual(status === 401 ? ui.redirects : ui.events, status === 401 ? ['/login?terminated=1'] : ['customers:changed']);
  }
});
