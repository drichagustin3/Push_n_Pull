const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Rights API and audit atomicity over real HTTP/PostgreSQL', {
  skip: process.env.RIGHTS_INTEGRATION !== '1' ? 'Opt in with RIGHTS_INTEGRATION=1 on an authorized local migrated database.' : false,
}, async (t) => {
  assert.ok(process.env.PGDATABASE === 'hopedb_auth_test' || (process.env.PGDATABASE === 'hopedb' && process.env.RIGHTS_ALLOW_HOPEDB_TEST === '1'));
  const pool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const prefix = `rights-test-${randomBytes(8).toString('hex')}`;
  const ids = [], apps = [], servers = [], roles = [];
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    for (const app of apps) await app.locals.closeAuthStore();
    try {
      await pool.query('UPDATE user_permission SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [ids]);
      await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=ANY($1::text[])", [ids]);
      await pool.query('UPDATE app_user SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [ids]);
      for (const role of roles) {
        await pool.query(`REVOKE ALL ON app_user,module,rights_catalogue,user_permission,audit_log FROM "${role}"`);
        await pool.query(`REVOKE USAGE ON SCHEMA public FROM "${role}"`);
        await pool.query(`DROP ROLE "${role}"`);
      }
    } finally { await pool.end(); }
  });
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const password = 'Aa1' + randomBytes(20).toString('hex'), hash = await bcrypt.hash(password, 12);
  async function fixture(role = 'user', { status = 'active', blocked = false, deleted = false } = {}) {
    const email = `${prefix}-${randomBytes(5).toString('hex')}@example.test`;
    const id = String((await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,role,status,blocked,is_deleted)
      VALUES('Rights','Fixture',$1,$2,$3,$4,$5,$6) RETURNING user_id`, [email, hash, role, status, blocked, deleted])).rows[0].user_id);
    ids.push(id); return { id, email };
  }
  async function serve(backend = pool) {
    const app = createApp({ pool: backend, authConfig: config }); apps.push(app);
    const server = createServer(app); servers.push(server); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return async (path, { method = 'GET', body, cookie, origin = config.origin, contentType = 'application/json' } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': contentType }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const api = await serve();
  const admin = await fixture('admin'), superadmin = await fixture('superadmin'), user = await fixture();
  async function login(actor) {
    const response = await api('/login', { method: 'POST', body: { email: actor.email, password } });
    assert.equal(response.status, 200); return response.headers.getSetCookie()[0].split(';')[0];
  }
  const cookies = { admin: await login(admin), superadmin: await login(superadmin), user: await login(user) };
  const url = (target) => `/api/users/${target.id}/rights`;
  const get = (target, cookie = cookies.admin) => api(url(target), { cookie });
  const put = (target, rightCodes, cookie = cookies.admin) => api(url(target), { method: 'PUT', body: { rightCodes }, cookie });
  const audits = async (target) => (await pool.query("SELECT * FROM audit_log WHERE table_name='user_permission' AND record_key LIKE $1 ORDER BY audit_id", [target.id + '|%'])).rows;
  let codes;

  await t.test('anonymous/User requests denied; Admin cannot inspect or modify Admin/Superadmin targets', async () => {
    assert.equal((await api(url(user))).status, 401);
    assert.equal((await api(url(user), { method: 'PUT', body: { rightCodes: [] } })).status, 401);
    for (const method of ['GET', 'PUT']) assert.equal((await api(url(user), { method, cookie: cookies.user, ...(method === 'PUT' ? { body: { rightCodes: [] } } : {}) })).status, 403);
    for (const target of [admin, superadmin]) {
      for (const result of [await get(target), await put(target, [])]) {
        assert.equal(result.status, 404); assert.deepEqual(await result.json(), { error: 'Account not found.' });
      }
      assert.equal((await audits(target)).length, 0);
    }
  });
  await t.test('complete catalogue preserves 36 DB codes/descriptions grouped 3/6/13/7/7; no-rights account unchecked', async () => {
    const result = await get(user, cookies.superadmin); assert.equal(result.status, 200);
    const data = await result.json();
    assert.deepEqual(data.modules.map((module) => module.code), ['customer', 'product', 'human_resources', 'sales', 'reports']);
    assert.deepEqual(data.modules.map((module) => module.rights.length), [3, 6, 13, 7, 7]);
    assert.deepEqual(data.rightCodes, []); assert.ok(data.modules.flatMap((module) => module.rights).every((right) => right.granted === false));
    const db = new Map((await pool.query('SELECT right_code,description FROM rights_catalogue WHERE NOT is_deleted')).rows.map((row) => [row.right_code, row.description]));
    codes = data.modules.flatMap((module) => module.rights).map((right) => { assert.equal(db.get(right.rightCode), right.description); return right.rightCode; });
    for (const key of ['password_hash', 'session_version', 'email', 'setup_token_hash']) assert.equal(JSON.stringify(data).includes('"' + key + '"'), false);
    assert.equal((await get(superadmin, cookies.superadmin)).status, 200);
    assert.equal((await get(admin, cookies.superadmin)).status, 200);
    const list = await (await api('/api/users?search=' + prefix, { cookie: cookies.admin })).json();
    assert.equal(list.users.find((row) => row.user_id === user.id).can_manage_rights, true);
    assert.equal(list.users.find((row) => row.user_id === admin.id).can_manage_rights, false);
  });
  await t.test('grant/revoke/restore are audited exactly once, stamp changes, and repeated sets are idempotent', async () => {
    const target = await fixture();
    const accountAudits = async () => (await pool.query("SELECT count(*)::integer AS n FROM audit_log WHERE table_name='app_user' AND record_key=$1", [target.id])).rows[0].n;
    const beforeAccountAudits = await accountAudits();
    let response = await put(target, codes.slice(0, 2)); assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).rightCodes, codes.slice(0, 2).sort());
    let rows = await audits(target); assert.equal(rows.length, 2); assert.ok(rows.every((row) => row.action === 'ADD' && row.action_by === admin.email));
    for (const row of rows) { assert.equal(row.new_values.user_id, Number(target.id)); assert.equal(row.new_values.is_deleted, false); assert.ok(row.record_key.endsWith('|' + row.new_values.right_code)); }
    const stamp = (await pool.query('SELECT stamp FROM app_user WHERE user_id=$1', [target.id])).rows[0].stamp;
    assert.ok(stamp.startsWith('EDIT ' + admin.email + ' '));
    assert.equal(await accountAudits(), beforeAccountAudits, 'no duplicate parent summary audit entry');
    assert.equal((await put(target, codes.slice(0, 2))).status, 200);
    assert.equal((await audits(target)).length, 2);
    assert.equal((await pool.query('SELECT stamp FROM app_user WHERE user_id=$1', [target.id])).rows[0].stamp, stamp);
    assert.equal((await put(target, [codes[1]])).status, 200);
    rows = await audits(target); assert.equal(rows.length, 3); assert.equal(rows[2].action, 'DELETE');
    assert.equal(rows[2].old_values.is_deleted, false); assert.equal(rows[2].new_values.is_deleted, true);
    assert.equal((await put(target, codes.slice(0, 2))).status, 200);
    rows = await audits(target); assert.equal(rows.length, 4); assert.equal(rows[3].action, 'RESTORE');
    assert.equal(rows[3].old_values.is_deleted, true); assert.equal(rows[3].new_values.is_deleted, false);
    assert.equal((await pool.query('SELECT 1 FROM user_permission WHERE user_id=$1', [target.id])).rowCount, 2);
    assert.ok(rows.every((row) => row.action_by === admin.email));
    assert.equal((await pool.query("SELECT nullif(current_setting('app.username',true),'') AS actor")).rows[0].actor, null);
  });
  await t.test('pending/blocked/inactive/deleted targets denied; invalid, duplicate or injected codes never mutate', async () => {
    for (const state of [{ status: 'pending' }, { blocked: true }, { status: 'inactive' }, { deleted: true }]) {
      const target = await fixture('user', state);
      for (const result of [await get(target), await put(target, codes.slice(0, 1))]) assert.equal(result.status, state.deleted ? 404 : 409);
      assert.equal((await audits(target)).length, 0);
    }
    const target = await fixture();
    for (const body of [null, [], {}, { rightCodes: 'all' }, { rightCodes: [1] }, { rightCodes: [codes[0], codes[0]] },
      { rightCodes: [codes[0], 'unknown.code'] }, { rightCodes: ["x'); DELETE FROM app_user;--"] }, { rightCodes: [], role: 'superadmin' }, { rightCodes: [], user_id: superadmin.id }]) {
      assert.equal((await api(url(target), { method: 'PUT', body, cookie: cookies.admin })).status, 400);
    }
    assert.equal((await api(url(target), { method: 'PUT', body: { rightCodes: [] }, cookie: cookies.admin, origin: 'https://other.example' })).status, 403);
    assert.equal((await api(url(target), { method: 'PUT', body: { rightCodes: [] }, cookie: cookies.admin, contentType: 'text/plain' })).status, 415);
    assert.equal((await audits(target)).length, 0);
    assert.equal((await pool.query('SELECT 1 FROM user_permission WHERE user_id=$1', [target.id])).rowCount, 0);
  });
  await t.test('concurrent identical and competing replacements produce unique consistent rows and committed audit deltas', async () => {
    const target = await fixture();
    const identical = await Promise.all([put(target, codes.slice(0, 3)), put(target, codes.slice(0, 3))]);
    assert.ok(identical.every((result) => result.status === 200)); assert.equal((await audits(target)).length, 3);
    const sets = [codes.slice(0, 2), codes.slice(1, 4)];
    const results = await Promise.all(sets.map((set) => put(target, set)));
    assert.ok(results.every((result) => result.status === 200));
    const final = await (await get(target)).json();
    assert.ok(sets.some((set) => JSON.stringify([...set].sort()) === JSON.stringify(final.rightCodes)));
    const rows = (await pool.query('SELECT right_code,is_deleted FROM user_permission WHERE user_id=$1', [target.id])).rows;
    assert.equal(rows.length, new Set(rows.map((row) => row.right_code)).size);
    const replay = new Set();
    for (const row of await audits(target)) { if (row.new_values.is_deleted) replay.delete(row.new_values.right_code); else replay.add(row.new_values.right_code); }
    assert.deepEqual([...replay].sort(), final.rightCodes);
  });
  await t.test('real audit-trigger failure rolls back all permission changes; later transaction failure rolls back existing audit rows', async (st) => {
    const privileges = (await pool.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
    if (!privileges.rolsuper) return st.skip('Audit failure injection needs CREATE ROLE/BYPASSRLS on the isolated local cluster.');
    const target = await fixture();
    // Test-only NOLOGIN DB role emulates the trusted backend but cannot INSERT audit_log.
    // Identifiers are generated solely from fixed ASCII and random hex; never request input.
    const role = 'rights_audit_' + randomBytes(8).toString('hex');
    await pool.query(`CREATE ROLE "${role}" NOLOGIN BYPASSRLS`); roles.push(role);
    await pool.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await pool.query(`GRANT SELECT,UPDATE ON app_user,module,rights_catalogue,user_permission TO "${role}"`);
    await pool.query(`GRANT INSERT ON user_permission TO "${role}"`);
    let auditFailureError;
    const auditFailure = await serve({ query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { async query(sql, values) {
        try {
          const result = await client.query(sql, values);
          if (sql.startsWith('BEGIN')) await client.query(`SET LOCAL ROLE "${role}"`);
          return result;
        } catch (error) { auditFailureError = error; throw error; }
      }, release: () => client.release() };
    } });
    const failed = await auditFailure(url(target), { method: 'PUT', body: { rightCodes: codes.slice(0, 2) }, cookie: cookies.admin });
    assert.equal(failed.status, 500);
    assert.equal(auditFailureError.code, '42501'); assert.match(auditFailureError.message, /audit_log/);
    assert.deepEqual(await failed.json(), { error: 'User Management is temporarily unavailable. Try again later.' });
    assert.equal((await pool.query('SELECT 1 FROM user_permission WHERE user_id=$1', [target.id])).rowCount, 0);
    assert.equal((await audits(target)).length, 0);
    const downstreamFailure = await serve({ query: (...args) => pool.query(...args), async connect() {
      const client = await pool.connect();
      return { query: (sql, values) => sql.startsWith('UPDATE app_user SET stamp=stamp') ? client.query('SELECT 1/0') : client.query(sql, values), release: () => client.release() };
    } });
    assert.equal((await downstreamFailure(url(target), { method: 'PUT', body: { rightCodes: codes.slice(0, 2) }, cookie: cookies.admin })).status, 500);
    assert.equal((await audits(target)).length, 0);
    assert.equal((await pool.query('SELECT 1 FROM user_permission WHERE user_id=$1', [target.id])).rowCount, 0);
    assert.equal((await put(target, codes.slice(0, 2))).status, 200);
    assert.equal((await audits(target)).length, 2);
  });
});
