const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Department endpoints enforce HR rights, role visibility, and database audit and dependency rules', {
  skip: process.env.DEPARTMENT_INTEGRATION !== '1' && 'Requires the disposable Department PostgreSQL fixture.',
}, async (t) => {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'hope_department_test');
  const pool = new Pool({ connectionTimeoutMillis: 5000 });
  let server, app;
  t.after(async () => {
    if (server) await new Promise((done) => { server.close(done); server.closeAllConnections(); });
    await app?.locals.closeAuthStore();
    await pool.end();
  });
  assert.equal((await pool.query("SELECT current_setting('cluster_name') AS name")).rows[0].name, 'hope-department-disposable');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_user')).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(18).toString('hex');
  const hash = await bcrypt.hash(password, 12);
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  app = createApp({ pool, authConfig: config });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = '/api/hr/departments';
  function request(path, cookie, method = 'GET', body, origin = config.origin) {
    return fetch('http://127.0.0.1:' + server.address().port + path, {
      method, headers: { Accept: 'application/json', Origin: origin,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
    });
  }

  const cookies = {};
  for (const [kind, role, right] of [
    ['admin', 'admin'], ['super', 'superadmin'], ['reader', 'user', 'job.add'],
    ['none', 'user'], ['editor', 'user', 'dept.edit'], ['deleter', 'user', 'dept.delete'],
    ['adder', 'user', 'dept.add'],
  ]) {
    const email = kind + '@example.test';
    const [user] = (await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,role,status)
      VALUES ('Department','Fixture',$1,$2,$3,'active') RETURNING user_id`, [email, hash, role])).rows;
    if (right) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES ($1,$2)', [user.user_id, right]);
    const login = await request('/login', null, 'POST', { email, password });
    assert.equal(login.status, 200);
    cookies[kind] = login.headers.getSetCookie()[0].split(';')[0];
  }
  assert.equal((await request(base)).status, 401);
  assert.equal((await request(base, cookies.none)).status, 403);
  const workspace = await request('/workspace/human_resources', cookies.reader);
  assert.equal(workspace.status, 200);
  assert.match(await workspace.text(), /id="departmentTable"/);

  const payload = { deptCode: 'Z3Z', deptName: 'R&D 50% Group' };
  assert.equal((await request(base, cookies.editor, 'POST', payload)).status, 403);
  assert.equal((await request(base, cookies.admin, 'POST', payload, 'http://example.test')).status, 403);
  assert.equal((await request(base, cookies.admin, 'POST', { ...payload, stamp: 'supplied' })).status, 400);
  assert.equal((await request(base, cookies.admin, 'POST', { ...payload, deptName: 'X'.repeat(21) })).status, 400);
  assert.equal((await request(base, cookies.admin, 'POST', { ...payload, deptCode: '..' })).status, 400);
  const created = await request(base, cookies.adder, 'POST', payload);
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { department: { deptcode: 'Z3Z', deptname: payload.deptName } });
  assert.equal((await request(base, cookies.admin, 'POST', payload)).status, 409);

  const detail = base + '/Z3Z';
  const adminRecord = (await (await request(detail, cookies.admin)).json()).department;
  assert.equal(adminRecord.status, 'active');
  assert.match(adminRecord.stamp, /^ADD adder@example\.test /);
  assert.equal((await request(detail, cookies.reader, 'PUT', { deptName: 'Wrong' })).status, 403);
  assert.equal((await request(detail, cookies.editor, 'PUT', { deptName: 'Edited 50% Group' })).status, 200);
  assert.equal((await request(detail, cookies.editor, 'PUT', { deptName: 'Edited 50% Group' })).status, 200);
  assert.equal((await request(detail, cookies.editor, 'DELETE')).status, 403);
  assert.equal((await request(detail, cookies.deleter, 'DELETE')).status, 200);
  assert.equal((await request(detail, cookies.reader)).status, 404);
  assert.equal((await request(detail, cookies.editor, 'PUT', { deptName: 'Inactive edit' })).status, 404);
  assert.equal((await request(detail + '/restore', cookies.deleter, 'POST')).status, 403);

  const inactive = await (await request(base + '?status=Inactive&search=edited%2050%25', cookies.super)).json();
  assert.deepEqual(inactive.counts, { active: 0, inactive: 1, all: 1 });
  assert.deepEqual(inactive.departments.map(({ deptcode, status }) => [deptcode, status]), [['Z3Z', 'inactive']]);
  const reader = await (await request(base + '?status=All&search=z3z', cookies.reader)).json();
  assert.deepEqual(reader.departments, []);
  assert.equal(reader.filter.status, 'active');
  assert.equal(Object.hasOwn(reader, 'counts'), false);
  assert.equal((await request(base + '?status=All&status=Inactive', cookies.admin)).status, 400);
  const literal = await (await request(base + '?status=All&search=%25', cookies.admin)).json();
  assert.deepEqual(literal.departments.map(({ deptcode }) => deptcode), ['Z3Z']);
  assert.equal((await request(detail + '/restore', cookies.admin, 'POST')).status, 200);
  assert.deepEqual(await (await request(detail, cookies.reader)).json(),
    { department: { deptcode: 'Z3Z', deptname: 'Edited 50% Group' } });

  const blocked = await request(base + '/IT', cookies.admin, 'DELETE');
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, 'department_in_use');
  const [department] = (await pool.query("SELECT is_deleted FROM department WHERE deptcode='IT'")).rows;
  assert.equal(department.is_deleted, false);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE table_name='department' AND record_key='IT'")).rows[0].n, 0);
  const { rows } = await pool.query(`SELECT action, action_by FROM audit_log
    WHERE table_name='department' AND record_key='Z3Z' ORDER BY audit_id`);
  assert.deepEqual(rows.map(({ action, action_by }) => [action, action_by]), [
    ['ADD', 'adder@example.test'], ['EDIT', 'editor@example.test'],
    ['DELETE', 'deleter@example.test'], ['RESTORE', 'admin@example.test'],
  ]);
});
