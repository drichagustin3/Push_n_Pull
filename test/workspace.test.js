const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadAccess, navigation } = require('../src/rbac/service');
const { readMetrics } = require('../src/workspace/metrics');

const user = { user_id: '1', first_name: 'Test', last_name: 'User', email: 'test@example.test', role: 'user', status: 'active', blocked: false, is_deleted: false, session_version: 0, role_deleted: false };
const rows = [{ module_code: 'customer', right_code: 'customer.add', granted: true }, { module_code: 'customer', right_code: 'customer.delete', granted: false }, { module_code: 'product', right_code: 'product.edit', granted: false }];
function backend(account = user, rights = rows) { return { query: async (sql) => sql.includes('JOIN role') ? { rows: [account] } : { rows: rights } }; }
test('User module access never implies another action; navigation exposes only effective rights and safe identity', async () => {
  const access = await loadAccess(backend(), { user, version: 0 });
  assert.equal(access.modules.has('customer'), true); assert.equal(access.modules.has('product'), false);
  assert.equal(access.rights.has('customer.add'), true); assert.equal(access.rights.has('customer.delete'), false);
  const data = navigation(access);
  assert.deepEqual(data.items.map((item) => item.code), ['customer']); assert.deepEqual(data.rightCodes, ['customer.add']);
  assert.deepEqual(Object.keys(data.user).sort(), ['name', 'role', 'username']);
});
test('issue #46 grants Admin/Superadmin active-catalogue operational privileges, keeping administration separate', async () => {
  for (const role of ['admin', 'superadmin']) {
    const access = await loadAccess(backend({ ...user, role }), { user, version: 0 });
    assert.equal(access.rights.has('customer.delete'), true); assert.equal(access.rights.has('CUSTOMER_VIEW'), false);
    const items = navigation(access).items;
    assert.equal(items.some((item) => item.code === 'users'), true);
    assert.equal(items.some((item) => item.code === 'audit'), role === 'superadmin');
    assert.equal(items.some((item) => item.code === 'settings'), role === 'superadmin');
  }
});
test('stale sessions, changed account state, missing role and DB failure fail closed', async () => {
  for (const account of [undefined, { ...user, blocked: true }, { ...user, is_deleted: true }, { ...user, status: 'pending' },
    { ...user, status: 'inactive' }, { ...user, session_version: 1 }, { ...user, role_deleted: true }]) {
    const pool = { query: async () => ({ rows: account ? [account] : [] }) };
    await assert.rejects(loadAccess(pool, { user, version: 0 }));
  }
  await assert.rejects(loadAccess({ query: async () => { throw new Error('DB unavailable'); } }, { user: { ...user, role: 'superadmin' }, version: 0 }));
  const empty = await loadAccess(backend(user, []), { user, version: 0 });
  assert.equal(navigation(empty).restricted, true);
});
test('metrics refuse missing soft-delete schema, return no unauthorized metrics, and preserve numeric precision', async () => {
  assert.deepEqual(await readMetrics({ query() { assert.fail('unauthorized data query'); } }, { modules: new Set(['human_resources']) }), { metrics: {} });
  await assert.rejects(readMetrics({ query: async () => ({ rows: [] }) }, { modules: new Set(['customer']) }), (error) => error.status === 503);
  const statements = [];
  const pool = { query: async (sql, values) => {
    statements.push({ sql, values });
    if (sql.includes('information_schema')) return { rows: [{ table_name: 'sales' }, { table_name: 'salesdetail' }, { table_name: 'pricehist' }] };
    return { rows: [{ sales: '9007199254740993', revenue: '123456789012345.67', missing_prices: 0 }] };
  } };
  const result = await readMetrics(pool, { modules: new Set(['sales']) });
  assert.deepEqual(result.metrics, { sales: '9007199254740993', revenue: '123456789012345.67' });
  assert.equal(statements.at(-1).sql.includes('FROM customer'), false);
});
test('missing historical prices and unavailable metric relations are explicit dependency failures', async () => {
  const pool = { query: async (sql) => sql.includes('information_schema') ? { rows: ['sales', 'salesdetail', 'pricehist'].map((table_name) => ({ table_name })) }
    : { rows: [{ missing_prices: 1 }] } };
  await assert.rejects(readMetrics(pool, { modules: new Set(['sales']) }), (error) => error.status === 503 && error.message.includes('pricing'));
  const fault = { query: async (sql) => { if (sql.includes('information_schema')) return { rows: [{ table_name: 'customer' }] }; throw Object.assign(new Error('private SQL detail'), { code: '42703' }); } };
  await assert.rejects(readMetrics(fault, { modules: new Set(['customer']) }), (error) => error.status === 503 && !error.message.includes('private'));
});
