const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { ConfigurationError, readConfig } = require('../src/config/env');

const credentials = { PGUSER: 'test_user', PGPASSWORD: 'test_password' };

test('config defaults to local hopedb and preserves password whitespace', () => {
  const config = readConfig({ ...credentials, PGPASSWORD: ' test password ' });
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.port, 3000);
  assert.equal(config.database.host, '127.0.0.1');
  assert.equal(config.database.port, 5432);
  assert.equal(config.database.database, 'hopedb');
  assert.equal(config.database.password, ' test password ');
  assert.equal(config.database.ssl, false);
});

test('config accepts explicit environment values and certificate-verified TLS', () => {
  const config = readConfig({
    ...credentials,
    NODE_ENV: 'production',
    PORT: '8080',
    PGHOST: 'db.example.test',
    PGPORT: '5433',
    PGDATABASE: 'hopedb_test',
    PGSSLMODE: 'verify-full',
  });
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.port, 8080);
  assert.equal(config.database.port, 5433);
  assert.equal(config.database.database, 'hopedb_test');
  assert.equal(config.database.host, 'db.example.test');
  assert.deepEqual(config.database.ssl, { rejectUnauthorized: true });
});

for (const name of ['PGUSER', 'PGPASSWORD']) {
  for (const value of [undefined, '', '   ']) {
    test(`${name} rejects missing/blank value ${JSON.stringify(value)}`, () => {
      assert.throws(() => readConfig({ ...credentials, [name]: value }), {
        name: 'ConfigurationError', message: `${name} is required.`,
      });
    });
  }
}

for (const name of ['PORT', 'PGPORT']) {
  test(`${name} rejects malformed and out-of-range ports`, () => {
    for (const value of ['', '0', '-1', '65536', '3.5', '3000abc', '1e3']) {
      assert.throws(() => readConfig({ ...credentials, [name]: value }), ConfigurationError);
    }
    assert.doesNotThrow(() => readConfig({ ...credentials, [name]: '65535' }));
  });
}

test('config rejects blank database settings and unsupported modes without leaking values', () => {
  for (const name of ['PGHOST', 'PGDATABASE', 'NODE_ENV', 'PGSSLMODE']) {
    for (const value of ['', '   ']) {
      assert.throws(() => readConfig({ ...credentials, [name]: value }), ConfigurationError);
    }
  }
  for (const name of ['NODE_ENV', 'PGSSLMODE']) {
    assert.throws(() => readConfig({ ...credentials, [name]: 'sensitive-value' }), (error) => {
      assert.equal(error instanceof ConfigurationError, true);
      assert.equal(error.message.includes('sensitive-value'), false);
      return true;
    });
  }
});

test('environment file loads, process variables win, and a missing file is optional', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'hope-config-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, '.env');
  writeFileSync(file, 'PGUSER=file_user\nPGPASSWORD=file_password\nPORT=4000\n');
  const script = `
    const { loadConfig } = require(${JSON.stringify(require.resolve('../src/config/env'))});
    const config = loadConfig(process.argv[1]);
    console.log(JSON.stringify({ port: config.port, user: config.database.user }));
  `;
  const fromFile = spawnSync(process.execPath, ['-e', script, file], { env: {}, encoding: 'utf8' });
  assert.equal(fromFile.status, 0, fromFile.stderr);
  assert.deepEqual(JSON.parse(fromFile.stdout), { port: 4000, user: 'file_user' });

  for (const envFile of [file, path.join(directory, 'missing.env')]) {
    const result = spawnSync(process.execPath, ['-e', script, envFile], {
      env: { ...credentials, PORT: '4321' }, encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { port: 4321, user: 'test_user' });
  }

  const unreadable = spawnSync(process.execPath, ['-e', script, directory], {
    env: credentials, encoding: 'utf8',
  });
  assert.notEqual(unreadable.status, 0);
  assert.match(unreadable.stderr, /Unable to read the environment file/);
});
