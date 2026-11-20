# DBA-05 Supabase development provisioning review

Scope: operator-tool follow-up on `fix/S1-DBA-05-supabase-dev-provisioning` from
main. The original DBA-05 branch, approved roster, and merged SQL are unchanged.
No Supabase connection, shared migration, real proof generation, delivery,
or deployment was performed by this review. Publication of this separate fix
branch and review PR was subsequently authorized; deployment remains unapproved.

## Target policy and limits

The operator tool defaults to explicit loopback/Unix-socket `hopedb` only. Remote
`hopedb` by name alone is no longer allowed. The only additional target profile is
`supabase-development`: exactly `postgres`, port 5432, user `postgres`, direct
`db.<approved-20-letter-ref>.supabase.co` host. A non-secret manifest outside the
repository pins the exact project, plus an independent confirmation variable.
No pooler endpoints, URL overrides, service files, startup PGOPTIONS, alternate
ports/databases/users, Vercel runtimes or NODE_ENV=production are allowed.
`DBA05_ALLOW_PROVISION=1` remains required for every mutating invocation.
`--check` is read-only and never generates proofs or requires mutation approval.

The allowlist file is an operator approval boundary, not evidence from Supabase
that a project is development. Before writing it, two reviewers should verify the
reference in the shared development project's dashboard and confirm it is not a
preview branch or production project. Do not approve production/preview refs.
An operator can deliberately mislabel a project or edit the tool; these guards
prevent configuration mistakes, not a malicious privileged operator. The actual
approved Supabase reference has not been supplied or configured by this change.

The tool does NOT run during Vercel builds, server startup or HTTP requests.
Keep operator credentials, approval manifest, provision authorization and delivery
files off Vercel entirely. Application deployment configuration is a separate task.

## TLS and network

