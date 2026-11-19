const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { randomBytes, createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');

test('Approved three-account seed has private one-time onboarding and safe reruns', {
  skip: process.env.DBA05_ONBOARDING !== '1' ? 'Requires fresh isolated hopedb and DBA05_APP_ROOT.' : false,
}, async (t) => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb' && process.env.DBA05_APP_ROOT);
  const root = path.resolve(__dirname, '../..');
  const appRequire = createRequire(path.join(process.env.DBA05_APP_ROOT, 'package.json'));
  const { Pool } = appRequire('pg');
  const bcrypt = appRequire('bcrypt');
  const { createApp } = appRequire('./src/app');
  const { readAuthConfig } = appRequire('./src/auth/config');
  const approved = JSON.parse(fs.readFileSync(path.join(root, 'database/seeds/dba05-superadmins.json'), 'utf8'));
  const pool = new Pool();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_user')).rows[0].n, 0, 'Never run onboarding acceptance against existing accounts');
  const output = execFileSync(process.execPath, [path.join(root, 'database/tools/provision_dba05.cjs')], {
    env: { ...process.env, DBA05_ALLOW_PROVISION: '1' }, encoding: 'utf8',
  });
  const match = output.match(/Private delivery file \(0600, outside Git\): (.+)/);
  assert.ok(match, 'Expected private operator delivery artifact');
  const file = match[1].trim();
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  assert.ok(path.relative(root, file).startsWith('..'), 'Delivery secrets must be outside the repository');
  const deliveries = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(deliveries.length, 3);
  assert.equal(new Set(deliveries.map((row) => row.setup_token)).size, 3);
  for (const item of deliveries) assert.ok(!output.includes(item.setup_token), 'Operator output must not contain a raw proof');
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const app = createApp({ pool, authConfig: config });
  const server = createServer(app);
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    app.locals.closeAuthStore();
    await pool.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  async function request(route, body, cookie) {
    return fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method: body ? 'POST' : 'GET', headers: { Origin: config.origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  const cookieOf = (res) => res.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await request('/set-password', { new_password: 'UnusedPassword12', confirm_password: 'UnusedPassword12' })).status, 401);
  for (const identity of approved) {
    const delivery = deliveries.find((item) => item.email === identity.email);
    assert.ok(delivery);
    const before = (await pool.query('SELECT * FROM app_user WHERE email=$1', [identity.email])).rows[0];
    assert.ok(before.first_name === identity.first_name && before.last_name === identity.last_name && before.role === 'superadmin');
    assert.ok(before.status === 'active' && !before.blocked && !before.is_deleted && before.must_change_password && before.password_hash === null);
    assert.ok(before.setup_token_hash === createHash('sha256').update(delivery.setup_token).digest('hex'), 'Only the proof digest is stored');
    assert.equal((await request('/login', { email: identity.email })).status, 400, 'Email alone cannot claim an account');
    const login = await request('/login', { email: identity.email, setup_token: delivery.setup_token });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).redirect, '/set-password');
    const restrictedCookie = cookieOf(login);
    assert.equal((await request('/api/v1/auth/session', null, restrictedCookie)).status, 403);
    const password = 'Aa1' + randomBytes(20).toString('hex');
    const setup = await request('/set-password', { new_password: password, confirm_password: password }, restrictedCookie);
    assert.equal(setup.status, 200);
    const fullCookie = cookieOf(setup);
    assert.equal((await request('/api/v1/auth/session', null, fullCookie)).status, 200);
    const after = (await pool.query('SELECT * FROM app_user WHERE email=$1', [identity.email])).rows[0];
    assert.ok(after.role === 'superadmin' && !after.must_change_password && !after.setup_token_hash && !after.setup_token_expires_at);
    assert.ok(after.password_hash?.startsWith('$2b$12$') && await bcrypt.compare(password, after.password_hash), 'Initial password must be bcrypt hashed');
    assert.equal((await request('/login', { email: identity.email, setup_token: delivery.setup_token })).status, 401);
    const passwordLogin = await request('/login', { email: identity.email, password });
    assert.equal(passwordLogin.status, 200);
    assert.equal((await request('/set-password', { new_password: password, confirm_password: password }, cookieOf(passwordLogin))).status, 409);
    assert.equal((await request('/logout', {}, fullCookie)).status, 200);
    assert.equal((await request('/logout', {}, cookieOf(passwordLogin))).status, 200);
  }
  const audits = (await pool.query("SELECT old_values,new_values FROM audit_log WHERE table_name='app_user'")).rows;
  assert.ok(audits.every((row) => [row.old_values, row.new_values].every((snapshot) => !snapshot || !['password_hash','setup_token_hash','setup_token_expires_at'].some((key) => Object.hasOwn(snapshot, key)))), 'Account audit JSON must exclude proof/password material');
  const rowsBefore = JSON.stringify((await pool.query('SELECT * FROM app_user ORDER BY user_id')).rows);
  const auditBefore = (await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n;
  const rerun = execFileSync(process.execPath, [path.join(root, 'database/tools/provision_dba05.cjs')], {
    env: { ...process.env, DBA05_ALLOW_PROVISION: '1' }, encoding: 'utf8',
  });
  assert.ok(rerun.includes('No new accounts; no setup proofs generated.'));
  assert.ok(JSON.stringify((await pool.query('SELECT * FROM app_user ORDER BY user_id')).rows) === rowsBefore, 'Rerun must not overwrite settled credentials/security state');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n, auditBefore);
});
