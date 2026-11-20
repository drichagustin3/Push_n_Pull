const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = '') { this.tag = tag; this.childNodes = []; this.events = {}; this.dataset = {}; this.disabled = false; this.checked = false; this.indeterminate = false; this.open = false; this._text = ''; this.focused = 0; }
  set textContent(text) { this._text = text; this.childNodes = []; }
  get textContent() { return this._text; }
  append(element) { this.childNodes.push(element); }
  replaceChildren(...elements) { this.childNodes = elements; }
  addEventListener(name, callback) { this.events[name] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused += 1; }
}
function catalogue(granted = []) {
  return { modules: Object.entries({ customer: 3, product: 6, human_resources: 13, sales: 7, reports: 7 }).map(([code, count]) => ({ code, description: code,
    rights: Array.from({ length: count }, (_, i) => ({ rightCode: `${code}.action${i}`, description: `Action ${i}`, granted: granted.includes(`${code}.action${i}`) })) })) };
}
const response = (data, ok = true) => ({ ok, json: async () => data });
function mount(fetch) {
  const nodes = Object.fromEntries(['rightsDialog', 'rightsModules', 'rightsStatus', 'rightsCount', 'rightsSave', 'rightsCancel', 'rightsAll', 'rightsNone', 'rightsTarget'].map((id) => [id, new Element()]));
  const window = {};
  vm.runInNewContext(readFileSync(path.resolve(__dirname, '../public/rights.js'), 'utf8'), {
    document: { getElementById: (id) => nodes[id], createElement: (tag) => new Element(tag) }, window, fetch, TypeError,
  });
  function descendants(element) { return element.childNodes.flatMap((child) => [child, ...descendants(child)]); }
  return { nodes, open: window.HopeRights.open, trigger: new Element('button'),
    inputs: () => descendants(nodes.rightsModules).filter((element) => element.tag === 'input' && element.value),
    headers: () => descendants(nodes.rightsModules).filter((element) => element.dataset.module) };
}
const target = { user_id: '7', first_name: '<img src=x onerror=alert(1)>', last_name: 'Fixture' };

test('36 action checkboxes, partial module state, module toggles, and global All/None synchronize', async () => {
  const ui = mount(async () => response(catalogue(['customer.action0'])));
  await ui.open(target, ui.trigger);
  assert.equal(ui.inputs().length, 36); assert.equal(ui.headers().length, 5);
  assert.equal(ui.nodes.rightsCount.textContent, '1 / 36');
  assert.equal(ui.headers()[0].indeterminate, true); assert.equal(ui.headers()[0].checked, false);
  assert.equal(ui.nodes.rightsTarget.textContent, 'Target User: ' + target.first_name + ' Fixture');
  ui.headers()[0].checked = true; ui.headers()[0].events.change();
  assert.equal(ui.inputs().filter((input) => input.checked).length, 3); assert.equal(ui.headers()[0].indeterminate, false);
  ui.inputs()[0].checked = false; ui.inputs()[0].events.change(); assert.equal(ui.headers()[0].indeterminate, true);
  ui.headers()[0].checked = false; ui.headers()[0].events.change(); assert.equal(ui.nodes.rightsCount.textContent, '0 / 36');
  ui.nodes.rightsAll.events.click(); assert.equal(ui.nodes.rightsCount.textContent, '36 / 36'); assert.ok(ui.headers().every((header) => header.checked && !header.indeterminate));
  ui.nodes.rightsNone.events.click(); assert.equal(ui.nodes.rightsCount.textContent, '0 / 36'); assert.ok(ui.headers().every((header) => !header.checked && !header.indeterminate));
});
test('Cancel/Escape discard selections without PUT and return focus; reopening reads server state', async () => {
  const requests = [];
  const ui = mount(async (url, options) => { requests.push({ url, options }); return response(catalogue()); });
  await ui.open(target, ui.trigger); ui.nodes.rightsAll.events.click(); ui.nodes.rightsCancel.events.click();
  assert.equal(ui.nodes.rightsDialog.open, false); assert.equal(ui.trigger.focused, 1);
  assert.equal(requests.some((request) => request.options?.method === 'PUT'), false);
  await ui.open(target, ui.trigger); assert.equal(ui.nodes.rightsCount.textContent, '0 / 36');
  let prevented = false; ui.nodes.rightsDialog.events.cancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(ui.nodes.rightsDialog.open, false);
});
test('save failures retain selections; duplicate saving/closing is prevented; success uses confirmed server state', async () => {
  let complete, sent, calls = 0;
  const ui = mount(async (url, options) => {
    if (!options?.method) return response(catalogue());
    calls += 1; sent = JSON.parse(options.body); return new Promise((resolve) => { complete = resolve; });
  });
  await ui.open(target, ui.trigger); ui.inputs()[0].checked = true; ui.inputs()[0].events.change();
  const pending = ui.nodes.rightsSave.events.click();
  await ui.nodes.rightsSave.events.click(); ui.nodes.rightsCancel.events.click();
  assert.equal(calls, 1); assert.equal(ui.nodes.rightsDialog.open, true); assert.equal(ui.nodes.rightsCancel.disabled, true);
  assert.deepEqual(sent, { rightCodes: ['customer.action0'] });
  complete(response({ error: 'Permission save failed.' }, false)); await pending;
  assert.equal(ui.inputs()[0].checked, true); assert.equal(ui.nodes.rightsStatus.textContent, 'Permission save failed.');
  assert.equal(ui.nodes.rightsSave.disabled, false);
  const retry = ui.nodes.rightsSave.events.click(); complete(response(catalogue(['product.action0']))); await retry;
  assert.equal(ui.nodes.rightsStatus.textContent, 'Rights saved.'); assert.equal(ui.nodes.rightsCount.textContent, '1 / 36');
  assert.equal(ui.inputs().find((input) => input.value === 'product.action0').checked, true);
  assert.equal(ui.inputs()[0].checked, false);
});
test('cancelled loads cannot overwrite a subsequently opened target; failed loads permit safe closure', async () => {
  let firstComplete, calls = 0;
  const ui = mount(async () => {
    calls += 1; if (calls === 1) return new Promise((resolve) => { firstComplete = resolve; });
    return response(catalogue(['product.action0']));
  });
  const first = ui.open(target, ui.trigger); assert.equal(ui.nodes.rightsSave.disabled, true);
  ui.nodes.rightsCancel.events.click();
  await ui.open({ ...target, user_id: '8', first_name: 'New' }, ui.trigger);
  firstComplete(response(catalogue())); await first;
  assert.equal(ui.nodes.rightsTarget.textContent, 'Target User: New Fixture'); assert.equal(ui.nodes.rightsCount.textContent, '1 / 36');
  const failure = mount(async () => { throw new TypeError('private network detail'); });
  await failure.open(target, failure.trigger); assert.equal(failure.nodes.rightsStatus.textContent, 'Check your connection and try again.');
  assert.equal(failure.nodes.rightsSave.disabled, true); assert.equal(failure.nodes.rightsCancel.disabled, false);
});