Supabase profile requires PGSSLMODE=verify-full, an explicit Supabase CA PEM file
from Database Settings, certificate verification and exact TLS servername. No
rejectUnauthorized=false or NODE_TLS_REJECT_UNAUTHORIZED=0. Connection options
are passed explicitly to pg; a URL cannot overwrite SSL settings. The stream is
also checked as encrypted and authorized before queries. The direct endpoint
may require IPv6 connectivity (or the project's IPv4 option); fail rather than
silently switching to a transaction pooler. A separate approved endpoint profile
would be needed if direct access is unavailable.

## Privileges and RLS: deployment gate

18 tables and three role rows do not prove schema compatibility. Compare the
actual database against merged DBA-03/04 migrations: account setup/hash/expiry
fields, soft-delete columns, FK behavior, unique identities, audit/stamp triggers,
session tables and password reset table. Use the existing catalogue verifier after
seeding; it verifies descriptions/mappings, not just counts.

Preflight reports current database/user, configured host/port, TLS status,
required tables/read privileges/ownership/RLS, counts, approved account state as
booleans, API role privileges and PUBLIC grants. It does not print hashes/proofs.
It does not assert that ownership or all migration prerequisites are satisfied.
Provisioning SQL still enforces those contracts transactionally.

The migration locks five RBAC tables, may ALTER the permission FK during legacy
code reconciliation, writes accounts/catalogue and invokes audit triggers. The
operator needs appropriate table ownership (or suitably privileged migration
role), schema TEMP/USAGE, SELECT/INSERT/UPDATE privileges, audit INSERT and
sequence privileges, and function execution rights. Use elevated database access
only on the private operator workstation, never in a browser or Vercel frontend.
Supabase `postgres` may bypass RLS; RLS does not replace backend authorization.
The database role `postgres` differs from the ERP `superadmin` application role.

Provisioning refuses any table/column grants on app_user, auth_session,
password_reset_token or audit_log to anon/authenticated (including inherited and
PUBLIC effective privileges), plus direct PUBLIC table/column ACLs. It never
changes grants or RLS automatically. Audit snapshots can include sensitive
personal/account data even when credential fields are scrubbed.

Review the Supabase Data API's exposed schemas, views, security-definer functions,
function EXECUTE grants and policies separately: the tool's checks are not a full
Data API security audit. Custom Express session users do not automatically map to
Supabase Auth auth.uid(). Prefer disabling the Data API if it is unused, or an
explicitly restricted exposed schema with least-privilege grants/RLS. Do not
blindly enable policies or broadly grant authenticated users access. Any required
security migration needs its own approved scope. Resolve exposure findings BEFORE
approving seed execution. No live grants/policies were inspected here.

## Windows PowerShell operator steps (read-only first)

Run on the private operator PC with Node 24+ and installed dependencies. Keep
PowerShell transcripts/screen sharing off when entering credentials or handling
private deliveries. Do not paste their contents into chat or PRs.

```powershell
Set-Location 'C:\Users\ricky\Documents\Coding\Push_n_Pull'
# Use the reviewed branch/commit when available locally; do not reset local work.
node --version
npm.cmd ci

# Confirm this reference independently in the DEVELOPMENT dashboard first.
$ref = Read-Host 'Approved shared-development project reference (not production/preview)'
$privateBase = Join-Path $env:LOCALAPPDATA 'HOPE-ERP-operator'
New-Item -ItemType Directory -Force -Path $privateBase | Out-Null
$targetFile = Join-Path $privateBase 'dba05-development-target.json'
# Stop if an approval file already exists; inspect it instead of replacing it.
if (Test-Path $targetFile) { throw 'Review existing target file; do not overwrite approval.' }
@{
  environment = 'shared-development'
  project_ref = $ref
  host = "db.$ref.supabase.co"
  database = 'postgres'
  port = 5432
  user = 'postgres'
} | ConvertTo-Json | Set-Content -Encoding ascii $targetFile

$env:DBA05_TARGET = 'supabase-development'
$env:DBA05_TARGET_FILE = $targetFile
$env:DBA05_CONFIRM_PROJECT_REF = $ref
$env:PGHOST = "db.$ref.supabase.co"
$env:PGPORT = '5432'
$env:PGDATABASE = 'postgres'
$env:PGUSER = 'postgres'
$env:PGSSLMODE = 'verify-full'
# Download CA from this project's Database Settings; use its actual local path.
$env:PGSSLROOTCERT = Join-Path $privateBase 'supabase-ca.crt'
if (!(Test-Path $env:PGSSLROOTCERT)) { throw 'Download the approved database CA first.' }
# No password in shell command history, files committed to Git, or output.
$env:PGPASSWORD = [System.Net.NetworkCredential]::new('', (Read-Host 'Development database password' -AsSecureString)).Password
Remove-Item Env:DBA05_ALLOW_PROVISION -ErrorAction SilentlyContinue
node database/tools/provision_dba05.cjs --check
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed; do not provision.' }
```

The tool consumes explicit PG variables (not automatic .env loading). The
backend also uses PG variables. Do not change the backend's local .env to use the
privileged provisioning account; use a separate PowerShell session as above.
If the tool rejects DATABASE_URL/PGSERVICE/PGOPTIONS or Vercel/production variables,
open a clean operator session and verify the target again. Do not suppress guards.
Do not call the normal provisioning invocation until separate shared-deployment
approval is given and schema/privilege/TLS checks have been reviewed.

**Future command, only AFTER explicit authorization for shared provisioning:**

```powershell
try {
  $env:DBA05_ALLOW_PROVISION = '1'
  node database/tools/provision_dba05.cjs
  if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed; do not deliver any proofs.' }
} finally {
  Remove-Item Env:DBA05_ALLOW_PROVISION -ErrorAction SilentlyContinue
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
```

Then run the existing catalogue verifier (read-only; psql uses the same PG env
and CA settings; enter the password privately if removed from the process):

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -X -W -v ON_ERROR_STOP=1 -f database/tests/validate_dba05_issue_catalogue.sql
```

## Private proof lifecycle

Only missing approved accounts get unique random proofs; only SHA-256 digests
and expiry go to SQL. The approved three-person JSON/SQL roster is unchanged.
Proofs expire after one hour, require ownership-verified login, and are consumed
by first-password setup. No account can be claimed using only its email.

An owner-only temporary directory outside Git is created. On POSIX, directory/file
modes are verified as 0700/0600. On Windows, explicit protected ACLs containing only
the current user's SID and FullControl are established and read back on the empty
directory/file BEFORE secrets are written; reparse points and unsupported ACL
behavior fail closed. Administrator/backup privileges remain outside this threat
model. Windows execution has not been verified in this Linux environment.

The artifact path is printed; tokens, hashes and SQL error details are not.
Do not use Get-Content/console output to share the entire JSON. View it privately
and deliver only each owner's proof through an approved private channel, with the
correct shared application HTTPS login URL. Localhost on another person's PC is
not your server. Do not upload artifacts to Git/Vercel or leave them in recordings.

The file is written before COMMIT so disk/ACL failure cannot commit undeliverable
accounts. Failure or ambiguous COMMIT may retain a private artifact: reconcile DB
state before any delivery or retry, then securely dispose of invalid artifacts.
Reruns never reset existing hashes, proofs, account roles or security status.
Expired/lost proofs are NOT reissued by this tool; an independently approved,
ownership-verified reissue procedure is still needed. No automatic invitations.

## Executed verification

- PASS: five Node policy/TLS/file-mode tests, zero failures/skips. Exact-target
  mismatches, missing authorization, URL/options overrides, Vercel/prod rejection,
  missing TLS configuration, trusted CA/matching name and wrong CA/name tested.
- PASS: existing unchanged nine-group SQL baseline in a fresh isolated PG16 cluster:
  exact five modules/36 rights, rollback, conflict detection, permission/security/
  session/history preservation and idempotency.
- PASS: live disposable PostgreSQL TLS query confirms encryption; untrusted CA
  and wrong hostname fail. This is not a live Supabase connection test.
- PASS: read-only preflight without provisioning authorization creates no accounts.
- PASS: sensitive-table API-role and PUBLIC grants cause provisioning to fail closed
  with no accounts created.
- PASS: existing HTTP onboarding acceptance: three disposable accounts, unique
  private proofs, email-only rejection, bcrypt first-password setup, consumption,
  session/logout and safe idempotent rerun. No external invitations delivered.
- NOT RUN: live Supabase verified TLS/schema/grants/RLS, Vercel deployment,
  Windows NTFS ACL execution and shared seed execution. No approved project ref,
  live connection or deployment approval was used. Not claimed deployment-ready.

Evidence is under the isolated test path reported in the review; test clusters are
stopped. Never run the destructive baseline runner on shared Supabase or Windows
hopedb. Its Unix-socket/fresh-database safety guards remain unchanged.

Final evidence: `/tmp/hope-dba05-target-review-2p1w_jez/` (private Codespaces
path; `baseline.log`, `pg-tls.log`, `preflight-regression.log`, `onboarding.log`).
All clusters used during review were stopped. Reproduce the new policy tests with
`node --test database/tests/dba05-target.test.cjs`. The live regressions require a
fresh disposable cluster, never the shared or existing Windows database; they
retain explicit opt-in, Unix-socket and empty-account guards. The TLS regression
also needs a disposable loopback TLS listener/CA and `DBA05_TEST_CA`.

Official references: [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement),
[direct database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Data API and RLS security](https://supabase.com/docs/guides/database/secure-data),
and [node-postgres SSL options](https://node-postgres.com/features/ssl).
