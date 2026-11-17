# S1-DEV-03 — Final local authentication verification

## Git / schema provenance

Existing branch: `feat/S1-DEV-03-auth-session`. Existing PR: #8, targeting main.
History 73286c7 and 1ff3272 is preserved; no new auth branch or history reset.
At this run, fetched origin/main was 8b4cf13. DBA PRs #39/#40 and health fix #41
are confirmed merged. The existing auth branch at 03d3012 was reused and main was
merged locally in cc62426, preserving all previous auth work. No history reset or
new auth branch was needed. No GitHub PR merge was performed.

Tests now run directly on the existing Developer branch after main integration.
Local PostgreSQL 16 database hopedb contains the full real merged migration chain:
setup verification, DBA-02, DBA-03 and DBA-04. No temporary CREATE TABLE contract
replaces the migrations. Actual account columns/FKs/audit/revocation triggers,
session storage and reset-token structures were inspected. All 36 rights remain.
The Developer PR diff relative to main contains no migration or schema-file changes.

DBA-03 is required by authentication. DBA-04 supports future emailed resets and is
not queried by auth runtime code. The compatibility test explicitly checks that
an emailed-reset token does not authorize first-login setup or consume that token.
The existing schema alignment in 1ff3272 remains valid. Main integration introduced
static serving of public assets, so private auth pages were moved to views/auth.
The friendly routes still enforce full/restricted sessions; raw .html paths are
not served. The new regression initially failed (200 instead of 404), then passed
after this auth-scoped fix. No outstanding test failures remain.

## Executed command / fixture safety

The clean dependency install and full suite ran on feat/S1-DEV-03-auth-session:

```bash
npm ci
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
  PGHOST=/tmp/hope-main-health-pg.jchctr PGPORT=55439 PGDATABASE=hopedb PGUSER=codespace \
  npm test
```

The socket path is specific to this isolated local cluster; supply your own trusted
local settings to reproduce. The cluster has no TCP listener. The test checks the
actual database name before fixture mutations. Default auth integration still
requires opt-in; local hopedb additionally requires AUTH_ALLOW_HOPEDB_TEST=1.
AUTH_VERIFY_DBA04=1 enables the optional reset-table compatibility assertion.

Accounts have random auth-test-/register- email identifiers and random credentials;
fixtures include an Admin linked to actual employee 00001 and an uninitialized
Superadmin. No real user credentials are modified. Cleanup deletes only fixture
sessions/reset tokens and soft-deletes only fixture accounts; audit history remains.
The fresh local database had no real application users. No .env or credentials
were added to Git. Tests issue DML against the real schema, not migration DDL.

## Requested acceptance matrix

All rows below executed against local PostgreSQL through actual HTTP endpoints,
using express-session and connect-pg-simple rather than a MemoryStore. The fault
case uses a separately configured real PostgreSQL pool, described in row 15.

| # | Required check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Valid credentials | PASS | Active account login returns 200 and an authenticated cookie |
| 2 | Invalid password | PASS | 401; generic response matches unknown-account response |
| 3 | Unknown account | PASS | 401 with the same error/body as wrong password |
| 4 | Blocked login | PASS | Correct credential proof receives 403; no usable session |
| 5 | Pending account | PASS | Newly registered pending user receives 403; wrong password stays generic 401 |
| 6 | Secure password storage | PASS | Registration/setup bcrypt hashes verify against generated passwords; cost-12 checks; no raw password/hash in response or session context |
| 7 | Session creation | PASS | Actual auth_session row; user_id/username/role/empno context matches the Admin account and employee FK |
| 8 | Persistence | PASS | A new app instance with the same secret loads the existing cookie from PostgreSQL |
| 9 | Logout invalidation | PASS | Cookie cleared and presented session row removed; another user's session stays valid |
| 10 | Logged-out cookie rejected | PASS | Replay gets 401 and cannot reach protected endpoint |
| 11 | Block after login | PASS | Subsequent protected request gets 403; unblock does not resurrect the old cookie/version |
| 12 | Authorized first setup | PASS | NULL-password Superadmin proves private setup token; temporary-password account also completes setup; new bcrypt hash and full rotated session |
| 13 | Setup cannot be bypassed | PASS | Restricted session denied full-session endpoint and redirected from account page to set-password |
| 14 | Unauthorized/incorrect setup | PASS | Missing cookie 401; weak/mismatched/reused temporary password 400; completed setup 409; old/replayed credentials 401; concurrent setup has one winner |
| 15 | Safe database failures | PASS | A real PostgreSQL pool with search_path=pg_catalog causes relation lookup failure; API returns fixed generic 500, not SQL/table/driver details |
| 16 | Existing registration | PASS | 201; pending/user/unblocked/nondeleted defaults; stored hash verifies; duplicate email 409 |

