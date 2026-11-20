const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const tls = require('node:tls');
const { once } = require('node:events');
const { connectionOptions, protectPrivate } = require('../tools/dba05-safety.cjs');
const root = path.resolve(__dirname, '../..');
const ref = 'abcdefghijklmnopqrst';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dba05-policy-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const manifest = path.join(dir, 'target.json'), ca = path.join(dir, 'ca.pem');
  fs.writeFileSync(manifest, JSON.stringify({environment:'shared-development',project_ref:ref,
    host:`db.${ref}.supabase.co`,database:'postgres',port:5432,user:'postgres'}));
  fs.writeFileSync(ca, 'test-only certificate placeholder');
  const env = { DBA05_TARGET:'supabase-development', DBA05_TARGET_FILE:manifest,
    DBA05_CONFIRM_PROJECT_REF:ref,PGHOST:`db.${ref}.supabase.co`,PGPORT:'5432',
    PGDATABASE:'postgres',PGUSER:'postgres',PGPASSWORD:'test-only',PGSSLMODE:'verify-full',PGSSLROOTCERT:ca };
  return { env, manifest, dir };
}
test('Only explicit local targets remain allowed by default', () => {
  for (const host of ['127.0.0.1','localhost','::1','/tmp/test-socket']) {
    assert.equal(connectionOptions({PGHOST:host,PGDATABASE:'hopedb'},root).database,'hopedb');
  }
  for (const env of [{PGHOST:'unapproved.example',PGDATABASE:'hopedb'},
    {PGHOST:'localhost',PGDATABASE:'postgres'},{}]) assert.throws(() => connectionOptions(env,root));
});
test('Pinned development allowlist requires exact target, confirmation and verified TLS', (t) => {
  const {env,manifest} = fixture(t);
  const options = connectionOptions(env,root);
  assert.equal(options.ssl.rejectUnauthorized,true);
  assert.equal(options.ssl.servername,env.PGHOST);
  for (const patch of [ {PGDATABASE:'hopedb'}, {PGHOST:'db.other.supabase.co'}, {PGPORT:'6543'},
    {PGUSER:'other'}, {DBA05_CONFIRM_PROJECT_REF:'other'}, {PGSSLMODE:'require'},
    {PGSSLROOTCERT:''}, {PGPASSWORD:''}, {NODE_TLS_REJECT_UNAUTHORIZED:'0'},
    {DBA05_TARGET:'preview'}, {DBA05_TARGET_FILE:''}, {NODE_ENV:'production'},
    {VERCEL:'1'}, {VERCEL_ENV:'preview'}, {VERCEL_TARGET_ENV:'production'},
    {DATABASE_URL:'postgres://ignored'}, {PGSERVICE:'other'}, {PGOPTIONS:'-c role=other'} ]) {
    assert.throws(() => connectionOptions({...env,...patch},root));
  }
  const original = JSON.parse(fs.readFileSync(manifest));
  for (const patch of [{environment:'production'},{project_ref:'bad'}, {port:6543},
    {host:'aws-0.pooler.supabase.com'}, {user:'supabase_admin'},{database:'other'}, {extra:true}]) {
    fs.writeFileSync(manifest,JSON.stringify({...original,...patch}));
    assert.throws(() => connectionOptions(env,root));
  }
  assert.throws(() => connectionOptions({...env,DBA05_TARGET_FILE:path.join(root,'package.json')},root));
});
test('Provisioning authorization remains mandatory; errors do not expose credentials', () => {
  const result = spawnSync(process.execPath,[path.join(root,'database/tools/provision_dba05.cjs')],{
    env:{PATH:process.env.PATH,PGHOST:'127.0.0.1',PGDATABASE:'hopedb',PGPASSWORD:'test-secret-never-print'},encoding:'utf8'});
  assert.equal(result.status,1);
  assert.ok(!result.stderr.includes('test-secret-never-print'));
});
test('POSIX private artifact permissions are verified', {skip:process.platform==='win32'}, (t) => {
  const {dir} = fixture(t);
  protectPrivate(dir,true);
  const file = path.join(dir,'empty-private.json');
  fs.writeFileSync(file,'',{flag:'wx',mode:0o600});
  protectPrivate(file,false);
  assert.equal(fs.statSync(dir).mode&0o777,0o700);
  assert.equal(fs.statSync(file).mode&0o777,0o600);
});
test('TLS trusts only approved CA and matching hostname', {
  skip: spawnSync('openssl',['version'],{stdio:'ignore'}).status !== 0 ? 'Requires OpenSSL for disposable test certificates.' : false,
}, async (t) => {
  const {dir} = fixture(t);
  const key = path.join(dir,'key.pem'), cert = path.join(dir,'cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,
    '-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  const server = tls.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},socket=>socket.end());
  server.on('tlsClientError',()=>{});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  async function connect(options) {
    return new Promise((resolve,reject)=>{
      const socket = tls.connect({host:'127.0.0.1',port:server.address().port,rejectUnauthorized:true,...options},()=>{
        const authorized = socket.authorized; socket.destroy(); resolve(authorized);
      });
      socket.on('error',reject);
    });
  }
  const ca = fs.readFileSync(cert);
  assert.equal(await connect({ca,servername:'localhost'}),true);
  await assert.rejects(connect({ca,servername:'wrong.example'}));
  await assert.rejects(connect({servername:'localhost'}));
});
