# S1-DEV-03 — Authentication and first-login password setup

## Scope and references

Implements issue #6 only: login, logout, PostgreSQL-backed sessions, first-login
password setup, and pending/blocked account enforcement. Original history is preserved from registration
commit 8339765 through authentication commit 73286c7. Registration is now merged;
existing PR #8 targets main. DBA PRs #39 (DBA-03) and #40 (DBA-04) were both OPEN at final local verification;
neither is assumed to be part of main.
The preserved branch is `feat/S1-DEV-03-auth-session`.

Reviewed Student Guide §2.4/§3.1/§3.8 and the prototype from the
[shared reference folder](https://drive.google.com/drive/folders/1-O8asPsItaImQ9dUoQc-ZpE4uaalynV9).
The login form uses email/password and the existing visual styling. Demo accounts,
Google OAuth, remember-me, emailed resets, approval endpoints, user CRUD, and
dashboard/module permissions are outside this task. The `/account` page only
demonstrates an authenticated session and logout; it is not the future dashboard.

## Migration-backed DB contract — separate DBA PR awaits approval

The authoritative authentication contract is S1-DBA-03 migration
`20261116070000_dba03_rbac_schema.sql` in its independent DBA branch/worktree.
It has been applied locally to hopedb and tested with this auth rework. No official
migration is added as a Developer-task change. Startup verifies required columns
with LIMIT 0 and never creates schema. Temporary CREATE TABLE substitutes are
obsolete; install the real migration chain. DBA-05 credential provisioning remains
a separate task.

DBA-04 adds password_reset_token for the future S1-DEV-04 emailed reset flow. It is
not a runtime dependency of login, logout, or first-login setup. Final compatibility
testing includes both migrations and proves that an emailed-reset token cannot
authorize the first-login flow. No reset APIs or email behavior are implemented.

The migration retains registration's `app_user` contract: `user_id` bigint identity PK,
`first_name`/`last_name` varchar(100), canonical unique `email` varchar(254),
`password_hash` varchar(60), text `role`, boolean `blocked`, text approval `status`,
and text `stamp`. The text role references role(role_code). Names/email/role/blocked/
status/stamp remain not null. `is_deleted boolean NOT NULL DEFAULT false` is
independent of pending/active/inactive approval status.

Additional dependencies:

| Column | Expected type / meaning |
| --- | --- |
| `password_hash` | Nullable only for an uninitialized account; never plaintext |
| `empno` | Nullable varchar(5), FK to employee(empno) in DBA-03 |
| `must_change_password` | Boolean NOT NULL DEFAULT false; temporary credentials require true |
| `setup_token_hash` | Nullable varchar(64), SHA-256 hex digest of a random 32-byte token |
| `setup_token_expires_at` | Nullable timestamptz; token must be unexpired |
| `session_version` | Integer NOT NULL DEFAULT 0, nonnegative; revokes older sessions when incremented |

The issue calls the setup flag `requires_password_reset`; this API response field
maps to `must_change_password` or an unset password. It does not mean the emailed
password reset workflow. Session `username` is the verified account email, matching
the Guide's email-based login; no invented username column is queried. Context
stored in `session.user`: `user_id`, `username`, `role`, and nullable `empno`.
`requireAuth` refreshes `req.user` from the DB on every request. This fresh context
is authoritative; the stored context is a login-time snapshot, not an RBAC check.

Session storage is `auth_session` with `sid varchar PRIMARY KEY`, `sess json NOT
NULL`, `expire timestamp(6) NOT NULL`, and an index on expire. It uses the existing
pool via connect-pg-simple, with automatic table creation disabled. Expired records
are periodically pruned; application shutdown closes the pruning timer and pool.
Do not attach business soft-delete/audit triggers to this technical session table
without reviewing the session store's required deletion semantics.

Only non-deleted accounts with `status='active' AND blocked=false` can authenticate.
Pending users remain pending; this branch never approves them. The obsolete
legacy status='blocked' assumption has been removed; blocked is a separate flag.
The migration automatically increments `session_version` for blocked/status/
soft-delete, role, email, password and setup-credential changes. Unblocking cannot
resurrect an old session; explicit increments remain available for other revocation
operations and are not doubled by the trigger. Every current authenticated request rechecks the row and
destroys its presented session if blocked, pending, missing, expired, or version-stale.

Password setup locks the account row in a transaction, rechecks eligibility,
stores a cost-12 bcrypt hash, clears the setup flag/token/expiry, increments session
version, and rotates the session ID. The DB owns stamps and redacted audit rows;
the application no longer synthesizes its own password-update stamp. It calls parameterized transaction-local
`set_config('app.username', verified_email, true)` for compatibility with
`audit_user()`; the actor does not leak across pooled transactions. The migration preserves an existing audit_user() and installs baseline-compatible
audit support where absent. Its audit triggers redact password hashes and setup
credentials from recorded row payloads.

## Secure first-login provisioning

An empty password is not proof of identity. The DBA/administrator must provision
either a bcrypt-hashed temporary password with `must_change_password=true`, or a
cryptographically random 32-byte setup token with its SHA-256 digest and expiry.
Deliver the raw credential privately; never put it in Git, URLs, logs, or seed SQL.
Token issuance, account creation, approvals, and email delivery are not endpoints
in this task. Seed accounts need an explicit short token expiry chosen by the DBA.

For token accounts, the login form accepts a pasted private token instead of a
password. Both routes issue a restricted session, valid for at most 10 minutes.
It can set the initial password or log out; normal authenticated routes deny it.
Token expiry/reissue is rechecked during requests and the locked update. Once
setup completes, the token cannot be used again. A null-password account with no
valid setup credential is denied access, rather than receiving a bypass.

No password is hashed again at ordinary login; bcrypt.compare verifies it.
Registration's password policy is shared without changing its behavior: minimum
12 characters, uppercase/lowercase/digit, maximum 72 UTF-8 bytes, no NUL, exact
confirmation. Setup additionally rejects the existing temporary password.

## Configuration and routes

1. Use Node.js 24+ and run `npm ci`.
2. Configure the database in private `.env`. Tests accept disposable hopedb_auth_test;
   testing local hopedb requires explicit AUTH_ALLOW_HOPEDB_TEST=1 consent.
3. Generate SESSION_SECRET privately:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. Put that output in `.env` as SESSION_SECRET (at least 32 bytes). Set
   `APP_ORIGIN=http://localhost:3000` for local HTTP. Visit that exact hostname.
   Production requires an HTTPS origin and automatically sets Secure cookies.
   The example placeholder is rejected. Database-only `db:check` does not require
   session configuration.
5. Apply the real DBA-02 and DBA-03 migrations from the separate DBA worktree in
   order. Use a fresh local DB if an old temporary prototype schema already exists;
   do not overwrite teammate data. No temporary schema bootstrap is required.
6. Run `npm run db:check`, `npm start`, and open `/login`.

Cookies are named `session_id`, HttpOnly, SameSite=Strict, Path=/, and Secure when
the configured origin is HTTPS. Full sessions have an 8-hour absolute lifetime;
restricted sessions have a 10-minute absolute lifetime. Session IDs rotate on
login and password setup. Secrets and authenticated pages use no-store responses.
No tokens, passwords, session IDs, or account context are stored in browser storage.

`TRUST_PROXY=none` is the default. `loopback` is available only for a verified
reverse proxy on the same host; do not enable it with an untrusted local proxy.
HTTPS configuration rejects insecure auth requests instead of silently failing
to set cookies. Use HTTPS at the deployment boundary.

| Route | Behavior |
| --- | --- |
| GET `/login` | Public sign-in page |
| POST `/api/v1/auth/login` (alias `/login`) | Email + password OR setup_token; creates full/restricted session |
| GET `/set-password` | Guarded initial-password form |
| POST `/api/v1/auth/set-password` (alias `/set-password`) | new_password + confirm_password, session required |
| POST `/api/v1/auth/logout` (alias `/logout`) | Destroys session and clears matching cookie; safe to repeat |
| GET `/api/v1/auth/session` | Full-session guard and minimal safe user response |
| GET `/account` | Full-session confirmation page and logout |

State-changing auth requests must be JSON and carry Origin equal to APP_ORIGIN;
this prevents cross-origin login/setup/logout CSRF. CLI clients must provide
`Origin: http://localhost:3000` explicitly in local testing. Invalid credentials
share a generic 401 response. Account-state errors are disclosed only after
credential verification. Rate limiting allows 20 attempts per IP per 15 minutes
across login/setup; it is process-local and requires a shared limiter store for
multiple server instances. Sessions themselves are already stored in PostgreSQL.
Unexpected DB/store errors return a generic 500, without driver details.

Logout also clears expired/restricted sessions and is idempotent. Login and setup
responses provide `/set-password` or `/account` as redirect destinations. Browser
code redirects revoked sessions to `/login?terminated=1` and displays a notice.
If session persistence fails after password setup commits, authentication stays
denied; the user can log in with the new password. The password transaction cannot
be rolled back after a successful commit merely because the session save failed.

## Verification and acceptance checklist

See [the full 16-case verification report](S1-DEV-03-verification.md) for the latest
executed checks, exact command, both-DBA integration status, and remaining limits.

`npm test` runs the ordinary suite without a configured DB; its opt-in PostgreSQL
test is skipped. Run real integration checks only against a disposable database
containing the real DBA-02 and DBA-03 migrations:

```bash
AUTH_INTEGRATION=1 PGDATABASE=hopedb_auth_test npm test
# Explicit local hopedb verification with both real migrations installed:
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 PGDATABASE=hopedb npm test
```

Provide PGHOST/PGPORT/PGUSER/PGPASSWORD through your local environment as needed;
the integration test intentionally does not load `.env`. It inserts random test
accounts, soft-deletes only its own fixture accounts and deletes its own technical
sessions. Optional DBA-04 verification deletes only its own emailed-token fixture.
It refuses other DB names and does not modify real user credentials. Audit history is retained.
It does not run DDL. Automated browser-handler tests use a DOM harness rather than
a full browser; visual/keyboard/mobile verification remains manual.

Acceptance checks: valid login persistence; generic invalid credentials; pending,
blocked, inactive and deleted accounts; blocking after login; cookie tampering;
absolute expiry and version revocation; restricted sessions; temporary-password
and null-password/token setup; expired/reissued/replayed tokens; matching/strong
passwords; duplicate setup race; transaction rollback; store/database errors;
Secure cookies/proxy boundary; CSRF origin rejection; throttling; logout revocation.
Registration tests must continue passing. Verify no official migrations or secrets
are staged with `git diff --cached --name-only` and `git status --short`.

## Ready-to-paste PR description

**Title:** [S1-DEV-03] Login and logout with session handling; password hashing and set-password on first login; blocked users cannot sign in

### Summary

Complete S1-DEV-03 authentication using the actual DBA-03 schema, with DBA-04
compatibility verified separately. Preserve working code and existing PR #8.
Closes #6.

### Changes

- Add/reuse modular login/logout, PostgreSQL-backed express-session storage, and requireAuth.
- Verify bcrypt credentials; keep pending, blocked, inactive and deleted accounts out.
- Rotate session IDs on login/setup; enforce expiry and version revocation on every protected request.
- Support restricted first-login setup with a temporary password or private expiring setup token;
  atomically clear initial state, hash the new password and preserve the real audit actor.
- Align auth reads with is_deleted and DB-owned stamps/revocation; retain registration behavior.
- Expand live acceptance tests for local hopedb, session isolation/fixation, temporary-password
  and null-password setup, database faults, and separation from emailed-reset credentials.
- Add the full verification report and update setup notes; no runtime rewrite was needed.

### Database Dependencies

Requires S1-DBA-03 app_user/auth_session, its role/employee FKs, audit support and
session_version trigger. Actual fields: user_id, email, role, empno, password_hash,
blocked, status, is_deleted, must_change_password, setup_token_hash,
setup_token_expires_at, session_version. API requires_password_reset maps to the
first-login flag/unset hash. session.user stores user_id/username(email)/role/empno;
req.user is refreshed from PostgreSQL before protected access.

S1-DBA-04 password_reset_token is present in compatibility tests but is not a
runtime login/setup dependency. Its tokens are rejected as first-login proof.
No migration, temporary table bootstrap, reset/email API, or DBA credential seeds
are included in the Developer task diff. DBA PRs #39/#40 were both open when tested;
local combined tests use detached main + both real migration files, not a claim
that these migrations have merged. DBA-05 account provisioning remains separate.

### Testing Notes

PASS: clean npm ci, zero vulnerabilities reported by installation audit, and all
69 automated tests with real PostgreSQL hopedb integration enabled. PASS: all 16
requested acceptance cases (see docs/S1-DEV-03-verification.md), two-user logout
isolation, session regeneration/expiry/tampering, first-login concurrency/replay,
registration regression, and DB/store error handling. Database fault coverage uses
an isolated PostgreSQL pool with an invalid search_path, not a production outage.
Browser handlers are tested with a DOM harness. NOT RUN: visual browser/production
TLS deployment checks and post-merge verification against main (DBA PRs unmerged).

### Security Verification

Passwords use bcrypt cost 12 and parameterized SQL; hashes/tokens are absent from
API responses and audit payloads. Generic 401 credentials errors do not distinguish
unknown email from wrong password. Account-state errors follow credential proof.
Sessions use a PostgreSQL store, HttpOnly/SameSite=Strict cookies, Secure for HTTPS,
regeneration and absolute expiration; production rejects HTTP origin configuration.
Every protected request checks fresh account status/version. Logout destroys only
the presented session. Initial password setup cannot be bypassed or repeated;
row locking and credential version checks reject competing attempts. JSON/origin
checks and IP throttling apply to state-changing authentication requests.

### Files Changed

Auth/session helpers, guards/controllers/routes, auth pages and browser handler,
startup/config integration, shared existing password policy, auth-specific tests,
and docs/S1-DEV-03*.md. The latest verification work changes only the live auth test
and documentation; production implementation from the preserved commits remains.

### Scope Confirmation

Only S1-DEV-03, on preserved feat/S1-DEV-03-auth-session with original history intact.
No DBA migration appears as a Developer-task addition. No main merge was performed;
combine updated main only after dependency merges and authorization. No remote
push, PR update/creation or merge is performed in this verification task.

### Deferred Tasks

S1-DEV-04 emailed resets; DEV-05 user CRUD; DEV-06 approvals/designation and
last-superadmin guard; DEV-07 rights UI; DEV-08 dashboard/module rights; later sprints.

## Preservation / approval checkpoint

Initial Developer status was clean at 73286c7. DBA work lives separately at
/workspaces/hope-dba-03 on feat/S1-DBA-03-rbac-schema-migration, created from
origin/main 5601e38. Combined testing lives at /workspaces/hope-auth-integration
in a detached worktree built by applying isolated patches, without Git merges.
This Developer rework is prepared locally; the required post-DBA-merge main
integration is intentionally pending. No remote push, merge or PR update was
performed. Reuse PR #8; do not open another Developer PR.

Final verification uses /workspaces/hope-auth-final-integration at main 5601e38,
with isolated copies of both unmerged DBA migrations. See the verification report
for current database location and results; earlier temporary cluster paths above
are historical and are not required to reproduce the tests.
