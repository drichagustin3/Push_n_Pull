const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tag = tag; this.childNodes = []; this.events = {}; this.attributes = {}; this.value = ''; this.hidden = false; }
  set textContent(value) { this.text = value; this.childNodes = []; }
  get textContent() { return this.text; }
  set innerHTML(value) { assert.fail('Dynamic HTML must not be interpreted'); }
  append(...nodes) { this.childNodes.push(...nodes); }
  replaceChildren(...nodes) { this.childNodes = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, fn) { this.events[event] = fn; }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (data, status = 200) => ({ status, ok: status < 400, json: async () => data });
function data(metadata = false) {
  return { customers: [{ custno: 'C0001', custname: '<script>private()</script>', address: 'Sample', payterm: 'COD', ...(metadata ? { status: 'inactive', stamp: 'fixture actor' } : {}) }],
    capabilities: { metadata, add: false, edit: true, delete: metadata }, filter: { search: '', status: metadata ? 'all' : 'active' }, ...(metadata ? { counts: { active: 0, inactive: 1, all: 1 } } : {}) };
}
function mount(fetch) {
  const nodes = Object.fromEntries(['customerSearch','customerTabs','customerTable','customerHead','customerRows','customerStatus','customerRetry','customerAdd'].map((id) => [id, new Element()]));
  const events = {}, redirects = [], timers = new Map(); let serial = 0;
  vm.runInNewContext(readFileSync(path.resolve(__dirname, '../public/customers.js'), 'utf8'), {
    document: { getElementById: (id) => nodes[id], createElement: (tag) => new Element(tag), addEventListener: (key, fn) => { events['document:' + key] = fn; }, hidden: false },
    window: { location: { assign: (url) => redirects.push(url) }, addEventListener: (key, fn) => { events[key] = fn; } },
    fetch, URLSearchParams, setTimeout: (fn) => { timers.set(++serial, fn); return serial; }, clearTimeout: (id) => timers.delete(id),
  });
  return { nodes, events, redirects, tick: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); } };
}
test('User table excludes metadata/tabs and safely renders text; actions are disabled and permission-gated', async () => {
  const ui = mount(async () => response(data())); await flush();
  assert.equal(ui.nodes.customerTabs.hidden, true); assert.equal(ui.nodes.customerAdd.hidden, true);
  assert.equal(ui.nodes.customerHead.childNodes[0].childNodes.length, 5);
  const cells = ui.nodes.customerRows.childNodes[0].childNodes;
  assert.equal(cells[1].textContent, '<script>private()</script>'); assert.equal(cells[4].childNodes[0].disabled, true);
});
test('Admin filters display dynamic counts and inactive restore placeholders without mutation calls', async () => {
  const calls = []; const payload = data(true);
  const ui = mount(async (url, options) => { calls.push(url); assert.equal(options.method, undefined); return response(payload); }); await flush();
  assert.equal(ui.nodes.customerTabs.childNodes[2].textContent, 'All (1)');
  assert.equal(ui.nodes.customerHead.childNodes[0].childNodes.length, 7);
  assert.match(ui.nodes.customerRows.childNodes[0].childNodes[6].childNodes[0].textContent, /Restore/);
  ui.nodes.customerTabs.childNodes[1].events.click(); await flush(); assert.match(calls.at(-1), /status=inactive/);
  payload.capabilities.edit = false; payload.capabilities.delete = false; ui.events.focus(); await flush();
  assert.equal(ui.nodes.customerHead.childNodes[0].childNodes.length, 6);
});
test('live search encodes input, clears stale rows, and ignores out-of-order responses', async () => {
  let finish, calls = 0;
  const ui = mount(async (url) => { ++calls; if (calls === 1) return new Promise((resolve) => { finish = resolve; }); assert.match(url, /search=A%26B/); return response({ ...data(), customers: [] }); });
  ui.nodes.customerSearch.value = 'A&B'; ui.nodes.customerSearch.events.input();
  assert.equal(ui.nodes.customerRows.childNodes.length, 0); ui.tick(); await flush();
  assert.match(ui.nodes.customerStatus.textContent, /No customers/);
  finish(response(data(true))); await flush(); assert.equal(ui.nodes.customerRows.childNodes.length, 0); assert.equal(ui.nodes.customerTabs.hidden, true);
});
test('error/permission loss clears customer data, retry recovers, and expired sessions redirect', async () => {
  let result = response(data(true));
  const ui = mount(async () => result); await flush();
  result = response({ message: 'private SQL detail' }, 503); ui.events.focus(); await flush();
  assert.equal(ui.nodes.customerRows.childNodes.length, 0); assert.equal(ui.nodes.customerTabs.hidden, true);
  assert.doesNotMatch(ui.nodes.customerStatus.textContent, /private/); assert.equal(ui.nodes.customerRetry.hidden, false);
  result = response(data()); ui.nodes.customerRetry.events.click(); await flush(); assert.equal(ui.nodes.customerRows.childNodes.length, 1);
  result = response({}, 403); ui.events.focus(); await flush(); assert.equal(ui.nodes.customerRows.childNodes.length, 0);
  result = response({}, 401); ui.events.focus(); await flush(); assert.deepEqual(ui.redirects, ['/login?terminated=1']);
});
