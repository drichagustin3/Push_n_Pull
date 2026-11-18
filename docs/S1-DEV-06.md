# S1-DEV-06 — Superadmin controls

## Task overview, branch and PR metadata

- Issue: [#44](https://github.com/drichagustin3/Push_n_Pull/issues/44).
- Branch: `feat/S1-DEV-06-superadmin-controls`, existing local branch reused.
- Base: `feat/S1-DEV-05-user-management` at `645b1c5` while PR #49 is OPEN.
- PR title: `[S1-DEV-06] Superadmin: approve pending users and designate admins; block removing or disabling the last remaining superadmin`
- Publication follows separate user approval; the PR is prepared using the metadata below.

PR #49 is the dependency; target its branch for an isolated DEV-06 diff. Main is
still missing inherited DEV-04/05 work, so do not bundle that code into a fresh
main-target DEV-06 PR. Retarget only after the dependency chain reaches main.

## Repository findings and source alignment

Reviewed issue #44 and its acceptance criteria/comments (no discussion comments),
the existing User Management code/prototype, DEV-03 session checks, and DBA-03/04
migrations. The Student Guide §2.3/2.4/3.8 supplies the existing role/audit and
soft-delete rules; the implementation follows the real schema already reviewed
for DEV-05. No schema columns or rights are invented.

The issue explicitly requires **HTTP 403**, rather than the prompt's allowed
400/409 alternatives, when an operation would disable the sole active Superadmin.
The exact response is:

```json
{"error":"Action blocked: Cannot remove, demote, or disable the last remaining Superadmin."}
```

Issue labels Superadmin/Active/isBlocked map to actual DB values
`role='superadmin'`, `status='active'`, and `blocked`. Eligibility also requires
`is_deleted=false`. Role request values use the existing lowercase API convention.
DB-owned stamp format remains `EDIT <verified email> <timestamp>`, or `DELETE`
for soft deletion; audit_user() receives the authenticated manager's identity.

## Scope and database dependencies

Included: pending User registration approval/rejection, active account role
assignment to user/admin/superadmin, guarded blocking through both existing DEV-05
routes, soft deletion, audit context, session revocation, and User Management
controls. Rejection changes pending status to inactive; it is not a hard delete.
Removal sets is_deleted=true and status=inactive. There is no separate generic
status endpoint or arbitrary status field in profile updates.

Uses existing DBA-03 app_user, role, user_permission, auth_session, audit_user(),
stamp/audit/session-version triggers. Active permission assignments prohibit soft
deletion until removed by their owning workflow. This task does not change rights
assignments. DBA-04 is inherited through the reset-password dependency and is not
modified. No migration, npm package, environment variable or baseline seed change
is required. No local CREATE/ALTER snippet is necessary.

Excluded: restore, rights dialogs/assignment (DEV-07), dashboard/sidebar filtering
(DEV-08), authentication redesign, and Sprint 2–4 modules.

## Implementation and routes

| Method/path | Authorization and behavior |
| --- | --- |
| PUT /api/users/:id/approve | Superadmin only; approve pending, unblocked, nondeleted User registration |
| PUT /api/users/:id/reject | Superadmin only; reject pending nondeleted User registration |
| PUT /api/users/:id/role | Superadmin only; JSON `{ "role": "user/admin/superadmin" }`; active/unblocked targets only |
| DELETE /api/users/:id | Superadmin only; soft delete/deactivate, respect last-account and permission dependencies |
| PUT /api/users/:id/block | Existing toggle/explicit-isBlocked API; Superadmin targets now use the shared guard |
| PATCH /api/users/:id/blocked | Existing explicit blocked compatibility API; same shared guard |

Approve/reject/delete accept an empty JSON object or no body. Unknown fields,
unsupported roles and malformed values return 400. Wrong role returns 403; hidden,
missing or deleted targets return 404; unavailable approval/role targets and
permission dependencies return 409. All mutations retain exact-origin/transport
checks and the existing mutation rate limiter. JSON is required where a payload
is supplied; plain-text writes are rejected. Unexpected DB errors remain generic.

Role updates on pending, blocked, inactive or deleted targets are rejected. A
no-op role assignment does not generate a role-change audit entry or revoke
sessions. Real role changes, approval/rejection, blocking, and deletion preserve
DB audit/version behavior; session rows are revoked transactionally. A user must
sign in again for a new role, and unblocking never restores an old cookie.

## Atomic last-Superadmin guard

`src/users/superadmin-guard.js` and the existing shared account mutation helper
implement this order on a single checked-out PostgreSQL client:

1. BEGIN ISOLATION LEVEL READ COMMITTED.
2. Acquire transaction advisory lock `(1213157445, 6)`, reserved for this app's
   account-management mutations, before any account row lock.
3. Lock actor/target rows in user_id order; recheck actor state, session version,
   role, target visibility and deletion state.
4. Set transaction-local audit actor. Before reducing an eligible Superadmin's
   status, count active, unblocked, nondeleted Superadmins and reject count <= 1.
5. Update the target and revoke its sessions in the same transaction; commit or
   roll back all changes and release the client.

The advisory lock covers both existing DEV-05 block routes and new role/delete
routes, as well as account creation/editing through the shared helper. Therefore,
two actors disabling themselves on different rows cannot both count two accounts
and commit. Explicit READ COMMITTED ensures the count after acquiring the lock
observes the preceding committed mutation. Self-blocking or self-demotion is
allowed for a Superadmin only when another eligible Superadmin remains. Admin
self-block behavior is unchanged (400).

Removing an already inactive/blocked Superadmin does not reduce the active count;
pending, blocked, inactive and deleted accounts never qualify as the surviving
administrator. Future app paths that change eligibility must reuse the helper.
This is cooperative application enforcement, not a new SQL constraint against
direct DBA writes. Account-management writes are serialized; normal reads and
the existing auth/reset password operations are not globally serialized here.

PostgreSQL transaction advisory locks are released at transaction end; Read
Committed uses a new committed-data snapshot for subsequent commands. See the
official [advisory locking](https://www.postgresql.org/docs/16/explicit-locking.html#ADVISORY-LOCKS)
and [isolation](https://www.postgresql.org/docs/16/transaction-iso.html#XACT-READ-COMMITTED)
documentation for the underlying behavior.

## UI and modified files

Open `/users` with an existing active Superadmin session. Pending rows offer
Approve/Reject. Eligible active rows offer a role selector and Assign role.
Nondeleted rows offer Delete. Rejection, role changes and deletion require browser
confirmation. Last-account errors are displayed as returned by the server. The
UI reloads actual backend data after success; self-disabling ends future access.

Capabilities are projected only to Superadmin viewers; Admins do not receive
approval/role/delete flags. The backend enforces authorization independently.
Existing safe text rendering and Admin isolation are preserved.

- New middleware/controller/service/guard: `src/users/superadmin-*.js`.
- Existing integration: `src/users/service.js`, `src/users/routes.js`, `public/users.js`.
- Tests: `test/superadmin.test.js`, `test/superadmin-postgres.test.js`,
  `test/users-form.test.js`.
- `test/users-postgres.test.js`: replace the obsolete blanket Superadmin-block
  restriction assertion with the DEV-06-compatible unblock behavior; retain Admin
  self-block and hierarchy assertions. No unrelated tests were changed.
- README and this document: setup, scope, verification and PR preparation.

## Testing and verification

Executed on 2026-11-18 against actual local PostgreSQL 16 `hopedb`, with the
existing migration chain applied: **132 PASS, 0 FAIL, 0 skipped**. Live HTTP,
persistent PostgreSQL sessions, real SQL errors and a local SMTP reset regression
sink were used. An initial test incorrectly expected role in the public auth
response; it was corrected to check the stored session, preserving that response's
existing restricted field contract. The final full run passed.

| Required test | Result / evidence |
| --- | --- |
| Admin/User cannot approve or assign roles | PASS; reject/delete also return 403 |
| Approve pending registration, then log in | PASS; actual DEV-02 signup starts pending, approval audited, login succeeds |
| Promote/demote roles in DB and session | PASS; user/admin/superadmin transitions, stale cookies rejected, fresh session has actual new role |
| Sole active Superadmin cannot demote/block/delete | PASS; exact 403/message on role, PUT block, PATCH block and DELETE; no stamp/version changes on rejection |
| Two active Superadmins allow one removal, protect the survivor | PASS; demotion, block/unblock and soft-delete/deactivation paths |
| Git hygiene | PASS; ignored secrets/dependencies/AI folders, no migration/package/auth changes, nothing staged |
| Concurrent last-account changes | PASS; three live races: self-demote/block, self-block/delete, self-delete/demote; one 200, one 403, exactly one survivor |
| Audit/security/error integration | PASS; actor identity and old/new role snapshots, rejection, FK/dependency safety, role/body/origin checks, rollback, generic actual SQL failure |

Existing registration, login/logout/initial password, reset-password and DEV-05
tests passed in the same run. Runtime dependency audit reported zero vulnerabilities;
git diff --check passed. Graphical browser and hosted deployment/external mailbox
verification: **NOT RUN**. UI handlers use automated DOM doubles; backend tests
use live local services. Unit doubles do not bypass auth in integration tests.

Run ordinary tests without a configured DB:

```bash
npm test
```

For the full local suite, set private local PG* settings, then:

```bash
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
RESET_INTEGRATION=1 RESET_ALLOW_HOPEDB_TEST=1 \
USERS_INTEGRATION=1 USERS_ALLOW_HOPEDB_TEST=1 \
SUPERADMIN_INTEGRATION=1 SUPERADMIN_ALLOW_HOPEDB_TEST=1 \
npm test -- --test-concurrency=1
```

Use a private migrated database with **no existing active Superadmins** for the
last-account suite. It refuses to alter real administrators to manufacture that
condition. Supported DB names: hopedb_auth_test, or explicitly authorized local
hopedb with the flags above. Run files sequentially so another integration suite
cannot add temporary Superadmins during count assertions. Test accounts have a
unique superadmin-test-* prefix; cleanup removes their technical sessions/tokens,
soft-deletes their rights/accounts, and keeps audit history. Business seeds and
real credentials are untouched. The isolated local cluster used in this session
is recorded in /tmp/hope-dev05-audit-cluster.path, port 55439, user codespace.

## Ready-to-paste PR description

### Summary

Add Superadmin-only registration review and role administration, with transactional
protection against disabling or removing the last active Superadmin.

Closes #44

### Changes

- Add approval/rejection, role assignment, and soft-delete account endpoints.
- Add Superadmin-only User Management actions with confirmation and safe feedback.
- Apply the shared last-account guard to role/deletion and both existing block routes.
- Revalidate account authority under ordered row locks and a shared transaction lock.
- Revoke sessions after real role/state changes and preserve authenticated auditing.
- Add concurrency, role/approval, integration and UI tests and setup documentation.

### Database Dependencies

Existing DBA-03 accounts/roles/permissions/sessions, audit/stamp/version triggers;
DBA-04 stays inherited through the prior reset task. No migration, schema, seed,
dependency package or environment-variable changes.

### Testing Notes

Recorded local verification (2026-11-18): 132 tests passed, zero failed or skipped,
with the full suite run sequentially
against local hopedb. Verified all requested cases, exact issue #44 guard errors,
concurrent disjoint-row self-disable races, audit logs, session revocation, and
existing auth/registration/reset/User Management regressions. Diff and hygiene
checks passed; dependency audit reports zero runtime vulnerabilities. Graphical
browser, hosted deployment and external mailbox checks were not run.

### Security Verification

Superadmin-only routes plus fresh locked actor checks; allowlisted payloads and
parameterized SQL; atomic count/write/session revocation; active/unblocked/nondeleted
count predicate; DB-owned stamps and real audit actor; protected response fields;
origin/transport checks and existing rate limits. Last-account failures return the
issue-required 403 and exact message, overriding the prompt's 400/409 alternatives.

### Scope Confirmation

Only S1-DEV-06 relative to feat/S1-DEV-05-user-management. No rights dialog/assignment,
dashboard filtering, auth rewrite or SQL migration changes.

### Related Tasks Deferred

S1-DEV-07 rights assignment and S1-DEV-08 dashboard/sidebar permissions; restore
and broader lifecycle workflows are outside this PR.

### Dependencies / Known Limits

Stacked on PR #49 while DEV-05 is open; target feat/S1-DEV-05-user-management.
Retarget after the dependency chain reaches main. Future account-eligibility
mutations must reuse the guard; direct DBA SQL is outside this application-level
enforcement. Accounts with active permission assignments cannot be soft-deleted.

## Git commands after review and publication approval

```bash
git diff --check
git status --short
git add src/users/superadmin-guard.js src/users/superadmin-middleware.js \
  src/users/superadmin-service.js src/users/superadmin-controller.js \
  src/users/service.js src/users/routes.js public/users.js \
  test/superadmin.test.js test/superadmin-postgres.test.js \
  test/users-form.test.js test/users-postgres.test.js README.md docs/S1-DEV-06.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(S1-DEV-06): add guarded Superadmin controls"
git push -u origin feat/S1-DEV-06-superadmin-controls
# Copy the PR description above to /tmp/s1-dev-06-pr.md, then:
gh pr create --base feat/S1-DEV-05-user-management \
  --head feat/S1-DEV-06-superadmin-controls \
  --title '[S1-DEV-06] Superadmin: approve pending users and designate admins; block removing or disabling the last remaining superadmin' \
  --body-file /tmp/s1-dev-06-pr.md
```
