const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { randomBytes } = require('node:crypto');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { readAuthConfig } = require('../src/auth/config');
const { createSessionMiddleware } = require('../src/auth/session');
const { createAuthorization } = require('../src/rbac/middleware');

test('Workspace navigation, exact-action RBAC and live metrics', {
  skip: process.env.WORKSPACE_INTEGRATION !== '1' ? 'Opt in with WORKSPACE_INTEGRATION=1 on an authorized local database.' : false,
}, async (t) => {
  assert.ok(process.env.PGDATABASE === 'hopedb_auth_test' || (process.env.PGDATABASE === 'hopedb' && process.env.WORKSPACE_ALLOW_HOPEDB_TEST === '1'));
  const pool = new Pool({ query_timeout: 5000, connectionTimeoutMillis: 5000 });
  const ids = [], apps = [], servers = [], stores = [], faults = [];
  const prefix = `workspace-test-${randomBytes(8).toString('hex')}`;
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    for (const app of apps) await app.locals.closeAuthStore();
    for (const store of stores) await store.close();
    try {
      await pool.query('UPDATE user_permission SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [ids]);
      await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=ANY($1::text[])", [ids]);
      await pool.query('UPDATE app_user SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [ids]);
    } finally { for (const fault of faults) await fault.end(); await pool.end(); }
  });
  const password = 'Aa1' + randomBytes(20).toString('hex'), hash = await bcrypt.hash(password, 12);
  async function fixture(role) {
    const email = `${prefix}-${randomBytes(5).toString('hex')}@example.test`;
    const id = String((await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('Workspace','Fixture',$1,$2,$3,'active') RETURNING user_id", [email, hash, role])).rows[0].user_id);
    ids.push(id); return { id, email };
  }
  async function serve(backend = pool, probes = false) {
    const app = createApp({ pool: backend, authConfig: config }); apps.push(app);
    const root = express();
    if (probes) {
      const session = createSessionMiddleware(backend, config); stores.push(session.store);
      const access = createAuthorization(backend, config);
      // These probes exist only in this test process, never in the shipping application.
      for (const code of ['customer.add', 'customer.delete', 'CUSTOMER_VIEW']) root.get('/_test/' + code, session.middleware, access.requireRight(code), (req, res) => res.json({ allowed: true }));
      root.get('/_test/admin', session.middleware, access.requireRole('admin', 'superadmin'), (req, res) => res.json({ allowed: true }));
      root.use((error, req, res, next) => res.status(error.status || 503).json({ error: error.code || 'unavailable' }));
    }
    root.use(app);
    const server = createServer(root); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return async (path, cookie, options = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      redirect: 'manual', ...options, headers: { Accept: 'application/json', Origin: config.origin, ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
    });
  }
  const api = await serve(pool, true);
  const superadmin = await fixture('superadmin'), admin = await fixture('admin'), user = await fixture('user');
  async function login(actor) {
    const res = await api('/login', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: actor.email, password }) });
    assert.equal(res.status, 200); return res.headers.getSetCookie()[0].split(';')[0];
  }
  const cookies = { superadmin: await login(superadmin), admin: await login(admin), user: await login(user) };
  const nav = async (cookie) => { const res = await api('/api/navigation', cookie); assert.equal(res.status, 200); return res.json(); };

  await t.test('anonymous APIs return 401; empty-right User sees a restricted workspace and no KPI data', async () => {
    assert.equal((await api('/api/navigation')).status, 401);
    assert.equal((await api('/api/dashboard/metrics')).status, 401);
    const data = await nav(cookies.user); assert.deepEqual(data.items, []); assert.equal(data.restricted, true); assert.deepEqual(data.rightCodes, []);
    assert.deepEqual(await (await api('/api/dashboard/metrics', cookies.user)).json(), { metrics: {} });
    assert.equal((await api('/workspace/customer', cookies.user)).status, 403);
    assert.equal((await api('/_test/customer.add', cookies.user)).status, 403);
  });
  await t.test('Admin/Superadmin module privileges and System Settings/Audit/User Management separation are consistent', async () => {
    for (const role of ['admin', 'superadmin']) {
      const data = await nav(cookies[role]);
      assert.deepEqual(data.items.filter((item) => item.kind === 'module').map((item) => item.code), ['customer', 'product', 'human_resources', 'sales', 'reports']);
      assert.equal(data.rightCodes.length, 36); assert.equal(data.items.some((item) => item.code === 'users'), true);
      assert.equal(data.items.some((item) => item.code === 'audit'), role === 'superadmin');
      assert.equal((await api('/workspace/audit', cookies[role])).status, role === 'superadmin' ? 200 : 403);
      assert.equal((await api('/workspace/settings', cookies[role])).status, role === 'superadmin' ? 200 : 403);
      assert.equal((await api('/_test/customer.delete', cookies[role])).status, 200);
      assert.equal((await api('/_test/CUSTOMER_VIEW', cookies[role])).status, 403, 'unknown catalogue codes never bypass checks');
    }
    assert.equal((await api('/users', cookies.user)).status, 403);
    const userPage = await api('/users', cookies.admin); assert.equal(userPage.status, 200); assert.match(await userPage.text(), /workspaceNav/);
    const account = await api('/account', cookies.user); assert.equal(account.status, 200); assert.match(await account.text(), /workspaceTiles/);
    assert.equal((await api('/')).headers.get('location'), '/account');
    assert.equal((await api('/workspace.html', cookies.user)).status, 404);
  });
  await t.test('one right grants its module only; exact actions, malformed/client-supplied roles and live revocation remain enforced', async () => {
    const change = (rightCodes) => api(`/api/users/${user.id}/rights`, cookies.admin, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rightCodes }) });
    assert.equal((await change(['customer.add'])).status, 200);
    let data = await nav(cookies.user); assert.deepEqual(data.items.map((item) => item.code), ['customer']);
    assert.equal((await api('/workspace/customer', cookies.user)).status, 200);
    assert.equal((await api('/workspace/product', cookies.user)).status, 403);
    assert.equal((await api('/_test/customer.add', cookies.user)).status, 200);
    assert.equal((await api('/_test/customer.delete?role=superadmin&right=customer.delete', cookies.user)).status, 403);
    assert.equal((await api('/_test/admin?role=superadmin', cookies.user)).status, 403);
    assert.equal((await change([])).status, 200);
    assert.equal((await api('/_test/customer.add', cookies.user)).status, 403);
    data = await nav(cookies.user); assert.deepEqual(data.items, []);
  });
  await t.test('soft-deleted grants/rights/modules are excluded and account changes invalidate sessions', async () => {
    // Transaction-local catalogue changes are injected only into the policy query client.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE user_permission SET is_deleted=TRUE WHERE user_id=$1", [user.id]);
      await client.query("UPDATE rights_catalogue SET is_deleted=TRUE WHERE right_code='customer.add'");
      const scoped = await serve({ query: (sql, values) => sql.includes('FROM module m') ? client.query(sql, values) : pool.query(sql, values) });
      const data = await (await scoped('/api/navigation', cookies.superadmin)).json();
      assert.equal(data.rightCodes.includes('customer.add'), false);
      await client.query("UPDATE rights_catalogue SET is_deleted=TRUE WHERE module_code='customer'");
      await client.query("UPDATE module SET is_deleted=TRUE WHERE module_code='customer'");
      assert.equal((await (await scoped('/api/navigation', cookies.superadmin)).json()).items.some((item) => item.code === 'customer'), false);
    } finally { await client.query('ROLLBACK'); client.release(); }
    for (const change of ["blocked=TRUE", "status='pending'", 'is_deleted=TRUE', "role='admin'"]) {
      const target = await fixture('user'); const cookie = await login(target);
      // Fixed test-only clauses; never browser input or production query interpolation.
      await pool.query('UPDATE app_user SET ' + change + ' WHERE user_id=$1', [target.id]);
      assert.ok([401, 403].includes((await api('/api/navigation', cookie)).status));
    }
  });
  await t.test('live KPIs honor soft deletion and historical effective prices; unauthorized metrics are omitted', async () => {
    const client = await pool.connect();
    const scoped = await serve({ query: (sql, values) => sql.startsWith('SELECT (SELECT') ? client.query(sql, values) : pool.query(sql, values) });
    try {
      await client.query('BEGIN');
      const baselineRes = await scoped('/api/dashboard/metrics', cookies.admin); assert.equal(baselineRes.status, 200);
      const before = (await baselineRes.json()).metrics;
      const customer = 'W' + randomBytes(2).toString('hex'), deletedCustomer = 'W' + randomBytes(2).toString('hex');
      const product = 'W' + randomBytes(2).toString('hex') + 'A', deletedProduct = 'W' + randomBytes(2).toString('hex') + 'D';
      const sale = 'W' + randomBytes(3).toString('hex'), deletedSale = 'W' + randomBytes(3).toString('hex');
      await client.query("INSERT INTO customer(custno,custname,payterm,is_deleted) VALUES($1,'Workspace Test','COD',FALSE),($2,'Deleted Test','COD',TRUE)", [customer, deletedCustomer]);
      await client.query("INSERT INTO product(prodcode,description,unit,is_deleted) VALUES($1,'Workspace Test','pc',FALSE),($2,'Deleted Test','pc',TRUE)", [product, deletedProduct]);
      await client.query("INSERT INTO pricehist(effdate,prodcode,unitprice,is_deleted) VALUES('2024-01-01',$1,10,FALSE),('2025-01-01',$1,20,FALSE),('2025-05-01',$1,900,TRUE),('2026-01-01',$1,999,FALSE)", [product]);
      await client.query("INSERT INTO sales(transno,salesdate,custno,empno,is_deleted) VALUES($1,'2025-06-01',$3,'00001',FALSE),($2,'2025-06-02',$3,'00001',TRUE)", [sale, deletedSale, customer]);
      await client.query('INSERT INTO salesdetail(transno,prodcode,quantity,is_deleted) VALUES($1,$3,3,FALSE),($2,$3,9,FALSE),($1,$4,100,TRUE)', [sale, deletedSale, product, deletedProduct]);
      const after = (await (await scoped('/api/dashboard/metrics', cookies.admin)).json()).metrics;
      for (const key of ['customers', 'products', 'sales']) assert.equal(BigInt(after[key]) - BigInt(before[key]), 1n);
      assert.equal(BigInt(after.revenue.replace('.', '')) - BigInt(before.revenue.replace('.', '')), 6000n);
      await pool.query("UPDATE user_permission SET is_deleted=FALSE WHERE user_id=$1 AND right_code='customer.add'", [user.id]);
      const limited = (await (await scoped('/api/dashboard/metrics', cookies.user)).json()).metrics;
      assert.deepEqual(Object.keys(limited), ['customers']);
      await client.query('INSERT INTO salesdetail(transno,prodcode,quantity,is_deleted) VALUES($1,$2,1,FALSE)', [deletedSale, deletedProduct]);
      // Missing prices on deleted sales stay excluded. An active missing-price line fails explicitly.
      await client.query('UPDATE salesdetail SET is_deleted=FALSE WHERE transno=$1 AND prodcode=$2', [sale, deletedProduct]);
      const invalid = await scoped('/api/dashboard/metrics', cookies.superadmin); assert.equal(invalid.status, 503);
      assert.equal((await invalid.json()).error, 'metrics_unavailable');
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  await t.test('actual DB failures fail closed for privileged navigation and expose no SQL details', async () => {
    const fault = new Pool({ options: '-c search_path=pg_catalog', query_timeout: 5000 }); faults.push(fault);
    const scoped = await serve({ query: (sql, values) => sql.includes('FROM module m') ? fault.query(sql, values) : pool.query(sql, values) });
    const response = await scoped('/api/navigation', cookies.superadmin); assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'workspace_unavailable', message: 'Workspace access is temporarily unavailable. Try again later.' });
    const metricsFault = await serve({ query: (sql, values) => sql.startsWith('SELECT (SELECT') ? fault.query(sql, values) : pool.query(sql, values) });
    assert.equal((await metricsFault('/api/dashboard/metrics', cookies.admin)).status, 503);
  });
});
