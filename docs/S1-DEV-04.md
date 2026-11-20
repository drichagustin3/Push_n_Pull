# S1-DEV-04 — Reset password: request, emailed token, reset form

Branch: `feat/S1-DEV-04-reset-password`. Issue: [#36](https://github.com/drichagustin3/Push_n_Pull/issues/36).
This branch starts at `9149e14` on `feat/S1-DEV-03-auth-session`.
PR #8 is still open; a proposed DEV-04 PR must target that branch until DEV-03
merges. Then update the base to main and verify the diff excludes DEV-03 commits.
The independent DEV-04 PR uses the title and description provided below.

## Setup and database dependencies

Run `npm ci`, configure the existing PostgreSQL/session settings, and add the mail
settings from `.env.example` to your private `.env`. Start with `npm start` and
open `/forgot-password` or follow the link on `/login`.

| Variable | Behavior |
| --- | --- |
| APP_URL | Exact match for APP_ORIGIN; development defaults to APP_ORIGIN. Never derived from request headers. |
| MAIL_FROM | Plain sender email. Development defaults to noreply@example.test; required otherwise. |
| SMTP_HOST | Required outside development. Omit in development to print reset links to the local server console. |
| SMTP_PORT | Default 587; 465 enables implicit TLS. Production requires STARTTLS on other ports. |
| SMTP_USER / SMTP_PASS | Supply both for authenticated SMTP; omit both only for an explicitly configured SMTP relay. |

Production requires HTTPS through the existing auth configuration. TLS certificate
validation remains enabled. Mail errors log fixed messages without SMTP driver
details. Console link logging is development-only; do not use that fallback with
real accounts. No external provider or mailbox was used in automated verification.

Uses the existing merged migrations:

- DBA-03: `app_user`, `auth_session`, credential/session-version triggers and
  redacted auditing. Account fields are `user_id`, `email`, `status`, `blocked`,
  `is_deleted`, `password_hash`, `must_change_password`, `setup_token_hash`,
  `setup_token_expires_at`, and `session_version`.
- DBA-04: `supabase/migrations/20261117070000_dba04_password_reset_token.sql`.
  `password_reset_token` has `id`, `user_id`, `token_hash`, `expires_at`, `is_used`,
  `created_at`, `used_at`. The unique lowercase SHA-256 digest, account FK, expiry
  and consumption constraints, immutable issuance fields, and private RLS remain
  owned by that migration. Startup checks that the expected token columns exist.

Use the same trusted backend DB connection as authentication. All input values
use SQL parameters. No SQL migration or temporary schema is needed for this PR.
Existing `stamp` and audit behavior stays database-owned; the reset transaction
uses the verified account email as its local audit actor, never a fabricated user.

## Routes and behavior

| Method and path | Input / result |
| --- | --- |
| GET /forgot-password | Public email request form |
| POST /forgot-password or /api/auth/forgot-password | JSON `{ "email": "person@example.com" }` |
| GET /reset-password | Public new-password form |
| POST /reset-password or /api/auth/reset-password | JSON `{ "token": "64 lowercase hex characters", "newPassword": "...", "confirmPassword": "..." }` |

JSON POST requests require an exact matching `Origin`; production also requires
HTTPS. Requests share a limit of 20 per IP per 15 minutes per app instance.
Invalid email/body syntax returns 400, disallowed origin returns 403, non-JSON
returns 415, and exceeding the limit returns 429. Every syntactically valid,
permitted forgot request receives the same HTTP 200 body:

```json
{"message":"If an active account exists for that email, a reset link has been sent."}
```

Account lookup and mail delivery run after that common response path, including
for unknown, pending, blocked, inactive, or soft-deleted accounts. Only active,
unblocked, nondeleted accounts receive credentials. Each request generates 32
random bytes, stores only its SHA-256 digest with one-hour expiry, and revokes all
previous unused tokens while locking the account row.

Links use `/reset-password#token=...` so the credential is absent from HTTP GET
requests and access logs. The form also accepts `?token=...` links, but those can
appear in upstream access logs. It removes either token representation from the
current history entry immediately, keeps it only in memory, and uses a no-referrer
policy. Reset forms clear password inputs after server/network responses, prevent
duplicate submissions, and require a new link after success.

Reset validates matching passwords using the existing policy: at least 12
characters, uppercase, lowercase, and a digit, at most 72 UTF-8 bytes, no NUL.
It hashes with bcrypt cost 12. A transaction locks the account and token, rechecks
eligibility/expiry/unused state, updates credentials, clears first-login proof,
increments the session version, consumes all outstanding tokens, and deletes only
that account's stored sessions. All mutations roll back together on failure.
Concurrent redemption has one winner. Reset does not sign the user in; they must
use the existing login form. Invalid, expired, used, or ineligible tokens return
400 with `Invalid or expired password reset token`; unexpected failures return a
generic 500 without SQL details.

The bounded mail queue is in-process (50 jobs, two concurrent deliveries), and
shutdown drains it before closing the pool, within the existing process shutdown
deadline. A full queue, database failure, or mail failure never changes the generic
request response. A known mail delivery failure revokes the newly issued token.
Delivery is **best effort**: a process crash or forced shutdown can lose queued
work, and SMTP acceptance does not guarantee inbox delivery. Use a durable outbox
in a separate authorized task if deployments require guaranteed retries. Multiple
app instances also need a shared rate-limit store for a deployment-wide limit.

## Verification

Unit and form tests need no database:

```bash
npm test
```

Full live verification against a local database with the merged migration chain:

```bash
# Supply your local PGHOST, PGPORT, PGDATABASE, PGUSER and PGPASSWORD privately.
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
RESET_INTEGRATION=1 RESET_ALLOW_HOPEDB_TEST=1 npm test
```

The explicit `*_ALLOW_HOPEDB_TEST` flags authorize synthetic fixture mutations in
local `hopedb`. Tests also support a migrated disposable `hopedb_auth_test` without
those two flags. No external SMTP credentials are needed: tests start an actual
loopback SMTP server on a random port and inspect mail delivered by Nodemailer.
Test accounts use unique `reset-test-*` / `reset-registration-*` emails. Cleanup
deletes their technical token/session rows and soft-deletes their accounts; audit
records and soft-deleted fixtures remain deliberately. Real credentials and
business data are not replaced.

Coverage includes all six requested acceptance checks, password/confirmation
validation, previous-token revocation, concurrent redemption, post-issuance
blocking, target-only session invalidation, redacted audit attribution, SMTP
failure, actual PostgreSQL query failure, transactional rollback, public forms,
origin/content-type/rate-limit enforcement, development fallback, configuration,
browser form handlers, and existing login/first-login/registration regressions.

Executed results on 2026-11-17: **91 PASS, 0 FAIL, 0 skipped**, running the full
command above against local PostgreSQL 16 `hopedb` and the loopback SMTP sink.

| Requested acceptance check | Executed result |
| --- | --- |
| Active request, generic response, delivered link, digest-only storage and expiry | PASS |
| Unknown, pending, blocked accounts: identical response, no token/mail | PASS; inactive and soft-deleted accounts covered too |
| Successful reset, bcrypt hash, consumed token, new-password login | PASS |
| Token replay returns 400 | PASS; concurrent redemption has exactly one winner |
| Expired or tampered token returns 400 | PASS |
| Git hygiene | PASS; .env, node_modules and AI folders ignored; no tracked secrets or migration changes; nothing staged |

`git diff --check` passed. `npm audit --omit=dev` reported zero vulnerabilities.
The existing 36-right catalogue remains present. SMTP provider/inbox delivery and
graphical browser testing: **NOT RUN**; email was verified through real local SMTP
and browser handlers through automated DOM doubles instead.

## Ready-to-paste PR

Title: `[S1-DEV-04] Reset password: request, emailed token, reset form`

### Summary

Implements password-reset requests, private emailed reset links, and a single-use
reset form/API integrated with the existing PostgreSQL authentication schema.

Closes #36

### Changes

- Add forgot/reset forms, JSON routes, validation, and a login-page recovery link.
- Generate one-hour random tokens, persist SHA-256 digests, and revoke older tokens.
- Deliver using environment-configured Nodemailer SMTP or development-only console links.
- Atomically update bcrypt credentials, consume tokens, clear setup state, and revoke target sessions.
- Add reset-specific configuration, startup checks, safe errors, and automated tests.

### Database Dependencies

Requires merged S1-DBA-03 accounts/sessions and S1-DBA-04 password_reset_token.
Uses their existing constraints, audit redaction, and session-version triggers.
No migration files or schema changes are included.

### Testing Notes

91 tests passed, with zero failures or skips. Live integration uses local hopedb,
real Express HTTP and PostgreSQL sessions, and a local SMTP sink. Covers eligible
and ineligible requests, digest/expiry storage, new-password login, replay,
concurrent redemption, expired/tampered tokens, session revocation, SMTP/DB
failures, and registration/auth regressions. Git hygiene and diff checks passed;
runtime dependency audit reported zero vulnerabilities.
No external SMTP provider/inbox or graphical browser verification was performed.

### Security Verification

Generic forgot responses; active-account checks at issuance and redemption;
origin checks and rate limits; fixed-origin links with fragment tokens; hashed
token storage; bcrypt cost 12; transactional single-use consumption; target-only
session revocation; redacted logs and audit data. Background email is best effort,
not a durable outbox.

### Scope Confirmation

Only S1-DEV-04 functionality. No official SQL migrations or unrelated modules.
Stacked on feat/S1-DEV-03-auth-session while PR #8 remains open; target that branch
so DEV-03 changes do not appear in this PR's diff. Retarget after #8 merges.

### Related Tasks Deferred

S1-DEV-05 user management, S1-DEV-06 approvals, S1-DEV-07 rights administration,
S1-DEV-08 dashboard authorization, and Sprint 2–4 modules.

## Git commands (only after review/approval)

```bash
git diff --check
git status --short
git add .env.example README.md package.json package-lock.json \
  src/app.js src/server.js src/password-reset \
  public/login.html public/forgot-password.html public/reset-password.html \
  public/password-reset.js docs/S1-DEV-04.md \
  test/password-reset.test.js test/password-reset-postgres.test.js \
  test/password-reset-form.test.js
git diff --cached --check
git diff --cached --stat
git commit -m "feat(S1-DEV-04): add secure emailed password reset"
git push -u origin feat/S1-DEV-04-reset-password
# Copy the PR section above into a temporary file, then:
gh pr create --base feat/S1-DEV-03-auth-session \
  --head feat/S1-DEV-04-reset-password \
  --title '[S1-DEV-04] Reset password: request, emailed token, reset form' \
  --body-file /tmp/s1-dev-04-pr.md
```
