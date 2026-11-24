const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');
const { validateCustomerQuery } = require('../src/customers/validation');
const { listCustomers } = require('../src/customers/service');

test('customer validation rejects duplicate, structured, unsupported and oversized parameters', () => {
  assert.deepEqual(validateCustomerQuery({}), { search: '', status: 'active' });
  assert.deepEqual(validateCustomerQuery({ search: ' Acme ', status: 'all' }), { search: 'Acme', status: 'all' });
  for (const query of [{ status: 'deleted' }, { status: ['active', 'all'] }, { search: ['a', 'b'] },
    { search: {} }, { search: 'x'.repeat(101) }, { search: '\0' }, { role: 'admin' }, { 'search[x]': 'a' }]) {
    assert.throws(() => validateCustomerQuery(query), (error) => error.status === 400);
  }
});
test('User SQL restricts active rows, projects no metadata and parameterizes literal wildcard search', async () => {
  let statement;
  const pool = { query: async (sql, values) => { statement = { sql, values }; return { rows: [{ customers: [{ custno: 'C0001', custname: 'Sample', address: null, payterm: 'COD', stamp: 'private', is_deleted: false }] }] }; } };
  const data = await listCustomers(pool, { user: { role: 'user' }, rights: new Set(['customer.edit']) }, { search: "%' OR 1=1 --_\\", status: 'all' });
  assert.match(statement.sql, /WHERE NOT is_deleted/);
  assert.doesNotMatch(statement.sql, /stamp|SELECT [^\n]*is_deleted/);
  assert.ok(!statement.sql.includes('OR 1=1 --'));
  assert.deepEqual(statement.values, ["%\\%' OR 1=1 --\\_\\\\%"]);
  assert.deepEqual(Object.keys(data.customers[0]), ['custno', 'custname', 'address', 'payterm']);
  assert.equal(data.filter.status, 'active'); assert.equal(Object.hasOwn(data, 'counts'), false);
});
test('Admin/Superadmin share one snapshot for rows and search-scoped status counts', async () => {
  for (const role of ['admin', 'superadmin']) {
    let calls = 0;
    const data = await listCustomers({ query: async (sql, values) => {
      ++calls; assert.match(sql, /FILTER/); assert.deepEqual(values, ['%Sample%', 'inactive']);
      return { rows: [{ customers: [{ custno: 'C0001', is_deleted: true, stamp: 'fixture' }], counts: { active: 2, inactive: 1, all: 3 } }] };
    } }, { user: { role }, rights: new Set(['customer.delete']) }, { search: 'Sample', status: 'inactive' });
    assert.equal(calls, 1); assert.equal(data.customers[0].status, 'inactive'); assert.equal(data.customers[0].stamp, 'fixture');
    assert.equal(Object.hasOwn(data.customers[0], 'is_deleted'), false); assert.equal(data.counts.all, 3);
  }
});

async function serve(t, role = 'user') {
  const password = 'Aa1' + randomBytes(12).toString('hex');
  const user = { user_id: '1', email: 'customer-test@example.test', role, status: 'active', blocked: false,
    is_deleted: false, must_change_password: false, session_version: 0, password_hash: await bcrypt.hash(password, 4), role_deleted: false };
  const state = { grants: true, fail: false, customerQueries: 0 };
  const pool = { query: async (sql) => {
    if (sql.startsWith('WITH matched')) {
      ++state.customerQueries; if (state.fail) throw new Error('private SQL password detail');
      return { rows: [{ customers: [], counts: { active: 0, inactive: 0, all: 0 } }] };
    }
    if (sql.includes('FROM module m')) return { rows: [{ module_code: 'customer', right_code: 'customer.edit', granted: state.grants }] };
    return { rows: [{ ...user }] };
  } };
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const store = new session.MemoryStore(); // Only the deterministic HTTP test uses memory storage.
  const app = createApp({ pool, authConfig: config, sessionStore: store });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); store.clear(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie()[0].split(';')[0];
  const request = (url, authenticated = true) => fetch(base + url, { headers: { Accept: 'application/json', ...(authenticated ? { Cookie: cookie } : {}) } });
  return { request, state, user };
}
test('real auth middleware rejects anonymous/no-module/revoked/blocked requests before customer queries', async (t) => {
  const { request, state, user } = await serve(t);
  assert.equal((await request('/api/customers', false)).status, 401);
  assert.equal((await request('/api/customers')).status, 200);
  const queries = state.customerQueries;
  state.grants = false;
  assert.equal((await request('/api/customers')).status, 403);
  assert.equal((await request('/workspace/customer')).status, 403);
  state.grants = true; user.blocked = true;
  assert.equal((await request('/api/customers')).status, 403);
  assert.equal(state.customerQueries, queries);
});
test('authorized page integrates table assets; invalid params and SQL failures produce safe responses', async (t) => {
  const { request, state } = await serve(t, 'admin');
  const page = await request('/workspace/customer');
  assert.equal(page.status, 200); assert.match(await page.text(), /customerSearch/);
  for (const route of ['/api/customers?status=bad', '/api/customers?search=a&search=b', '/api/customers?role=superadmin']) {
    assert.equal((await request(route)).status, 400);
  }
  assert.equal(state.customerQueries, 0);
  const empty = await request('/api/customers?status=all');
  assert.equal(empty.headers.get('cache-control'), 'no-store'); assert.deepEqual((await empty.json()).customers, []);
  state.fail = true;
  const failure = await request('/api/customers'); assert.equal(failure.status, 503);
  assert.doesNotMatch(JSON.stringify(await failure.json()), /private|SQL|password/);
});
