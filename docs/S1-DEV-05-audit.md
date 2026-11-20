# S1-DEV-05 — Issue #43 compliance audit

Audit date: 2026-11-18 (Asia/Manila).

## 1. GitHub issue identified

[#43](https://github.com/drichagustin3/Push_n_Pull/issues/43):
**[S1-DEV-05] User Management screen: user list, Add User, Edit User, Block/Unblock;
Admin manages Users only and Superadmin accounts are hidden**.

Read the complete issue body and acceptance criteria using GitHub CLI. It is OPEN,
has no discussion comments, no linked closing PR, and no cross-reference timeline
entries at audit time. The issue names GET/POST /api/users, PUT /api/users/:id,
and PUT /api/users/:id/block. It explicitly allows only Superadmins to create
Admin/Superadmin accounts. The three checkbox criteria cover hiding Superadmins,
preventing Admin blocking of privileged accounts, and immediate persisted toggles.

## 2. Repository status at audit time

- Remote: https://github.com/drichagustin3/Push_n_Pull.
- Current branch: feat/S1-DEV-05-user-management, HEAD cd9c89e.
- Existing implementation is uncommitted. Preserved all existing working files;
  no reset, stash, branch replacement, or history rewrite was used.
- There is no DEV-05 PR or remote branch yet. The prior publication attempt was
  interrupted before committing or publishing.
- PR #8 is merged into main. PR #42 is merged into the authentication branch.
  Current origin/main (273de86) does **not** contain DEV-04 commit cd9c89e or its
  reset-password files. The order/target of those merges matters: a MERGED label
  on #42 does not prove its changes reached main.
- The original DEV-04 base remains the correct isolated comparison for DEV-05.
  Comparing to main currently includes inherited DEV-04 changes; do not submit
  those as fresh DEV-05 work. Integrating DEV-04 into main is a separate dependency
  action. No merges or publication were performed during this audit.

## 3. Requirements compliance matrix

Statuses below describe the corrected implementation and executed evidence.
The Before column records the initial gap without claiming unexecuted baseline
tests. References use the issue's numbered endpoint sections and Acceptance Criteria.

| Requirement | GitHub issue reference | Implementation / evidence | Before | Status | Required action |
| --- | --- | --- | --- | --- | --- |
| Superadmin list includes every role | Endpoint §1 | src/users/service.js:16; live role/deleted-row fixtures | PASS | PASS | None |
| Admin list excludes Superadmins in SQL | §1; acceptance checkbox 1 | service.js:18, routes.js:29; live JSON/HTML visibility checks | PASS | PASS | None |
| Admin rows have no actions for an Admin viewer | §1 | service.js:11; public/users.js:61; live flags and DOM tests | PASS | PASS | None |
| Standard User gets 403; anonymous requests denied | §1 | routes.js:14; requireAuth; live screen/list/Add/Edit/both block routes | PASS | PASS | None |
| Managers can create persisted valid accounts | §2 | service.js:51; bcrypt, DB FK/unique checks, live creation/first-login tests | PASS | PASS | None |
| Admin creates Users only | §2 | service.js:53 and recheck at :60; live elevated-role attempts return 403 | PASS | PASS | Preserve both checks |
| Superadmin can create Admin and Superadmin accounts | §2 | service.js:61; role-aware protected form; live role/hash/setup/audit checks | FAIL | PASS | Corrected User-only assumption |
| PUT edits name/email with valid data | §3 | service.js:67; validation.js:7; live User and privileged-profile edits | PASS | PASS | None |
| Admin cannot edit other Admins or Superadmins | §3 | service.js:43; direct-ID live requests return 404 | PASS | PASS | None |
| Canonical PUT /api/users/:id/block toggles state | §4; acceptance checkbox 3 | routes.js:40, controller.js:14, service.js:75; live bodyless/empty/explicit/concurrent requests | FAIL | PASS | Added canonical route; retained PATCH compatibility |
| Admin can block/unblock only standard Users | §4; acceptance checkbox 2 | service.js:43; direct-ID PUT and PATCH checks | PASS | PASS | Preserve hierarchy on both routes |
| Toggle persists instantly with actor stamp and audit row | §4; acceptance checkbox 3 | service.js:44, :78; actual DB blocked state, stamp, old/new audit snapshots | PARTIAL | PASS | Verified on canonical PUT route |
| Blocked accounts cannot log in or keep existing sessions | Roadmap/integration review | service.js:79 plus unchanged DEV-03 account/version guard; live login 403 and old session 401 | PASS | PASS | No auth reimplementation |
| Required fields, duplicate accounts and restricted fields | Audit phases 4/7 | validation.js:7; routes.js:45; live invalid Add, duplicate Add/Edit, role/status/password injection | PARTIAL | PASS | Expanded tests; kept existing validation |
| Real frontend data, search/filter/pagination and safe errors | Audit phase 4A | public/users.js:33; live pages/search and DOM rendering/error tests | PASS | PASS | None |
| Explicit loading and empty-result feedback | Audit phase 4A | public/users.js:36 and :64; views/users/index.html; DOM tests | PARTIAL | PASS | Added directory status text |
| Safe profiles, parameterized SQL and authenticated auditing | Audit phase 4F | service.js:5 and :37; live redacted audit, unit rollback/revalidation tests | PASS | PASS | No credential/schema changes |
| Registration/auth/reset integration and actual schema | Audit phase 4G | unchanged supporting modules; full live regression suite | NOT VERIFIED for this audit initially | PASS | Executed fresh verification |

## 4. Findings and source discrepancies

- **High, fixed:** Privileged account creation was rejected for Superadmins. The
  original scope interpretation deferred every role-related operation to DEV-06;
  issue #43 expressly includes roles on **new accounts**. Creation now follows
  the issue; changing an existing account's role and approvals remain deferred.
- **High, fixed:** The issue's PUT block endpoint was missing. Added it with the
  same auth, origin, role, transaction and audit checks as the existing PATCH route.
  Empty/no-body requests toggle the locked current state; isBlocked allows explicit
  updates. Concurrent toggles by different managers produce one true and one false
  response and leave the expected final state.
- **Medium, fixed:** Directory loading and empty results had no explicit feedback.
  Added accessible status text and regression tests without rebuilding the screen.
- **Low, fixed:** Documentation had no issue number, described obsolete User-only
  creation, and assumed dependencies were still open. Updated the contract and PR
  description to reference #43 and the verified merge/base situation.
- **Security review:** No critical authorization/data-exposure defect was found in
  the reviewed DEV-05 paths. SQL filters, direct-ID protections, safe projections,
  password hashing and transaction-local audit identity remain enforced. This is
  a scoped code/test audit, not a claim of an exhaustive penetration test.
- **Dependency, not fixed in DEV-05:** DEV-04 is not in origin/main. A clean
  main-target DEV-05 PR requires separate dependency integration first.

The Student Guide §3.8 agrees on hidden Superadmins and read-only Admin rows. Its
general §1.2 metadata rule allows both administrator roles to see deleted rows;
the earlier explicit DEV-05 request narrows that to Superadmins only. The issue
does not explicitly change deletion visibility, so that stricter existing privacy
rule is retained and documented. The guide's uppercase role labels map to the
actual lowercase role FK; issue isBlocked maps to app_user.blocked. The example
audit stamp EDITED maps to the real trigger's EDIT format; no DBA-owned stamp
function was changed. Only the authenticated actor is supplied to audit_user().

Issue #43 lists profile/role fields without prescribing password handoff. The
already approved strong temporary password plus mandatory first-login change is
retained for all newly created roles. Password/confirmPassword are required in
addition to the issue's profile fields; null-password authentication is not enabled.
No approval endpoint or existing-account role-edit bypass was introduced.

Superadmin blocking remains deliberately unavailable as before; DEV-06 owns the
future last-Superadmin administration. The issue expressly restricts Admin targets
and does not require enabling Superadmin disabling in this task.

## 5. Targeted corrections

- src/users/validation.js: validate creation roles; continue rejecting role edits.
- src/users/service.js: bind requested creation role; check actor before hashing
  and again under lock; derive toggle state from the locked target row.
- src/users/controller.js and routes.js: add the required PUT block contract;
  retain PATCH blocked and its existing request body for compatibility.
- views/users/index.html and public/users.js: show privileged creation choices
  only to Superadmins, disable them during profile edits, use canonical PUT for
  block buttons, and render loading/empty/error directory states.
- test/users*.test.js: issue-specific role, route, audit, concurrency, invalid/
  duplicate creation, direct-ID, UI and stale-authority checks.
- README.md and docs/S1-DEV-05*.md: current contracts, issue reference and report.

Existing auth/session/password-setup, registration, password-reset and official SQL
migration files were left unchanged. No npm dependency or environment variable
was added. The pre-existing src/app.js mount is preserved.

## 6. Testing report

The previous temporary PostgreSQL cluster no longer existed after environment
restart. Created a new private Unix-socket PostgreSQL 16 cluster and a local
hopedb, then applied **all existing migration files unchanged** with ON_ERROR_STOP.
The actual schema and 36-right catalogue were verified. No shared/hosted database
or real user's credentials were modified. Synthetic fixtures are soft-deleted;
technical sessions/tokens are cleaned up while audit history remains.

- **PASS:** Full unit/UI/live-regression suite: 116 tests, 0 failures, 0 skips.
- **PASS:** Expanded live User Management suite after adding further duplicate
  creation, privileged edits and concurrent-toggle assertions: 12 tests, 0 failures,
  0 skips. These 12 overlap the full suite; they are not 12 additional distinct tests.
- **PASS:** All required list, visibility, Add/Edit, direct-ID, Block/Unblock,
  login/session revocation, safe DB failure and redaction scenarios, per matrix.
- **PASS:** Existing DEV-02 registration, DEV-03 login/session/first-login behavior,
  and DEV-04 reset regressions with actual PostgreSQL and a loopback SMTP sink.
- **PASS:** git diff --check; supporting modules/migrations/package manifests
  unchanged; ignored private/dependency/AI folders; no staged clutter.
- **PASS:** npm audit --omit=dev: zero vulnerabilities.
- **NOT RUN:** Graphical browser, external mailbox, hosted database/deployment tests.
  Frontend handlers use DOM doubles; HTTP/session/SQL/email-regression delivery
  use live local services.

Reproduction (set PGHOST to the socket directory recorded in
/tmp/hope-dev05-audit-cluster.path, PGPORT=55439, PGUSER=codespace, PGDATABASE=hopedb
for this temporary cluster, or supply your authorized migrated local DB settings):

```bash
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
RESET_INTEGRATION=1 RESET_ALLOW_HOPEDB_TEST=1 \
USERS_INTEGRATION=1 USERS_ALLOW_HOPEDB_TEST=1 npm test
```

## 7. Scope verification

Only DEV-05 account-management code, tests, docs and its original app mount differ
from the original DEV-04 base. All existing uncommitted work remains on the same
branch. No authentication bypasses, migrations, public-registration changes,
approval/role-edit actions, rights management or dashboard changes were added.
No commits, pushes, PR writes, merges or issue closures were performed.

## 8. Pull request readiness

**Ready for code review against the isolated DEV-04 base.** The issue's explicit
functional criteria are verified locally. A clean main-target PR is **blocked by
the inherited DEV-04 integration gap**; do not bundle that dependency's commits
as new DEV-05 changes. There is currently no DEV-05 PR to update. Publication
requires user approval under this audit request.

## 9. PR metadata

Branch: feat/S1-DEV-05-user-management.

Title: `[S1-DEV-05] User Management screen: user list, Add User, Edit User, Block/Unblock; Admin manages Users only and Superadmin accounts are hidden`

Base for isolated comparison: feat/S1-DEV-04-reset-password. Prefer main only after
the separate DEV-04 dependency reaches it; recheck the resulting diff before opening.

## Ready-to-paste PR description

### Summary

Implements User Management with backend-enforced role visibility, account creation,
profile edits and audited blocking, aligned with the official issue.

### GitHub Issue

Closes #43

### Requirements Compliance

PASS: all explicit issue requirements and three acceptance checkboxes, verified
with actual PostgreSQL/HTTP tests. Admins never receive Superadmin accounts and
cannot modify Admin/Superadmin targets. Admins create Users only; Superadmins can
create all three roles. The required PUT block endpoint persists changes instantly
and records authenticated audit data. Read-only Admin rows show no actions.

See docs/S1-DEV-05-audit.md for the requirement-by-requirement matrix and evidence.

### Changes

- Add a protected, searchable and paginated user directory with Add/Edit forms,
  role-appropriate controls, and loading/empty/error feedback.
- Enforce SQL visibility filters and direct-ID hierarchy checks: Admins manage
  Users only, Superadmins are hidden, and other Admin rows are read-only.
- Create accounts with validated role selection, bcrypt temporary passwords and
  mandatory first-login password setup; only Superadmins create privileged roles.
- Add validated profile updates and safe duplicate-email conflict responses.
- Add PUT /api/users/:id/block for audited atomic toggles or explicit state;
  retain the PATCH compatibility route and revoke the blocked account's sessions.
- Add unit, UI-handler and live PostgreSQL tests, plus the issue compliance matrix.

### Database Dependencies

Existing DBA-03 app_user/role/auth_session, employee FK and audit/stamp/session-version
triggers. DBA-04 remains an inherited reset dependency. No SQL, package, or schema
changes. Issue isBlocked maps to app_user.blocked; existing stamp format is retained.

### Testing Notes

116 full-suite tests passed with zero failures/skips on fresh migrated local hopedb.
The expanded 12-test live User Management suite also passed after adding duplicate
creation, privileged-profile editing and concurrent-toggle assertions. Existing
registration/auth/reset regressions passed; local SMTP verifies reset delivery.
Diff/hygiene checks passed; runtime dependency audit reports zero vulnerabilities.
Graphical browser, external mailbox and hosted deployment checks were not run.

### Security Verification

SQL visibility filters and direct-ID hierarchy checks, fresh actor/target authority
under ordered locks, allowlisted creation roles, protected profile fields, bcrypt
cost 12 with mandatory initial password change, generic safe errors, response
redaction, origin/JSON checks and transactionally audited target-session revocation.

### Scope Confirmation

Only S1-DEV-05. Existing-account role designation, approval, last-Superadmin
administration, rights assignment and dashboard permissions remain deferred.
Authentication and official migrations are unchanged.

### Known Issues

DEV-04 is merged into the authentication branch but absent from current main.
Keep the DEV-05 comparison isolated and integrate that dependency separately before
a main-target PR. Privileged creation still requires strong temporary credentials
and mandatory setup. Superadmin disabling and the previous task's stricter metadata
privacy rule remain as documented; no unverified deployment claims are made.
