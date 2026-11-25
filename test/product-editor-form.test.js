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
  const names = ['productEditor', 'productForm', 'productCode', 'productDescription', 'productUnit', 'productFormError', 'productSave', 'productCancel', 'productAdd', 'productEditorTitle', 'productNotice'];
  const nodes = Object.fromEntries(names.map(name => [name, new Element()]));
  nodes.productForm.reset = () => { for (const key of ['productCode', 'productDescription', 'productUnit']) nodes[key].value = ''; };
  const events = [], redirects = [], window = { location: { assign: url => redirects.push(url) } };
  vm.runInNewContext(readFileSync('public/product-editor.js', 'utf8'), { window, document: { getElementById: id => nodes[id], activeElement: new Element(), dispatchEvent: e => events.push(e.type) }, Event: class { constructor(type) { this.type = type; } }, fetch });
  const submit = () => nodes.productForm.events.submit({ preventDefault() {} });
  return { nodes, window, events, redirects, submit };
}
test('create form posts only contract fields; duplicate submission is blocked until completion', async () => {
  let finish, calls = 0;
  const ui = mount(async (url, options) => { ++calls; assert.equal(url, '/api/products'); assert.equal(options.method, 'POST'); assert.deepEqual(JSON.parse(options.body), { prodCode: 'B0001', description: 'Sample', unit: 'pcs' }); return new Promise(resolve => { finish = resolve; }); });
  ui.nodes.productAdd.events.click();
  Object.assign(ui.nodes.productCode, { value: 'B0001' }); ui.nodes.productDescription.value = 'Sample'; ui.nodes.productUnit.value = 'pcs';
  const first = ui.submit(); await ui.submit(); assert.equal(calls, 1); assert.equal(ui.nodes.productSave.disabled, true);
  finish(response(201)); await first;
  assert.equal(ui.nodes.productEditor.open, false); assert.equal(ui.nodes.productDescription.value, ''); assert.deepEqual(ui.events, ['products:changed']);
});
test('edit prefill preserves stored units, locks product code and sends no immutable/system fields', async () => {
  const ui = mount(async (url, options) => { assert.equal(url, '/api/products/B%2F001'); assert.equal(options.method, 'PUT'); assert.deepEqual(JSON.parse(options.body), { description: 'Changed', unit: 'meter' }); return response(200); });
  ui.window.productEditor.open({ prodcode: 'B/001', description: 'Sample', unit: 'meter' });
  assert.equal(ui.nodes.productCode.disabled, true); assert.equal(ui.nodes.productUnit.value, 'meter');
  ui.nodes.productDescription.value = 'Changed'; await ui.submit(); assert.equal(ui.nodes.productEditor.open, false);
});
test('validation/duplicate errors remain visible for correction; cancel resets; no invalid submit occurs', async () => {
  const ui = mount(async () => response(400, 'Product code already exists.'));
  ui.nodes.productAdd.events.click(); await ui.submit(); assert.equal(ui.nodes.productEditor.open, true); assert.match(ui.nodes.productFormError.textContent, /already exists/);
  ui.nodes.productCancel.events.click(); assert.equal(ui.nodes.productEditor.open, false);
  ui.nodes.productAdd.events.click(); ui.nodes.productForm.valid = false; await ui.submit(); assert.equal(ui.nodes.productSave.disabled, false);
});
test('network failures do not echo diagnostics; permission/session loss clears product form', async () => {
  const failed = mount(async () => { throw new Error('private diagnostic'); }); failed.nodes.productAdd.events.click(); await failed.submit();
  assert.doesNotMatch(failed.nodes.productFormError.textContent, /private/); assert.match(failed.nodes.productFormError.textContent, /could not be confirmed/);
  for (const status of [401, 403]) {
    const ui = mount(async () => response(status)); ui.nodes.productAdd.events.click(); ui.nodes.productDescription.value = 'Product'; await ui.submit();
    assert.equal(ui.nodes.productEditor.open, false); assert.equal(ui.nodes.productDescription.value, '');
    assert.deepEqual(status === 401 ? ui.redirects : ui.events, status === 401 ? ['/login?terminated=1'] : ['products:changed']);
  }
});
