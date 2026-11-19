# S1-DEV-08 — Main page and server-side RBAC

## Task / Git / PR metadata

- Issue: [#46](https://github.com/drichagustin3/Push_n_Pull/issues/46), read before
  implementation, including acceptance criteria and comments (none) / listed blockers (none).
- Branch: feat/S1-DEV-08-main-page-rbac.
- Base and proposed PR target: feat/S1-DEV-07-rights-dialog at ce5cb5c.
- PR #53 was verified OPEN; DBA-03 (#39) and DBA-04 (#40) are merged.
- Exact title: `[S1-DEV-08] Main page: sidebar and module tiles by role and rights, plus server-side permission check`
- At implementation verification, no commit, push, PR creation, merge or branch
  deletion had been performed. Keep the review PR in draft while the metrics
  database dependency remains outstanding.

The attachment ends mid-sentence after "permission". The available instructions,
official issue and guide provided enough scope to proceed. Keep the PR stacked
until the dependency commits actually reach main; a merged label on an upstream
stacked PR alone is not sufficient evidence to retarget.

## Requirements and repository findings

Reviewed the real auth/session and User Management/rights/Superadmin code,
DBA-03/04 migrations, business-table reference SQL and schema snapshots, prototype
sidebar/tiles/KPIs, and the [Student Guide](https://drive.google.com/file/d/1Se1YxqJ9RT1frhGuJz4zw34GlEwX8J6j/view)
role/dashboard sections through the Google Drive skill.

Issue #46 adds GET /api/navigation, requireRole/requireRight, and **live dashboard
metrics** beyond the base roadmap wording. It explicitly grants Admin/Superadmin
operational privileges. The guide agrees that Admin sees the operational modules,
while a User sees only granted modules. Therefore:

| Role | Operational modules/actions | User Management | Settings / Audit shell |
| --- | --- | --- | --- |
| Superadmin | Every active module/right in the existing catalogue | Existing hierarchy and controls | Allowed |
| Admin | Every active module/right, regardless of assigned junction rows | Existing Admin isolation | Forbidden |
| User | Module if at least one active granted right belongs to it; each action requires its exact right | Forbidden | Forbidden |

All roles must satisfy current account/session eligibility. Unknown/deleted
catalogue rights are never authorized, even for privileged roles. Admin rights
checkboxes do not remove the issue-defined operational role privilege; stored
grants still matter if that account later becomes a User. There is no CUSTOMER_VIEW
code: use actual codes such as customer.add, price.add and job_history.view.

### Database dependency discovered — production metrics

The four merged migration files create business tables **without status or
is_deleted**. The repository's schema snapshots and original reference soft-delete
setup define is_deleted/stamp, but that setup is not part of the merged migration
chain. Inspection of a fresh migrated local hopedb confirmed the discrepancy.

The user explicitly approved applying **only the existing reference soft-delete /
audit setup to the isolated local test DB**, without committing SQL changes.
The local procedure kept the DBA-03 central audit_log table and its protections,
then applied the existing reference helper functions and business-table attachment
section (helper section 2 through section 4, before the append-only audit section).
No reference file or official migration was edited. No shared database was changed.

**Deployment dependency remains:** a DBA must provide/apply the approved business
soft-delete setup. The metrics service requires Boolean is_deleted on customer,
product, sales, salesdetail and pricehist, plus their existing base columns. It
does not invent status columns or assume all rows are active. Without the flags,
metrics return 503 metrics_unavailable with a safe setup message; navigation and
authorization remain functional. No migration is silently run at app startup.

This Developer branch is ready for review, but active-row production metrics
cannot be declared deployable against the merged-only business schema until that
DBA dependency is resolved. That is not a reason to bundle SQL changes here.

## Implementation plan and reusable middleware

- src/rbac/service.js: refresh the trusted DB account and active role, join
  user_permission/rights_catalogue/module, compute one effective access policy
  shared by navigation and server guards.
- src/rbac/middleware.js: export createAuthorization(pool, authConfig), producing
  requireRole(...roles), requireRight(code), requireModuleAccess(moduleCode), and
  requireAccess. Existing session middleware must be mounted before these guards.
- src/workspace/routes.js: navigation/bootstrap, metrics, and protected shell routes.
- src/workspace/metrics.js: authorized live KPI queries with explicit schema/pricing failures.
- src/workspace/view.js: shared sidebar/header chrome used by workspace/User Management.
- public/workspace.js / workspace.css: server-driven sidebar, tiles, identity,
  live KPI cards, restricted/loading/error handling and existing logout integration.
- Minimal integration only: src/app.js mount/root redirect, the existing /account
  page renderer, and User Management's HTML decoration. Authentication, approvals,
  role assignment and rights-dialog business logic are unchanged.

Future route composition uses a **literal required action**, for example:

```js
const { requireRight, requireModuleAccess, requireRole } = createAuthorization(pool, authConfig);
// Mount session middleware first. A future handler must explicitly use:
// requireRight('customer.add') for Add, requireRight('customer.delete') for Delete.
// requireModuleAccess('customer') only permits entering that module's shell.
```

No generic CRUD routes were added to demonstrate these helpers. Exact-action HTTP
probe routes exist only inside the integration test process.

Authentication is reused from DEV-03. Guards then query current DB state again,
verify session_version and role availability, and load active rights on every
request. Browser roles/user IDs/permission arrays are ignored. Revocations apply
on the next request; there is no session permission cache. Block/status/delete/
role changes invalidate old session versions. Database errors fail closed for all
roles, including Admin/Superadmin. SQL input values are parameterized; the metrics
query's expression list comes only from fixed server-owned module mappings.

## Endpoints, UI and data boundaries

| Path | Behavior |
| --- | --- |
| GET / | Redirect to the established authenticated /account entry |
| GET /account | Existing login destination now renders the real main page |
| GET /workspace | Main page alias |
| GET /api/navigation | Issue-required current identity, menu items, effective rightCodes and restricted state |
| GET /api/me/navigation | Bootstrap alias with the same handler/policy |
| GET /api/dashboard/metrics | Authorized live customer/product/sales counts and revenue |
| GET /workspace/customer, product, human_resources, sales, reports | Protected future-module shells; require the corresponding module |
| GET /users | Existing User Management functionality with consistent persistent sidebar/header |
| GET /workspace/settings, /workspace/audit | Superadmin-only empty shells; no settings/audit viewer implemented |

Bootstrap exposes only display name, username/email, effective role, safe menu
items and permitted right codes. It omits password hashes, setup/reset tokens,
session identifiers, versions and other internal fields. Menus/tiles use the
same backend items; the browser does not reconstruct role privileges or use local
storage. Shells do not expose protected business data or pretend future CRUD is
available. The old static /index.html prototype is preserved as reference; it is
not the live /account workspace or an authentication mechanism.

The desktop sidebar remains fixed and is reused across workspace/User Management
pages, with responsive layout on small screens. Loading, no-assigned-modules,
revoked section, expired session, network failure and metrics dependency states
are explicit. Navigation refreshes on focus/visibility and uses no-store responses.
Expired/blocked sessions return to login; logout uses the existing endpoint and
cookie destruction. User/profile values are rendered as text, never HTML.

### Metrics policy and calculation

Counts are live NOT is_deleted aggregates, not prototype numbers. Users receive
only metrics from authorized Customer/Product/Sales modules; HR/Reports-only or
no-rights Users receive an empty metrics object. Sales authorization is required
for revenue. Privileged roles receive all four metrics when the schema is ready.

Revenue is sum(quantity * unitprice) for active sales and active detail rows.
The unit price is the latest nondeleted pricehist record effective on or before
the sale date. Future and deleted prices are excluded. Missing historical pricing
or quantities return explicit 503 rather than silently reporting zero. All KPI
expressions execute in one SQL statement. Counts and money are JSON strings to
preserve bigint/decimal precision. Currency is rounded to two decimals in SQL.
No payment balance, sales mutation, report engine, audit reader or CRUD is added.

## Requirements compliance matrix

| Requirement | Evidence | Result |
| --- | --- | --- |
| Issue §1 requireRole/requireRight, unauthorized direct API 403 | Reusable guards and actual HTTP exact-action/role probes | PASS |
| Module access never grants every action | customer.add allows its shell but customer.delete remains 403 for User | PASS |
| Issue §2 GET /api/navigation reflects role/grants | Actual role matrices, no-right state, grant/revoke, deleted catalogue tests | PASS |
| Admin/Superadmin operational privilege policy | Shared effective policy and exact-action tests without junction grants | PASS |
| User Management / Settings / Audit separation | Protected route and menu tests; existing management hierarchy unchanged | PASS |
| Fresh eligibility, revoked grants, no stale browser trust | Current DB account/version and active joins; blocked/status/delete/role and query-spoof tests | PASS |
| Issue §3 dynamic metrics | Actual SQL fixture deltas, soft-delete exclusions and as-of price calculations | PASS with authorized local reference setup |
| Merged-only schema supports active-row metrics | Missing business soft-delete columns confirmed before local reference setup | BLOCKED for deployment pending DBA setup |
| Protected persistent main-page/sidebar/tiles | Shared page chrome and DOM/API tests; real /account integration | PASS |
| UI state, logout and prior task compatibility | DOM tests and full auth/registration/reset/User Management/Superadmin/rights regression run | PASS |
| No SQL/dependency/unrelated feature changes | Diff/manifest checks and task-specific branch comparison | PASS |

## Executed verification

2026-11-19, private PostgreSQL 16 hopedb, existing migrations plus the **user-approved
local reference business audit setup**: full suite **164 PASS, 0 FAIL, 0 skipped**.
Actual Express HTTP, PostgreSQL sessions/queries/triggers and loopback SMTP reset
regression delivery were used. Local fixture metrics proved +1 active Customer,
Product and Sale and +60.00 revenue from a 2025 sale despite later/deleted price
records. Business fixture changes and audit entries rolled back with their test
transaction; synthetic account fixtures were soft-deleted during cleanup.

Other executed checks: exact-action/unknown-right denial; live revocation; all role
menus; Admin/User forbidden settings/audit; inactive/deleted catalogue exclusions;
blocked/pending/deleted/demoted session invalidation; actual DB failures returning
safe 503; integer precision; missing-schema/missing-price dependency failures; UI
no-right/error/focus-refresh/logout states. git diff --check passed and runtime
npm audit --omit=dev reported zero vulnerabilities.

Graphical browser, hosted deployment/external mailbox and production DBA migration
application: **NOT RUN**. DOM doubles verify browser handlers; live backend checks
are not simulated. All merged-only-schema metrics cannot be claimed successful.

Use the same existing local integration flags plus WORKSPACE_INTEGRATION:

```bash
# Supply private PG* settings and the approved business schema first.
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
RESET_INTEGRATION=1 RESET_ALLOW_HOPEDB_TEST=1 \
USERS_INTEGRATION=1 USERS_ALLOW_HOPEDB_TEST=1 \
SUPERADMIN_INTEGRATION=1 SUPERADMIN_ALLOW_HOPEDB_TEST=1 \
RIGHTS_INTEGRATION=1 RIGHTS_ALLOW_HOPEDB_TEST=1 \
WORKSPACE_INTEGRATION=1 WORKSPACE_ALLOW_HOPEDB_TEST=1 \
npm test -- --test-concurrency=1
```

Use an isolated migrated hopedb_auth_test or explicitly authorized local hopedb.
The inherited last-Superadmin tests require no existing active Superadmins and
sequential execution. The current private socket path is recorded in
/tmp/hope-dev08-pg.path (port 55439, user codespace). The existing reference setup
was applied from an untracked /tmp SQL file, not a Developer migration. Real
accounts, credentials and shared databases were untouched.

## Ready-to-paste PR description

### Summary

Add the authenticated main workspace with server-driven sidebar/module tiles,
live authorized dashboard metrics, and reusable role/module/exact-action guards.

> **Draft — database dependency outstanding:** metrics were verified locally with
> the approved reference setup. The DBA migration and verification against the
> final applied schema are still required before this PR is ready to merge.

Closes #46

### Changes

- Add /api/navigation and /api/me/navigation with the shared current DB access policy.
- Add requireRole, requireRight and requireModuleAccess with fresh account/right checks.
- Render the real main page at /account and /workspace; add consistent navigation to /users.
- Add protected future-module/Settings/Audit shells without implementing their features.
- Add authorized active-row counts and historical-price revenue with safe dependency failures.
- Add unit, UI and live authorization/metrics/regression tests and integration notes.

### Database Dependencies

Existing DBA-03 account/role/module/right/session schema and inherited DBA-04 reset
schema. **Production metrics additionally require DBA-managed business is_deleted
fields/setup absent from the current merged migrations.** The user approved applying
the existing reference setup only to the isolated local test DB. No official SQL,
seed, package or schema migration changes are included. Without the dependency,
metrics fail explicitly with 503 while navigation/RBAC continue to work.

### Testing Notes

164 tests passed, zero failed/skipped, against local hopedb with existing migrations
and the authorized reference business soft-delete setup. Verified role menus,
exact-action denial, grant revocation, account eligibility, direct URL restrictions,
live count/revenue deltas, as-of pricing, soft-delete exclusions, actual SQL failures,
UI states/logout and all earlier Sprint 1 regressions. Diff/hygiene checks passed;
runtime dependency audit reports zero vulnerabilities. Graphical browser, hosted
deployment and production schema migration were not run.

### Security Verification

Trusted DB role and current session version; no browser-supplied authority or
session permission cache. Soft-deleted grants/rights/modules are excluded. Admin
and Superadmin operational bypass follows issue #46 only for actual active rights;
Settings/Audit stay Superadmin-only and User Management keeps its existing rules.
Metrics expose only authorized modules and no private auth fields. SQL inputs are
parameterized and DB failures never grant access or fabricate KPI values.

### Scope Confirmation

Only S1-DEV-08 relative to feat/S1-DEV-07-rights-dialog. Login/session/approval/role/
rights business logic remains unchanged; only main-page/navigation integration
touches existing page routes. No operational CRUD, report engine, settings editor,
audit reader or migration was added.

### Deferred Tasks / Known Dependency

Sprint 2–4 business screens, payments, reports and audit viewer remain deferred.
DBA business soft-delete migration is required before full metrics deployment.
Stacked on open PR #53; retarget only after its dependency commits reach main.

Before marking ready: apply the DBA-owned business soft-delete migration, review
column/query alignment against the actual schema, rerun integration/security
tests, and verify the task-only diff against the eventual PR base.

## Git commands after review and publication approval

```bash
git diff --check
git status --short
git add src/rbac src/workspace public/workspace.js public/workspace.css \
  src/app.js src/auth/routes.js src/users/routes.js \
  test/workspace.test.js test/workspace-postgres.test.js test/workspace-form.test.js \
  README.md docs/S1-DEV-08.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(S1-DEV-08): add main workspace and live RBAC"
git push -u origin feat/S1-DEV-08-main-page-rbac
# Save the PR description above to /tmp/s1-dev-08-pr.md, then:
gh pr create --draft --base feat/S1-DEV-07-rights-dialog \
  --head feat/S1-DEV-08-main-page-rbac \
  --title '[S1-DEV-08] Main page: sidebar and module tiles by role and rights, plus server-side permission check' \
  --body-file /tmp/s1-dev-08-pr.md
```
