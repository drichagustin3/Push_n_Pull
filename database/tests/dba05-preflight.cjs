const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Client } = require('pg');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

test('Disposable database: preflight is read-only and unsafe table/column grants fail closed', {
  skip: process.env.DBA05_PREFLIGHT_TEST !== '1' ? 'Requires explicitly disposable Unix-socket hopedb.' : false,
}, async (t) => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb');
  const db = new Client(); await db.connect();
  let roleCreated = false;
  t.after(async () => {
    try {
      if (roleCreated) await db.query('REVOKE ALL ON app_user FROM anon; REVOKE ALL(email) ON app_user FROM anon; REVOKE ALL ON app_user FROM PUBLIC; REVOKE ALL(email) ON app_user FROM PUBLIC; DROP ROLE anon');
    } finally { await db.end(); }
  });
  assert.equal((await db.query('SELECT inet_server_addr() IS NULL AS local')).rows[0].local,true);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM app_user')).rows[0].n,0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='anon'")).rows[0].n,0);
  const privateBase = fs.mkdtempSync(path.join(os.tmpdir(),'dba05-preflight-test-'));
  t.after(() => fs.rmSync(privateBase,{recursive:true,force:true}));
  const tool = path.resolve(__dirname,'../tools/provision_dba05.cjs');
  function invoke(args=[],allow=false) {
    const env = {...process.env, TMPDIR:privateBase,TMP:privateBase,TEMP:privateBase};
    delete env.DBA05_ALLOW_PROVISION;
    if (allow) env.DBA05_ALLOW_PROVISION='1';
    return spawnSync(process.execPath,[tool,...args],{env,encoding:'utf8'});
  }
  const snapshot = async () => (await db.query(`SELECT
    (SELECT count(*)::int FROM app_user) AS users,
    (SELECT count(*)::int FROM audit_log) AS audit,
    (SELECT count(*)::int FROM module) AS modules,
    (SELECT count(*)::int FROM rights_catalogue) AS rights`)).rows[0];
  const before = await snapshot();
  const check = invoke(['--check']);
  assert.equal(check.status,0,'Read-only preflight must work without mutation authorization');
  const report = JSON.parse(check.stdout);
  assert.equal(report.database,'hopedb'); assert.equal(report.accounts.length,0);
  assert.deepEqual(await snapshot(),before);
  assert.equal(invoke().status,1,'Ordinary invocation still requires authorization');
  await db.query('CREATE ROLE anon');
  roleCreated = true;
  for (const grant of [
    'GRANT SELECT ON app_user TO anon', 'GRANT SELECT(email) ON app_user TO anon',
    'GRANT SELECT ON app_user TO PUBLIC', 'GRANT SELECT(email) ON app_user TO PUBLIC',
  ]) {
    await db.query(grant);
    assert.equal(invoke([],true).status,1,'Sensitive table or column exposure must prevent provisioning');
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(fs.readdirSync(privateBase),[],'No proof artifact should be created');
    await db.query('REVOKE ALL ON app_user FROM anon; REVOKE ALL(email) ON app_user FROM anon; REVOKE ALL ON app_user FROM PUBLIC; REVOKE ALL(email) ON app_user FROM PUBLIC');
  }
});
