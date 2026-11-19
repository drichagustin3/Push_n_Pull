const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor() { this.childNodes = []; this.events = {}; this.value = ''; this.disabled = false; this.hidden = false; this._text = ''; }
  set textContent(value) { this._text = value; this.childNodes = []; }
  get textContent() { return this._text; }
  append(element) { this.childNodes.push(element); }
  replaceChildren(...elements) { this.childNodes = elements; }
  addEventListener(name, handler) { this.events[name] = handler; }
  focus() {}
}
const fixture = { user_id: '2', first_name: '<img src=x onerror=alert(1)>', last_name: 'Fixture', email: 'fixture@example.test', role: 'user', blocked: false, empno: null, can_edit: true, can_block: true };
const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });
const listing = (users = [fixture], showMetadata = false) => ({ users, viewer: { role: showMetadata ? 'superadmin' : 'admin', showMetadata }, page: 1, hasMore: false });
const flush = () => new Promise((resolve) => setImmediate(resolve));
function mount(fetch) {
  const nodes = Object.fromEntries(['filters', 'editor', 'message', 'directoryState', 'directoryBody', 'directoryHead', 'previous', 'next', 'page', 'passwordFields', 'editorTitle', 'saveUser', 'cancelEdit'].map((id) => [id, new Element()]));
  const fields = Object.fromEntries(['id', 'firstName', 'lastName', 'email', 'empno', 'password', 'confirmPassword', 'role'].map((key) => [key, new Element()]));
  fields.role.value = 'user';
  nodes.editor.elements = fields;
  nodes.editor.reset = () => Object.entries(fields).forEach(([key, element]) => { element.value = key === 'role' ? 'user' : ''; });
  nodes.editor.querySelectorAll = () => [fields.password, fields.confirmPassword];
  vm.runInNewContext(readFileSync(path.resolve(__dirname, '../public/users.js'), 'utf8'), {
    document: { getElementById: (id) => nodes[id], createElement: () => new Element() },
    fetch, URLSearchParams, TypeError,
    FormData: class { constructor(form) {
      return form === nodes.filters ? [['search', ''], ['blocked', 'all'], ['role', 'all']]
        : Object.entries(fields).filter(([key]) => !nodes.passwordFields.disabled || !['password', 'confirmPassword', 'role'].includes(key)).map(([key, element]) => [key, element.value]);
    } },
  });
  return { nodes, fields, submit: () => nodes.editor.events.submit({ preventDefault() {} }) };
}
test('directory renders profile text safely, keeps Admin rows read-only and omits metadata columns', async () => {
  const ui = mount(async () => response(listing([fixture, { ...fixture, user_id: '3', role: 'admin', can_edit: false, can_block: false }])));
  await flush();
  assert.equal(ui.nodes.directoryHead.childNodes[0].childNodes.length, 6);
  assert.equal(ui.nodes.directoryBody.childNodes[0].childNodes[0].textContent, fixture.first_name + ' Fixture');
  const actions = ui.nodes.directoryBody.childNodes[1].childNodes.at(-1);
  assert.equal(actions.textContent, '—'); assert.equal(actions.childNodes.length, 0);
  assert.equal(ui.nodes.previous.disabled, true); assert.equal(ui.nodes.next.disabled, true);
});
test('edit mode submits profile-only JSON and clears password inputs after completion', async () => {
  let sent;
  const ui = mount(async (url, options) => {
    if (!options?.method) return response(listing());
    sent = { url, ...options }; return response({ user: fixture });
  });
  await flush();
  ui.nodes.directoryBody.childNodes[0].childNodes.at(-1).childNodes[0].events.click();
  assert.equal(ui.nodes.passwordFields.disabled, true);
  assert.equal(ui.fields.firstName.value, fixture.first_name);
  await ui.submit();
  assert.equal(sent.method, 'PUT'); assert.equal(sent.url, '/api/users/2');
  const body = JSON.parse(sent.body);
  assert.equal(Object.hasOwn(body, 'password'), false); assert.equal(Object.hasOwn(body, 'role'), false);
  assert.equal(body.empno, null); assert.equal(ui.nodes.passwordFields.disabled, false);
  assert.equal(ui.fields.password.value, '');
});
test('Add User prevents duplicate requests and supports safe conflict/network retries', async () => {
  let complete, calls = 0;
  const ui = mount(async (url, options) => {
    if (!options?.method) return response(listing());
    calls += 1; return new Promise((resolve) => { complete = resolve; });
  });
  await flush();
  ui.fields.password.value = 'PrivatePassword123!'; ui.fields.confirmPassword.value = 'PrivatePassword123!';
  const submission = ui.submit(); await ui.submit(); assert.equal(calls, 1);
  complete(response({ error: 'An account already uses that email.' }, false, 409)); await submission;
  assert.equal(ui.nodes.message.textContent, 'An account already uses that email.');
  assert.equal(ui.fields.password.value, ''); assert.equal(ui.nodes.saveUser.disabled, false);
  const retry = ui.submit(); complete(response({ user: fixture })); await retry; assert.equal(calls, 2);
  const failure = mount(async (url, options) => {
    if (!options?.method) return response(listing());
    throw new TypeError('private connection detail');
  });
  await flush(); await failure.submit();
  assert.equal(failure.nodes.message.textContent, 'Check your connection and try again.');
  assert.equal(failure.nodes.saveUser.disabled, false);
});
test('Superadmin metadata renders; block action sends only a boolean then refreshes', async () => {
  let sent;
  const ui = mount(async (url, options) => {
    if (!options?.method) return response(listing([{ ...fixture, status: 'active', stamp: 'EDIT admin', is_deleted: false }], true));
    sent = { url, ...options }; return response({ user: fixture });
  });
  await flush(); assert.equal(ui.nodes.directoryHead.childNodes[0].childNodes.length, 9);
  await ui.nodes.directoryBody.childNodes[0].childNodes.at(-1).childNodes[1].events.click();
  assert.equal(sent.url, '/api/users/2/block'); assert.equal(sent.method, 'PUT');
  assert.deepEqual(JSON.parse(sent.body), { isBlocked: true });
  assert.equal(ui.nodes.message.textContent, 'Account access updated.');
});
test('loading, empty, and failed directory states are explicit and do not leave stale rows', async () => {
  let complete;
  const ui = mount(() => new Promise((resolve) => { complete = resolve; }));
  assert.equal(ui.nodes.directoryState.textContent, 'Loading accounts…');
  complete(response(listing([]))); await flush();
  assert.equal(ui.nodes.directoryState.textContent, 'No accounts match these filters.');
  assert.equal(ui.nodes.directoryBody.childNodes.length, 0);
  const failure = mount(async () => { throw new TypeError('private connection detail'); });
  await flush();
  assert.equal(failure.nodes.directoryState.textContent, 'Accounts could not be loaded.');
  assert.equal(failure.nodes.message.textContent, 'Check your connection and try again.');
});
test('privileged creation submits the selected role but never sends it in profile edits', async () => {
  let sent;
  const ui = mount(async (url, options) => {
    if (!options?.method) return response(listing([], true));
    sent = JSON.parse(options.body); return response({ user: { ...fixture, role: 'admin' } });
  });
  await flush(); ui.fields.role.value = 'admin';
  await ui.submit();
  assert.equal(sent.role, 'admin');
  assert.equal(ui.fields.role.value, 'user');
});
