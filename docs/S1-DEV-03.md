# S1-DEV-03 — Authentication and first-login password setup

## Scope and references

Implements issue #6 only: login, logout, PostgreSQL-backed sessions, first-login
password setup, and pending/blocked account enforcement. Based on registration
commit 8339765, not yet merged into main. PR base: `feat/S1-DEV-02-register-user`.
The new branch is `feat/S1-DEV-03-auth-session`.

Reviewed Student Guide §2.4/§3.1/§3.8 and the prototype from the
[shared reference folder](https://drive.google.com/drive/folders/1-O8asPsItaImQ9dUoQc-ZpE4uaalynV9).
The login form uses email/password and the existing visual styling. Demo accounts,
Google OAuth, remember-me, emailed resets, approval endpoints, user CRUD, and
dashboard/module permissions are outside this task. The `/account` page only
demonstrates an authenticated session and logout; it is not the future dashboard.

## Expected DB contract — DBA confirmation still required

No official migration or SQL file is included in this branch. Startup reads the
required columns with `LIMIT 0` and never creates schema. Temporary SQL is supplied
separately for a disposable local database only. Reconcile with S1-DBA-03/05 before
production merge; the Guide proposes logical fields rather than final SQL.

Retain registration's proposed `app_user` contract: `user_id` bigint identity PK,
`first_name`/`last_name` varchar(100), canonical unique `email` varchar(254),
`password_hash` varchar(60), text `role`, boolean `blocked`, text approval `status`,
and text `stamp`. Names/email/role/blocked/status/stamp remain not null.

Additional dependencies:

| Column | Expected type / meaning |
| --- | --- |
| `password_hash` | Nullable only for an uninitialized account; never plaintext |
| `empno` | Nullable varchar(5); future employee FK remains DBA-owned |
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

Only `status='active' AND blocked=false` can authenticate. Pending users remain
pending; this branch never approves them. A defensive legacy `status='blocked'`
check also denies access, but new code must preserve blocked as a separate flag.
Future block/disable/password/credential-rotation operations must increment
`session_version` when they must permanently revoke previous sessions, including
across a later unblock. Every current authenticated request rechecks the row and
destroys its presented session if blocked, pending, missing, expired, or version-stale.

Password setup locks the account row in a transaction, rechecks eligibility,
stores a cost-12 bcrypt hash, clears the setup flag/token/expiry, increments session
version, and rotates the session ID. It calls parameterized transaction-local
`set_config('app.username', verified_email, true)` for compatibility with
`audit_user()`; the actor does not leak across pooled transactions. Existing audit
functions remain unchanged. DBA audit triggers must redact password hashes and
setup-token digests from recorded row payloads.

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
2. Configure the database in private `.env`. For isolated tests use `hopedb_auth_test`.
3. Generate SESSION_SECRET privately:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. Put that output in `.env` as SESSION_SECRET (at least 32 bytes). Set
   `APP_ORIGIN=http://localhost:3000` for local HTTP. Visit that exact hostname.
   Production requires an HTTPS origin and automatically sets Secure cookies.
   The example placeholder is rejected. Database-only `db:check` does not require
   session configuration.
5. Install the agreed official schema, or the separately supplied temporary local
   schema. `IF NOT EXISTS` does not repair incompatible existing definitions.
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

`npm test` runs the ordinary suite without a configured DB; its opt-in PostgreSQL
test is skipped. Run real integration checks only against a disposable database
containing the supplied contract tables:

```bash
AUTH_INTEGRATION=1 PGDATABASE=hopedb_auth_test npm test
```

Provide PGHOST/PGPORT/PGUSER/PGPASSWORD through your local environment as needed;
the integration test intentionally does not load `.env`. It inserts random test
accounts, deletes only its own fixture rows/sessions, and refuses any other DB name.
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

### Summary

Implement S1-DEV-03 authentication with login/logout, persistent sessions, guarded
first-login password setup, and pending/blocked account enforcement. Closes #6.

### Changes

- Add modular auth services/controllers/routes, session helpers, and requireAuth.
- Use express-session with the shared-pool PostgreSQL store and secure cookie settings.
- Verify bcrypt credentials; support restricted first-login sessions using temporary
  passwords or private expiring setup tokens; rotate session IDs and revoke old versions.
- Recheck accounts on protected requests; add JSON/origin checks and throttling.
- Add login/setup/account pages, focused tests, config validation, and setup notes.

### Database Dependencies

Depends on S1-DBA-03/05's agreed schema. Retain registration's app_user columns;
add nullable empno varchar(5), must_change_password boolean default false,
setup_token_hash varchar(64), setup_token_expires_at timestamptz, and
session_version integer default 0. password_hash varchar(60) must permit NULL for
uninitialized accounts. API requires_password_reset maps to the setup flag/unset hash.
Session storage requires auth_session(sid varchar PK, sess json NOT NULL,
expire timestamp(6) NOT NULL) and an expiry index. username context uses verified
email. Password updates set the real actor transaction-locally for audit_user().
Full contract, provisioning, and redaction requirements are in docs/S1-DEV-03.md.
No official migrations, seed credentials, or local-only SQL are committed; no
schema is created at runtime. DBA reconciliation remains required before merge.

### Testing Notes

PASS: clean npm ci (audit reported zero vulnerabilities), all 68 tests with
AUTH_INTEGRATION=1, including real PostgreSQL persistence/concurrency and successful
server startup/shutdown. PASS: whitespace/scope checks and secret/ignore review.
Automated unit/HTTP/browser-handler tests and real PostgreSQL integration tests
cover credentials, account guards, restricted setup, expiry/replay, concurrent
setup, persistence across app instances, logout revocation, cookie options,
transactions, failure handling, and registration regression. The live test uses
an isolated PostgreSQL 16 database and temporary contract, not the unmerged official
migration. Visual browser checks and integration with official DBA migrations
remain pending.

### Scope Confirmation

Only S1-DEV-03; branch feat/S1-DEV-03-auth-session is stacked on registration
commit 8339765. Base this PR on feat/S1-DEV-02-register-user until dependencies merge.

### Related Tasks Deferred

S1-DEV-04 emailed resets, S1-DEV-05 account CRUD, S1-DEV-06 approvals/designation,
S1-DEV-07 rights management, S1-DEV-08 dashboard RBAC, and all later modules.
