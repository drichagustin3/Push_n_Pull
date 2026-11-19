// Test-only consumer fixture: imports unchanged DEV-07/08 from a detached checkout.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { join } = require('node:path');
const { readFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { once } = require('node:events');

test('DBA-05 issue codes work with unchanged DEV-07/08 over real HTTP/PostgreSQL', {
  skip: process.env.DBA05_COMPATIBILITY !== '1' ? 'Opt in on an isolated local migrated DB with DBA05_APP_ROOT.' : false,
}, async (t) => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb');
  assert.ok(process.env.DBA05_APP_ROOT);
  const appRequire = createRequire(join(process.env.DBA05_APP_ROOT, 'package.json'));
  const { Pool } = appRequire('pg');
  const bcrypt = appRequire('bcrypt');
  const express = appRequire('express');
  const { createApp } = appRequire('./src/app');
  const { createSessionMiddleware } = appRequire('./src/auth/session');
  const { createAuthorization } = appRequire('./src/rbac/middleware');
  const { readAuthConfig } = appRequire('./src/auth/config');
  const pool = new Pool({ connectionTimeoutMillis: 5000, query_timeout: 5000 });
  const config = readAuthConfig({ SESSION_SECRET: randomBytes(32).toString('hex'), APP_ORIGIN: 'http://localhost:3000' }, 'test');
  const password = 'Aa1' + randomBytes(20).toString('hex');
  const hash = await bcrypt.hash(password, 12);
  const ids = [];
  const app = createApp({ pool, authConfig: config });
  const sessions = createSessionMiddleware(pool, config);
  const authorization = createAuthorization(pool, config);
  const source = readFileSync(join(__dirname, '../../supabase/migrations/20261119060000_dba05_catalogue_seed.sql'), 'utf8');
  const pairs = [...source.matchAll(/\('([^']+)','([^']+)','([^']+)','([^']+)'\)/g)]
    .map((match) => ({ old: match[1], code: match[2], module: match[3] })).filter((pair) => pair.old !== pair.code);
  assert.equal(pairs.length, 18);
  const root = express();
  // Only this disposable test server exposes probe routes; shipping app is unchanged.
  for (const code of pairs.flatMap((pair) => [pair.old, pair.code])) {
    root.get('/_test/' + code, sessions.middleware, authorization.requireRight(code), (req, res) => res.json({ allowed: true }));
  }
  root.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.code || 'unavailable' }));
  root.use(app);
  const server = createServer(root);
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    app.locals.closeAuthStore(); sessions.store.close();
    try {
      await pool.query('UPDATE user_permission SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [ids]);
      await pool.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=ANY($1::text[])", [ids]);
      await pool.query('UPDATE app_user SET is_deleted=TRUE WHERE user_id=ANY($1::bigint[])', [ids]);
    } finally { await pool.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  async function request(path, cookie, method = 'GET', body) {
    return fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { Origin: config.origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function fixture(role) {
    const email = `dba05-compat-${randomBytes(10).toString('hex')}@example.test`;
    const id = String((await pool.query("INSERT INTO app_user(first_name,last_name,email,password_hash,role,status) VALUES('DBA05','Synthetic',$1,$2,$3,'active') RETURNING user_id", [email, hash, role])).rows[0].user_id);
    ids.push(id);
    const response = await request('/login', null, 'POST', { email, password });
    assert.equal(response.status, 200);
    return { id, cookie: response.headers.getSetCookie()[0].split(';')[0] };
  }
  const admin = await fixture('admin'), user = await fixture('user');
  const endpoint = `/api/users/${user.id}/rights`;
  const initial = await request(endpoint, admin.cookie);
  assert.equal(initial.status, 200);
  const catalogue = (await initial.json()).modules.flatMap((module) => module.rights.map((right) => right.rightCode));
  assert.equal(catalogue.length, 36);
  for (const pair of pairs) assert.ok(catalogue.includes(pair.code) && !catalogue.includes(pair.old));
  for (const pair of pairs) {
    assert.equal((await request('/_test/' + pair.code)).status, 401);
    assert.equal((await request(endpoint, admin.cookie, 'PUT', { rightCodes: [pair.code] })).status, 200);
    const snapshot = await (await request(endpoint, admin.cookie)).json();
    assert.deepEqual(snapshot.rightCodes, [pair.code]);
    const navigation = await (await request('/api/navigation', user.cookie)).json();
    assert.deepEqual(navigation.rightCodes, [pair.code]);
    assert.deepEqual(navigation.items.map((item) => item.code), [pair.module]);
    assert.equal((await request('/_test/' + pair.code, user.cookie)).status, 200);
    assert.equal((await request('/_test/' + pair.old, user.cookie)).status, 403);
    assert.equal((await request(endpoint, admin.cookie, 'PUT', { rightCodes: [pair.old] })).status, 400);
    assert.equal((await request(endpoint, admin.cookie, 'PUT', { rightCodes: [] })).status, 200);
    assert.equal((await request('/_test/' + pair.code, user.cookie)).status, 403);
  }
  const events = (await pool.query("SELECT action,right_code FROM (SELECT action,new_values->>'right_code' AS right_code FROM audit_log WHERE table_name='user_permission' AND record_key LIKE $1) e", [user.id + '|%'])).rows;
  assert.equal(events.length, 36);
  for (const pair of pairs) assert.deepEqual(events.filter((event) => event.right_code === pair.code).map((event) => event.action).sort(), ['ADD', 'DELETE']);
  assert.equal((await request(endpoint, admin.cookie, 'PUT', { rightCodes: [pairs[0].code] })).status, 200);
  const restored = (await pool.query("SELECT action FROM audit_log WHERE table_name='user_permission' AND record_key=$1 ORDER BY audit_id DESC LIMIT 1", [user.id + '|' + pairs[0].code])).rows[0];
  assert.equal(restored.action, 'RESTORE');
});
