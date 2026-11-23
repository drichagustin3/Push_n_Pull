const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');
const { validateProductQuery } = require('../src/products/validation');
const { listProducts } = require('../src/products/service');

test('product query validation rejects structured/duplicate/unknown fields and bounds literal search', () => {
  assert.deepEqual(validateProductQuery({}), { search: '', status: 'active' });
  assert.deepEqual(validateProductQuery({ search: ' Pump ', status: 'all' }), { search: 'Pump', status: 'all' });
  for (const query of [{ status: 'deleted' }, { status: ['active','all'] }, { search: ['a','b'] }, { search: {} }, { search: 'x'.repeat(101) }, { search: '\0' }, { role: 'admin' }, { 'search[x]': 'a' }]) assert.throws(() => validateProductQuery(query), e => e.status === 400);
});
test('User SQL filters active products, binds literal text, preserves decimal text and makes one query', async () => {
  let calls = 0;
  const result = await listProducts({ query: async (sql, args) => {
    ++calls; assert.match(sql, /NOT p.is_deleted AND/); assert.doesNotMatch(sql, /p\.stamp|SELECT[^\n]*p\.is_deleted/);
    assert.match(sql, /LEFT JOIN LATERAL/); assert.match(sql, /NOT h.is_deleted/); assert.match(sql, /h.effdate<=CURRENT_DATE/); assert.match(sql, /ORDER BY h.effdate DESC LIMIT 1/); assert.match(sql, /unitprice::text/);
    assert.deepEqual(args, ["%\\%' OR 1=1 --\\_\\\\%"]); assert.ok(!sql.includes("' OR 1=1 --"));
    return { rows: [{ products: [{ prodcode: 'P00001', description: 'Pump', unit: 'pc', currentPrice: '99999999.99', stamp: 'hidden', is_deleted: true }] }] };
  } }, { user: { role: 'user' }, rights: new Set(['price.add']) }, { search: "%' OR 1=1 --_\\", status: 'all' });
  assert.equal(calls, 1); assert.equal(result.filter.status, 'active'); assert.equal(result.products[0].currentPrice, '99999999.99');
  assert.deepEqual(Object.keys(result.products[0]).sort(), ['currentPrice','description','prodcode','unit']); assert.equal(Object.hasOwn(result, 'counts'), false); assert.equal(result.capabilities.prices, true); assert.equal(result.capabilities.add, false);
});
test('privileged filters/counts share one SQL snapshot and keep product and price states independent', async () => {
  for (const role of ['admin','superadmin']) {
    const data = await listProducts({ query: async (sql, args) => { assert.deepEqual(args, ['%Pump%', 'inactive']); assert.match(sql, /count\(\*\)/); return { rows: [{ products: [{ prodcode: 'P00001', is_deleted: true, stamp: 'fixture', currentPrice: '123.45' }], counts: { active: 2, inactive: 1, all: 3 } }] }; } }, { user: { role }, rights: new Set(['product.delete']) }, { search: 'Pump', status: 'inactive' });
    assert.equal(data.products[0].status, 'inactive'); assert.equal(data.products[0].currentPrice, '123.45'); assert.equal(data.counts.all, 3); assert.equal(Object.hasOwn(data.products[0], 'is_deleted'), false);
  }
});
async function serve(t, role = 'user') {
  const password = 'Aa1' + randomBytes(12).toString('hex');
  const user = { user_id: '1', email: 'product-test@example.test', role, status: 'active', blocked: false, is_deleted: false, must_change_password: false, session_version: 0, password_hash: await bcrypt.hash(password, 4), role_deleted: false };
  const state = { grants: true, fail: false, productQueries: 0 };
  const pool = { query: async sql => {
    if (sql.startsWith('WITH matched')) { ++state.productQueries; if (state.fail) throw new Error('private SQL password details'); return { rows: [{ products: [], counts: { active: 0, inactive: 0, all: 0 } }] }; }
    if (sql.includes('FROM module m')) return { rows: [{ module_code: 'product', right_code: 'price.add', granted: state.grants }] };
    return { rows: [{ ...user }] };
  } };
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const store = new session.MemoryStore(); // Test only. Deployed application uses PgStore.
  const app = createApp({ pool, authConfig: config, sessionStore: store }); const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(r => { server.close(r); server.closeAllConnections(); }); store.clear(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + '/login', { method: 'POST', headers: { Origin: config.origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) }); assert.equal(login.status, 200); const cookie = login.headers.getSetCookie()[0].split(';')[0];
  return { state, user, request: (url, authenticated = true) => fetch(base + url, { headers: { Accept: 'application/json', ...(authenticated ? { Cookie: cookie } : {}) } }) };
}
test('real middleware rejects anonymous, no Product grant, revoked rights and blocked accounts before product query', async t => {
  const { request, state, user } = await serve(t);
  assert.equal((await request('/api/products', false)).status, 401); assert.equal((await request('/api/products')).status, 200);
  const calls = state.productQueries; state.grants = false; assert.equal((await request('/api/products')).status, 403); assert.equal((await request('/workspace/product')).status, 403);
  state.grants = true; user.blocked = true; assert.equal((await request('/api/products')).status, 403); assert.equal(state.productQueries, calls);
});
test('page/assets integrate, invalid parameters fail, empty data is valid and database errors are sanitized', async t => {
  const { request, state } = await serve(t, 'admin');
  const page = await request('/workspace/product'); assert.equal(page.status, 200); assert.match(await page.text(), /productTable/);
  for (const url of ['/api/products?status=bad', '/api/products?search=a&search=b', '/api/products?role=superadmin']) assert.equal((await request(url)).status, 400);
  assert.equal(state.productQueries, 0); const empty = await request('/api/products?status=all'); assert.equal(empty.headers.get('cache-control'), 'no-store'); assert.deepEqual((await empty.json()).products, []);
  state.fail = true; const failed = await request('/api/products'); assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(await failed.json()), /private|SQL|password/);
});
