const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.childNodes = []; this.events = {}; this.attributes = {}; this.value = ''; this.hidden = false; }
  set textContent(value) { this.text = value; this.childNodes = []; } get textContent() { return this.text; }
  set innerHTML(value) { assert.fail('Product data must not be HTML'); }
  append(...nodes) { this.childNodes.push(...nodes); } replaceChildren(...nodes) { this.childNodes = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; } addEventListener(key, fn) { this.events[key] = fn; }
}
const flush = () => new Promise(r => setImmediate(r));
const response = (data, status = 200) => ({ status, ok: status < 400, json: async () => data });
function data(metadata = false) { return { products: [{ prodcode: 'P00001', description: '<script>sample()</script>', unit: 'pc', currentPrice: '1234.56', ...(metadata ? { status: 'inactive', stamp: 'fixture' } : {}) }], filter: { search: '', status: metadata ? 'all' : 'active' }, capabilities: { metadata, add: false, edit: true, delete: metadata, prices: false }, ...(metadata ? { counts: { active: 0, inactive: 1, all: 1 } } : {}) }; }
function mount(fetch) {
  const nodes = Object.fromEntries(['productSearch','productTabs','productTable','productHead','productRows','productStatus','productRetry','productAdd'].map(id => [id, new Element()])); const events = {}, redirects = [], timers = new Map(); let id = 0;
  vm.runInNewContext(readFileSync('public/products.js', 'utf8'), { fetch, URLSearchParams, document: { getElementById: key => nodes[key], createElement: () => new Element(), addEventListener: (key, fn) => { events['document:' + key] = fn; }, hidden: false }, window: { location: { assign: url => redirects.push(url) }, addEventListener: (key, fn) => { events[key] = fn; } }, setTimeout: fn => { timers.set(++id, fn); return id; }, clearTimeout: key => timers.delete(key) });
  return { nodes, events, redirects, tick: () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); } };
}
test('User table hides metadata/tabs, displays safe text and only disabled authorized action controls', async () => {
  const ui = mount(async () => response(data())); await flush(); assert.equal(ui.nodes.productTabs.hidden, true); assert.equal(ui.nodes.productAdd.hidden, true);
  const cells = ui.nodes.productRows.childNodes[0].childNodes; assert.equal(cells[1].textContent, '<script>sample()</script>'); assert.equal(cells[3].textContent, '₱1,234.56'); assert.equal(cells[4].childNodes[0].disabled, true); assert.equal(ui.nodes.productHead.childNodes[0].childNodes.length, 5);
});
test('decimal formatting never converts money to Number and uses an em dash only for missing price', async () => {
  const payload = data(); payload.products = ['99999999.99','9007199254740993.01','0.10',null].map((currentPrice, i) => ({ prodcode: 'P' + i, description: 'Synthetic', unit: 'pc', currentPrice }));
  const ui = mount(async () => response(payload)); await flush(); assert.deepEqual(ui.nodes.productRows.childNodes.map(r => r.childNodes[3].textContent), ['₱99,999,999.99','₱9,007,199,254,740,993.01','₱0.10','—']);
});
test('privileged tabs use dynamic counts and action capability changes clear obsolete controls', async () => {
  const calls = [], payload = data(true); const ui = mount(async url => { calls.push(url); return response(payload); }); await flush();
  assert.equal(ui.nodes.productHead.childNodes[0].childNodes.length, 7); assert.match(ui.nodes.productRows.childNodes[0].childNodes[6].childNodes[0].textContent, /Restore/);
  ui.nodes.productTabs.childNodes[1].events.click(); await flush(); assert.match(calls.at(-1), /status=inactive/);
  payload.capabilities.edit = false; payload.capabilities.delete = false; ui.events.focus(); await flush(); assert.equal(ui.nodes.productHead.childNodes[0].childNodes.length, 6);
});
test('debounced search encodes input, removes stale rows and ignores older response data', async () => {
  let finish, calls = 0; const ui = mount(async url => { if (++calls === 1) return new Promise(r => { finish = r; }); assert.match(url, /search=A%26B/); return response({ ...data(), products: [] }); });
  ui.nodes.productSearch.value = 'A&B'; ui.nodes.productSearch.events.input(); ui.tick(); await flush(); assert.match(ui.nodes.productStatus.textContent, /No products/);
  finish(response(data(true))); await flush(); assert.equal(ui.nodes.productRows.childNodes.length, 0); assert.equal(ui.nodes.productTabs.hidden, true);
});
test('errors/revocation clear rows and counts; retries recover and expired sessions redirect', async () => {
  let result = response(data(true)); const ui = mount(async () => result); await flush(); result = response({ message: 'private SQL' }, 503); ui.events.focus(); await flush();
  assert.equal(ui.nodes.productRows.childNodes.length, 0); assert.equal(ui.nodes.productTabs.hidden, true); assert.doesNotMatch(ui.nodes.productStatus.textContent, /private/); assert.equal(ui.nodes.productRetry.hidden, false);
  result = response(data()); ui.nodes.productRetry.events.click(); await flush(); assert.equal(ui.nodes.productRows.childNodes.length, 1);
  result = response({}, 403); ui.events.focus(); await flush(); assert.equal(ui.nodes.productRows.childNodes.length, 0);
  result = response({}, 401); ui.events.focus(); await flush(); assert.deepEqual(ui.redirects, ['/login?terminated=1']);
});
