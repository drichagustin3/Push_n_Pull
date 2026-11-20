const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function outside(root, candidate) {
  const relative = path.relative(fs.realpathSync(root), fs.realpathSync(candidate));
  return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
}

function connectionOptions(env, root) {
  // This is an offline operator tool, never a Vercel build/start/request handler.
  if (['VERCEL', 'VERCEL_ENV', 'VERCEL_TARGET_ENV'].some((key) => env[key] !== undefined) ||
      env.NODE_ENV === 'production') throw new Error('Provisioning is forbidden in Vercel and production runtimes.');
  if (['DATABASE_URL', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS'].some((key) => env[key])) {
    throw new Error('Remove alternate connection/service/options settings; use explicit PG variables.');
  }
  const local = env.DBA05_TARGET === undefined || env.DBA05_TARGET === 'local';
  if (local) {
    if (env.PGDATABASE !== 'hopedb' || !env.PGHOST ||
        !(['127.0.0.1', 'localhost', '::1'].includes(env.PGHOST) || path.isAbsolute(env.PGHOST))) {
      throw new Error('Local provisioning requires explicit loopback/Unix-socket PGHOST and PGDATABASE=hopedb.');
    }
    return { host: env.PGHOST, database: 'hopedb', port: env.PGPORT || 5432,
      user: env.PGUSER, password: env.PGPASSWORD, ssl: false, connectionTimeoutMillis: 5000 };
  }
  if (env.DBA05_TARGET !== 'supabase-development' || !env.DBA05_TARGET_FILE ||
      !outside(root, env.DBA05_TARGET_FILE)) throw new Error('An external approved development target manifest is required.');
  const target = JSON.parse(fs.readFileSync(env.DBA05_TARGET_FILE, 'utf8'));
  if (Object.keys(target).sort().join(',') !== 'database,environment,host,port,project_ref,user' ||
      target.environment !== 'shared-development' || !/^[a-z]{20}$/.test(target.project_ref) ||
      target.host !== `db.${target.project_ref}.supabase.co` || target.database !== 'postgres' ||
      target.port !== 5432 || target.user !== 'postgres') throw new Error('Invalid approved Supabase development target.');
  if (env.DBA05_CONFIRM_PROJECT_REF !== target.project_ref || env.PGHOST !== target.host ||
      env.PGDATABASE !== target.database || env.PGUSER !== target.user || env.PGPORT !== '5432' ||
      env.PGSSLMODE !== 'verify-full' || !env.PGSSLROOTCERT || !env.PGPASSWORD ||
      env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Explicit target confirmation and verified TLS configuration are required.');
  return { host: target.host, database: target.database, port: target.port, user: target.user,
    password: env.PGPASSWORD, ssl: { rejectUnauthorized: true, servername: target.host,
      ca: fs.readFileSync(env.PGSSLROOTCERT, 'utf8') }, connectionTimeoutMillis: 5000 };
}

function protectPrivate(target, directory, platform = process.platform) {
  if (platform !== 'win32') {
    fs.chmodSync(target, directory ? 0o700 : 0o600);
    if ((fs.statSync(target).mode & 0o777) !== (directory ? 0o700 : 0o600)) throw new Error('Private file permissions failed.');
    return;
  }
  // No interpolated paths or secrets in the shell. Establish and verify the ACL
  // on an EMPTY file/directory before writing any proof. Fail closed on non-NTFS.
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference = 'Stop'
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$item = Get-Item -LiteralPath $env:DBA05_ACL_PATH
if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point rejected' }
$acl = if ($item.PSIsContainer) { New-Object System.Security.AccessControl.DirectorySecurity } else { New-Object System.Security.AccessControl.FileSecurity }
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true, $false)
$rule = if ($item.PSIsContainer) { New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow') } else { New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow') }
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $env:DBA05_ACL_PATH -AclObject $acl
$actual = Get-Acl -LiteralPath $env:DBA05_ACL_PATH
$rules = @($actual.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]))
if (!$actual.AreAccessRulesProtected -or $actual.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl') { throw 'Private ACL verification failed' }
`], { env: { ...process.env, DBA05_ACL_PATH: target }, stdio: 'pipe', windowsHide: true });
}

module.exports = { connectionOptions, outside, protectPrivate };
