const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() { this.childNodes = []; this.events = {}; this.disabled = false; this._text = ''; this.attributes = {}; }
  set textContent(value) { this._text = value; this.childNodes = []; }
  get textContent() { return this._text; }
  append(...elements) { this.childNodes.push(...elements); }
  replaceChildren(...elements) { this.childNodes = elements; }
  addEventListener(event, callback) { this.events[event] = callback; }
  setAttribute(key, value) { this.attributes[key] = value; }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const navigation = (items = [{ code: 'customer', href: '/workspace/customer', label: 'Customers' }]) => ({ user: { name: '<img src=x>', username: 'user@example.test', role: 'user' }, items, restricted: items.length === 0 });
function mount(fetch) {
  const nodes = Object.fromEntries(['workspaceNav', 'workspaceStatus', 'workspaceTiles', 'workspaceMetrics', 'workspaceLogout', 'workspaceName', 'workspaceRole'].map((id) => [id, new Element()]));
  const events = {}, redirects = [];
  vm.runInNewContext(readFileSync(path.resolve(__dirname, '../public/workspace.js'), 'utf8'), {
    document: { getElementById: (id) => nodes[id], createElement: () => new Element(), addEventListener: (event, fn) => { events['document:' + event] = fn; }, hidden: false },
    window: { location: { pathname: '/account', assign: (url) => redirects.push(url) }, addEventListener: (event, fn) => { events[event] = fn; } },
    fetch, TypeError, Intl, BigInt,
  });
  return { nodes, events, redirects };
}
test('sidebar and tiles use the same server-authorized items and safely render dynamic identity/counts', async () => {
  const ui = mount(async (url) => url === '/api/navigation' ? response(navigation()) : response({ metrics: { customers: '9007199254740993' } }));
  await flush();
  assert.equal(ui.nodes.workspaceNav.childNodes.length, 2); assert.equal(ui.nodes.workspaceTiles.childNodes.length, 1);
  assert.equal(ui.nodes.workspaceTiles.childNodes[0].href, '/workspace/customer');
  assert.equal(ui.nodes.workspaceName.textContent, '<img src=x>');
  assert.equal(ui.nodes.workspaceMetrics.childNodes[0].childNodes[1].textContent, new Intl.NumberFormat().format(9007199254740993n));
});
test('no-rights state is explicit; metric dependency failure does not erase authorized navigation', async () => {
  const empty = mount(async (url) => url === '/api/navigation' ? response(navigation([])) : response({ metrics: {} }));
  await flush(); assert.match(empty.nodes.workspaceStatus.textContent, /No modules are assigned/); assert.equal(empty.nodes.workspaceTiles.childNodes.length, 0);
  const failed = mount(async (url) => url === '/api/navigation' ? response(navigation()) : response({ message: 'DBA schema dependency missing.' }, 503));
  await flush(); assert.equal(failed.nodes.workspaceTiles.childNodes.length, 1); assert.equal(failed.nodes.workspaceMetrics.childNodes[0].textContent, 'DBA schema dependency missing.');
});
test('focus refresh removes revoked modules; expired sessions redirect and leave no stale navigation', async () => {
  let current = navigation();
  const ui = mount(async (url) => url === '/api/navigation' ? response(current) : response({ metrics: {} }));
  await flush(); current = navigation([]); ui.events.focus(); await flush();
  assert.equal(ui.nodes.workspaceNav.childNodes.length, 1); assert.equal(ui.nodes.workspaceTiles.childNodes.length, 0);
  const expired = mount(async () => response({ error: 'unauthenticated', message: 'Please sign in again.' }, 401));
  await flush(); assert.deepEqual(expired.redirects, ['/login?terminated=1']); assert.equal(expired.nodes.workspaceNav.childNodes.length, 0);
});
test('logout uses the established endpoint, blocks duplicate requests and safely reports network errors', async () => {
  let finish, logoutCalls = 0;
  const ui = mount(async (url, options) => {
    if (options?.method === 'POST') { assert.equal(url, '/api/v1/auth/logout'); logoutCalls += 1; return new Promise((resolve) => { finish = resolve; }); }
    return url === '/api/navigation' ? response(navigation()) : response({ metrics: {} });
  });
  await flush(); const first = ui.nodes.workspaceLogout.events.click(); await ui.nodes.workspaceLogout.events.click();
  assert.equal(logoutCalls, 1); finish(response({})); await first; assert.deepEqual(ui.redirects, ['/']);
  const failed = mount(async () => { throw new TypeError('private network detail'); });
  await flush(); assert.equal(failed.nodes.workspaceStatus.textContent, 'Check your connection and refresh the workspace.');
});
