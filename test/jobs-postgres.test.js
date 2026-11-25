const assert = require('node:assert/strict');
const { test } = require('node:test');
const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { createApp } = require('../src/create-app');
const { readAuthConfig } = require('../src/auth/config');

test('Job endpoints enforce HR rights, role visibility, and database audit and dependency rules', {
  skip: process.env.JOB_INTEGRATION !== '1' && 'Requires the disposable Job PostgreSQL fixture.',
}, async (t) => {
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGDATABASE, 'hope_job_test');
  const pool = new Pool({ connectionTimeoutMillis: 5000 });
  let server, app;
  t.after(async () => {
    if (server) await new Promise((done) => { server.close(done); server.closeAllConnections(); });
    await app?.locals.closeAuthStore();
    await pool.end();
  });
  assert.equal((await pool.query("SELECT current_setting('cluster_name') AS name")).rows[0].name, 'hope-job-disposable');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_user')).rows[0].n, 0);
  const password = 'Aa1' + randomBytes(18).toString('hex');
  const hash = await bcrypt.hash(password, 12);
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  let failJobRead = false;
  const appPool = {
    connect: (...args) => pool.connect(...args),
    query: (sql, ...args) => failJobRead && /FROM public\.job\b/.test(sql)
      ? Promise.reject(new Error('private database diagnostic')) : pool.query(sql, ...args),
  };
  app = createApp({ pool: appPool, authConfig: config });
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = '/api/hr/jobs';
  function request(path, cookie, method = 'GET', body, origin = config.origin) {
    return fetch('http://127.0.0.1:' + server.address().port + path, {
      method, headers: { Accept: 'application/json', Origin: origin,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
    });
  }

  const cookies = {};
  for (const [kind, role, right] of [
    ['admin', 'admin'], ['super', 'superadmin'], ['reader', 'user', 'dept.edit'],
    ['none', 'user'], ['editor', 'user', 'job.edit'], ['deleter', 'user', 'job.delete'],
    ['adder', 'user', 'job.add'],
  ]) {
    const email = kind + '@example.test';
    const [user] = (await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,role,status)
      VALUES ('Job','Fixture',$1,$2,$3,'active') RETURNING user_id`, [email, hash, role])).rows;
    if (right) await pool.query('INSERT INTO user_permission(user_id,right_code) VALUES ($1,$2)', [user.user_id, right]);
    const login = await request('/login', null, 'POST', { email, password });
    assert.equal(login.status, 200);
    cookies[kind] = login.headers.getSetCookie()[0].split(';')[0];
  }
  assert.equal((await request(base)).status, 401);
  assert.equal((await request(base, null, 'POST', { jobCode: 'Z3Z1', jobDesc: 'Anonymous' })).status, 401);
  assert.equal((await request(base, cookies.none)).status, 403);
  assert.equal((await request('/workspace/human_resources/jobs', cookies.none)).status, 403);
  const workspace = await request('/workspace/human_resources/jobs', cookies.reader);
  assert.equal(workspace.status, 200);
  assert.match(await workspace.text(), /id="jobTable"/);
  assert.match(await (await request('/workspace/human_resources', cookies.reader)).text(), /href="\/workspace\/human_resources\/jobs"/);

  failJobRead = true;
  const unavailable = await request(base, cookies.admin);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: 'jobs_unavailable', message: 'Jobs are temporarily unavailable.' });
  failJobRead = false;

  const payload = { jobCode: 'Z3Z1', jobDesc: 'R&D 50% Group' };
  assert.equal((await request(base, cookies.editor, 'POST', payload)).status, 403);
  assert.equal((await request(base, cookies.admin, 'POST', payload, 'http://example.test')).status, 403);
  assert.equal((await request(base, cookies.admin, 'POST', { ...payload, stamp: 'supplied' })).status, 400);
  assert.equal((await request(base, cookies.admin, 'POST', { ...payload, jobDesc: 'X'.repeat(21) })).status, 400);
  assert.equal((await request(base, cookies.admin, 'POST', { ...payload, jobCode: '..' })).status, 400);
  for (const invalid of [{}, [], { ...payload, jobCode: '' }, { ...payload, jobCode: '12345' },
    { ...payload, jobDesc: ' ' }, { ...payload, is_deleted: true }]) {
    const response = await request(base, cookies.admin, 'POST', invalid);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'validation_error');
  }
  const malformed = await fetch('http://127.0.0.1:' + server.address().port + base, {
    method: 'POST', headers: { Origin: config.origin, Cookie: cookies.admin, 'Content-Type': 'application/json' },
    body: '{"jobCode":',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Invalid JSON body.' });
  const created = await request(base, cookies.adder, 'POST', payload);
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { job: { jobcode: 'Z3Z1', jobdesc: payload.jobDesc } });
  assert.equal((await request(base, cookies.admin, 'POST', payload)).status, 409);

  const detail = base + '/Z3Z1';
  const adminRecord = (await (await request(detail, cookies.admin)).json()).job;
  assert.equal(adminRecord.status, 'active');
  assert.match(adminRecord.stamp, /^ADD adder@example\.test /);
  const active = await (await request(base + '?status=Active&search=z3z1', cookies.admin)).json();
  assert.deepEqual(active.jobs, [adminRecord]);
  assert.deepEqual(active.counts, { active: 1, inactive: 0, all: 1 });
  const missing = await request(base + '/ZZZZ', cookies.admin);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'job_not_found');
  assert.equal((await request(base + '/ZZZZ', cookies.admin, 'PUT', { jobDesc: 'Missing' })).status, 404);
  assert.equal((await request(detail, cookies.editor, 'PUT', { jobCode: 'NEW', jobDesc: 'Wrong' })).status, 400);
  assert.equal((await request(detail + '/restore', cookies.admin, 'POST')).status, 404);
  assert.equal((await request(detail, cookies.reader, 'PUT', { jobDesc: 'Wrong' })).status, 403);
  assert.equal((await request(detail, cookies.editor, 'PUT', { jobDesc: 'Edited 50% Group' })).status, 200);
  assert.equal((await request(detail, cookies.editor, 'PUT', { jobDesc: 'Edited 50% Group' })).status, 200);
  assert.equal((await request(detail, cookies.editor, 'DELETE')).status, 403);
  await pool.query("INSERT INTO jobhistory (empno,jobcode,effdate,is_deleted) VALUES ('00001','Z3Z1','2025-01-01',true)");
  assert.equal((await request(detail, cookies.deleter, 'DELETE')).status, 200);
  assert.equal((await request(detail, cookies.deleter, 'DELETE')).status, 404);
  const retained = await pool.query(`SELECT j.is_deleted, h.jobcode FROM public.job j JOIN public.jobhistory h USING (jobcode)
    WHERE j.jobcode = $1`, ['Z3Z1']);
  assert.deepEqual(retained.rows, [{ is_deleted: true, jobcode: 'Z3Z1' }]);
  assert.equal((await request(detail, cookies.reader)).status, 404);
  assert.equal((await request(detail, cookies.editor, 'PUT', { jobDesc: 'Inactive edit' })).status, 404);
  assert.equal((await request(detail + '/restore', cookies.deleter, 'POST')).status, 403);

  const inactive = await (await request(base + '?status=Inactive&search=edited%2050%25', cookies.super)).json();
  assert.deepEqual(inactive.counts, { active: 0, inactive: 1, all: 1 });
  assert.deepEqual(inactive.jobs.map(({ jobcode, status }) => [jobcode, status]), [['Z3Z1', 'inactive']]);
  const reader = await (await request(base + '?status=All&search=z3z1', cookies.reader)).json();
  assert.deepEqual(reader.jobs, []);
  assert.equal(reader.filter.status, 'active');
  assert.equal(Object.hasOwn(reader, 'counts'), false);
  assert.equal((await request(base + '?status=All&status=Inactive', cookies.admin)).status, 400);
  assert.equal((await request(base + '?status=Unknown', cookies.admin)).status, 400);
  const injected = await (await request(base + '?' + new URLSearchParams({ status: 'All', search: "' OR 1=1 --" }), cookies.admin)).json();
  assert.deepEqual(injected.jobs, []);
  assert.deepEqual(injected.counts, { active: 0, inactive: 0, all: 0 });
  const literal = await (await request(base + '?status=All&search=%25', cookies.admin)).json();
  assert.deepEqual(literal.jobs.map(({ jobcode }) => jobcode), ['Z3Z1']);
  await pool.query(`UPDATE user_permission SET is_deleted=true WHERE right_code='job.delete';
    UPDATE rights_catalogue SET is_deleted=true WHERE right_code='job.delete';`);
  const capabilities = (await (await request(base + '?status=Inactive', cookies.admin)).json()).capabilities;
  assert.equal(capabilities.delete, false);
  assert.equal(capabilities.restore, true);
  assert.equal((await request(detail + '/restore', cookies.admin, 'POST')).status, 200);
  await pool.query("UPDATE rights_catalogue SET is_deleted=false WHERE right_code='job.delete'");
  assert.equal((await request(detail, cookies.deleter, 'DELETE')).status, 403);
  assert.deepEqual(await (await request(detail, cookies.reader)).json(),
    { job: { jobcode: 'Z3Z1', jobdesc: 'Edited 50% Group' } });

  const blocked = await request(base + '/PR1', cookies.admin, 'DELETE');
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, 'job_in_use');
  const [job] = (await pool.query("SELECT is_deleted FROM job WHERE jobcode='PR1'")).rows;
  assert.equal(job.is_deleted, false);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE table_name='job' AND record_key='PR1'")).rows[0].n, 0);
  const { rows } = await pool.query(`SELECT action, action_by, new_values->>'stamp' AS stamp,
    to_char(action_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH12:MI AM') AS manila_time FROM audit_log
    WHERE table_name='job' AND record_key='Z3Z1' ORDER BY audit_id`);
  assert.deepEqual(rows.map(({ action, action_by }) => [action, action_by]), [
    ['ADD', 'adder@example.test'], ['EDIT', 'editor@example.test'],
    ['DELETE', 'deleter@example.test'], ['RESTORE', 'admin@example.test'],
  ]);
  for (const { action, action_by, stamp, manila_time } of rows) {
    assert.equal(stamp, [action, action_by, manila_time].join(' '));
  }
  assert.equal((await request(detail, cookies.admin, 'DELETE')).status, 200);
  assert.equal((await request(detail + '/restore', cookies.super, 'POST')).status, 200);
  assert.deepEqual((await pool.query(`SELECT j.is_deleted, h.jobcode FROM public.job j JOIN public.jobhistory h USING (jobcode)
    WHERE j.jobcode = $1`, ['Z3Z1'])).rows, [{ is_deleted: false, jobcode: 'Z3Z1' }]);

  const longEmail = 'x'.repeat(48) + '@example.test';
  await pool.query(`INSERT INTO app_user(first_name,last_name,email,password_hash,role,status)
    VALUES ('Long','Email',$1,$2,'admin','active')`, [longEmail, hash]);
  const login = await request('/login', null, 'POST', { email: longEmail, password });
  assert.equal(login.status, 200);
  const longCookie = login.headers.getSetCookie()[0].split(';')[0];
  const tooLong = await request(base, longCookie, 'POST', { jobCode: 'LONG', jobDesc: 'Stamp capacity' });
  assert.equal(tooLong.status, 503);
  assert.equal((await tooLong.json()).error, 'job_stamp_unavailable');
  const rolledBack = await pool.query(`SELECT EXISTS(SELECT 1 FROM job WHERE jobcode = 'LONG') AS persisted,
    EXISTS(SELECT 1 FROM audit_log WHERE table_name = 'job' AND record_key = 'LONG') AS audited`);
  assert.deepEqual(rolledBack.rows, [{ persisted: false, audited: false }]);
});