Additional PASS checks: cookie HttpOnly/Strict configuration; proxy-aware Secure
cookie policy; production HTTPS/secret validation; origin/JSON checks; throttling;
login and setup SID rotation; invalid-cookie rejection; controlled absolute-expiry
transition; expired/reissued tokens; audit actor/redaction; transaction rollback;
startup schema validation and successful startup/shutdown; blocked/pending state
changes during setup; soft-deleted user denial; safe session-store failures.
These additional checks combine real database tests and focused unit/HTTP tests.
The expanded integration test manipulates only its own session deadline to test
expiry without waiting eight hours; it does not bypass the production guard.

## Results and limits

- PASS: clean npm ci; installation audit reported zero vulnerabilities.
- PASS: 71 tests, 0 failures, 0 skips with the live integration flags above.
- PASS: reviewed SQL uses placeholders for incoming values; static column lists
  are not caller-controlled. Audit actor is transaction-local and tied to verified user.
- PASS: tests capture/check generic failures; runtime logging uses fixed messages,
  not passwords, hashes, setup tokens, session IDs, or raw driver errors.
- PASS: scope and whitespace checks; no DBA files in Developer changes.
- FAIL: none outstanding.
- NOT RUN: visual/mobile/keyboard checks in a full browser. Browser-handler tests
  use a DOM harness and HTTP tests serve the actual pages/assets.
- NOT RUN: deployed HTTPS handshake and hosted Supabase validation. Secure-cookie
  behavior is exercised through the explicitly trusted proxy path in automated tests.
- PASS: post-main-merge verification, /health and /api/health, registration, and
  actual server-entrypoint startup and graceful shutdown with exit code 0.

The application uses a persistent PG store in production; MemoryStore is confined
to tests. The process-local rate limiter still requires a shared store if deploying
multiple server instances, as already documented. Actual account credential
provisioning remains DBA-05; this run installs no production seeds or bypasses.

## Review checkpoint

Use the ready-to-paste PR description in docs/S1-DEV-03.md for existing PR #8.
The branch, original commits and working implementation are preserved. No remote
push, PR creation/update or merge was authorized or executed in this run.
Dependency merging and local main integration are complete. Publishing any new
Developer commits or updating PR #8 still requires explicit approval.

## Current six-case acceptance checklist

| Test | Result | Evidence |
| --- | --- | --- |
| 1 | PASS | Active login, persistent cookie, protected session check, logout, then old cookie 401 |
| 2 | PASS | Wrong password and unknown email share the same generic 401 body |
| 3 | PASS | Actual registration defaults pending; correct-password login returns 403 |
| 4 | PASS | Blocked login and previously logged-in account denied; unblock cannot revive old session |
| 5 | PASS | NULL-password Superadmin and temporary-password account forced through setup; bcrypt hash/flag clearance, new-only credentials, rotated sessions |
| 6 | PASS | Scope/whitespace/ignore checks; no .env, node_modules, AI folders, or DBA changes staged |

Additional post-merge PASS checks: private raw HTML routes are 404, guarded pages
require sessions, and main's /api/health alias returns the same minimal 200 JSON.
The actual Node server entrypoint was started with private ephemeral environment
settings, tested for both health routes and real registration (201/409/400), then
terminated gracefully. No real credentials were changed; only generated local
fixtures were used and soft-deleted. Main's labelled UI prototype remains intact;
/login is the real auth entry point. Dashboard integration remains out of scope.
