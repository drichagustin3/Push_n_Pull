# S1-DEV-07 — Rights assignment dialog

## Task overview and Git/PR metadata

- Issue: [#45](https://github.com/drichagustin3/Push_n_Pull/issues/45), read in full
  before implementation, including acceptance criteria, comments and dependencies.
  It is open, with no comments or listed blocking issues at inspection time.
- Branch: `feat/S1-DEV-07-rights-dialog`.
- Base / eventual PR target: `feat/S1-DEV-06-superadmin-controls` at `a88664a`.
  PR #52 was verified OPEN, not merged. DBA-03 (#39) and DBA-04 (#40) are merged.
- Title: `[S1-DEV-07] Rights dialog: admin/superadmin assign per-action rights by module (Customer, Product, Human Resources, Sales, Reports) with module checkbox and All/None; log every rights change in audit_log`
- At implementation verification, no commit, push, PR write, merge or branch deletion
  had been performed. Keep this PR
  stacked until its dependency reaches main; then update/retarget and inspect the
  resulting diff. Do not present inherited DEV-06 or earlier commits as DEV-07 work.

## Repository findings and approved audit contract

Reviewed the actual DBA-03 schema, DBA-04 reset dependency, audit_user() and trigger
definitions, DEV-03 sessions, DEV-05/06 User Management, public/index.html's rights
prototype, and the [Student Guide](https://drive.google.com/file/d/1Se1YxqJ9RT1frhGuJz4zw34GlEwX8J6j/view)
§§2.3/2.4/3.8 through the connected Google Drive skill.

The installed schema uses `rights_catalogue`, not the issue's sample `rights`
table. Codes are varchar(50) strings; user_permission has composite key
(user_id, right_code), is_deleted and a DB-owned stamp. Revocation must soft-delete,
and restoration must reuse that association. Five DB-defined modules contain
3 Customer, 6 Product, 13 HR, 7 Sales and 7 Reports rights: 36 total. These were
verified against the actual local migrated database; no rights are seeded here.

Issue #45 asks for performedBy, RIGHTS_UPDATED and a details array. The merged
audit_log instead has action_by, action, old_values/new_values, record_key and
action_at; action is constrained to ADD/EDIT/DELETE/RESTORE. Its user_permission
triggers already log each actual change atomically. The user explicitly approved
**using those existing trigger audit records** rather than requiring a new DBA
migration. That decision is part of this task's accepted contract.

Mapping:

| Requested audit information | Existing audited representation |
| --- | --- |
| Performed by | action_by = authenticated actor email via transaction-local app.username / audit_user() |
| Granted/revoked right and target | record_key user_id\|right_code; old_values/new_values contain user_id and right_code |
| Previous/new state | is_deleted and stamp in old_values/new_values; old_values null for initial insert |
| Operation | ADD for initial grant, DELETE for revoke, RESTORE for regrant |
| Timestamp | action_at plus permission stamp |
| Module | Resolve preserved right_code through rights_catalogue.module_code |

No literal RIGHTS_UPDATED action, performedBy column, summary details row or actor
ID column is added. There are no duplicate manually inserted audit rows. If that
literal representation is wanted later, it requires a separate DBA-owned change.

On an actual difference, the service touches app_user via `SET stamp=stamp` so the
existing DB stamp trigger records the manager/time. The DB audit trigger ignores
stamp-only parent updates, leaving exactly the per-permission change records.
Identical assignments never touch permissions or account stamps and create no
new audit rows. Audit or later transaction failure rolls all changes back.

## Scope and implementation plan

In scope: protected GET/PUT rights APIs, role/target checks, the complete catalogue,
transactional grant/revoke/restore, account stamp updates, approved auditing,
User Management Rights button and accessible dialog, tests and documentation.

Out of scope: DEV-08 dashboard/sidebar rendering and general business-route
permission enforcement, approvals/role-designation changes, authentication/reset
changes, rights catalogue editing, migrations, and unrelated business modules.

Implementation reuses the existing pool, requireAuth/manager routing, origin/JSON
guards, safe error handler, account lock order and DEV-06 transaction advisory
lock. The existing mutation helper is factored into withManagedUser plus its
unchanged public-user response wrapper so rights transactions can return their
own confirmed catalogue response. No approval or role business logic was changed.

## API and security

### GET /api/users/:id/rights

Returns:

```json
{
  "target": { "user_id": "123", "role": "user" },
  "rightCodes": ["customer.add"],
  "modules": [{
    "code": "customer", "description": "Customer",
    "rights": [{ "rightCode": "customer.add", "description": "Add Customer", "granted": true }]
  }]
}
```

The example is abbreviated; a successful response always includes all 36 active
rights in five modules, preserving DB codes/descriptions. Soft-deleted permission
associations are unchecked. No-rights accounts receive the whole catalogue with
empty rightCodes. Target information is limited to ID and role; no passwords,
setup tokens, session data or unrelated personal details are returned.

### PUT /api/users/:id/rights

JSON payload: `{ "rightCodes": ["customer.add", "customer.edit"] }`.
An empty array clears all assigned rights. Only this field is accepted; codes
must be unique strings, nonempty and at most 50 characters, with at most 36 items.
Duplicate codes are rejected (400), not silently normalized. Unknown/inactive
codes are rejected before any permission write. Role, user ID and metadata
injection are rejected. All input values are SQL parameters.

Anonymous callers get 401; standard Users get 403. Admins manage only User targets;
direct Admin/Superadmin targets return the established generic 404. Superadmins
may manage all three roles. Both APIs reject pending/blocked/inactive accounts
(409) and deleted/missing targets (404). Eligibility is checked even on GET.
Malformed requests return 400, wrong origin 403, non-JSON PUT 415, excessive
mutations 429, and unexpected failures a generic 500. The five-module catalogue
must match the guide's counts; discrepancy returns 503 requesting DBA attention,
with no automatic schema/seed repair.

Both operations run through the shared account transaction guard: READ COMMITTED,
transaction advisory lock, actor/target row locks in ID order, current actor
role/state/session-version and target hierarchy checks. This also serializes
rights against role/block/delete changes. Catalogue/module rows are share-locked;
permission rows are locked for update. Read transactions do not change data.

PUT computes active-versus-requested differences, soft-deletes only revocations,
inserts only new grants or restores deleted pairs using ON CONFLICT with a
deleted-row condition, touches the parent stamp only on a change, and returns
the confirmed state read from that same client. All writes, stamps and trigger
audit entries commit together; rollback and finally release are mandatory.
Concurrent full-set replacements are serialized: the final state is one complete
request, not a merge of unintended partial sets. No new session permission cache
or cross-module enforcement is introduced; DEV-08 owns downstream integration.

## UI and code changes

- src/users/rights-service.js: validation, catalogue checks, transactional reads and differences.
- src/users/rights-controller.js: HTTP input and response handling.
- src/users/routes.js: protected GET/PUT rights route mounting.
- src/users/service.js: reuse the transaction helper and project a safe rights
  eligibility flag; Admin responses still omit status/stamp/deletion metadata.
- public/rights.js: focused native dialog controller; public/users.js adds only
  the eligible-account action and supplies its focus trigger.
- views/users/index.html, public/users.css: dialog markup/styles consistent with
  the existing directory/prototype, without redesigning unrelated screens.
- test/rights*.test.js and test/users-form.test.js: task-specific coverage.

Open /users as Admin or Superadmin, then Rights on an eligible account. The dialog
loads the full catalogue. Each module checkbox controls its action checkboxes and
shows a partial-selection indeterminate state. All/None affects all 36 options;
the counter updates after individual/module/global changes. Save sends the complete
selected set and uses confirmed server state. Failed saves preserve selections;
duplicate submission and closing while saving are prevented. Cancel/Escape sends
no PUT, discards unsaved selections and returns focus. A cancelled loading request
cannot overwrite a subsequently opened target. Profile text uses textContent.

## Requirements compliance matrix

| Requirement / issue reference | Implementation / executed evidence | Result |
| --- | --- | --- |
| GET assigned codes; Admin only User targets (§1) | Shared locked authorization, safe response projection; live HTTP hierarchy tests | PASS |
| PUT rightCodes validation against installed catalogue (§2) | Exact payload/unique-code validation; real known/unknown/injected request tests | PASS |
| Synchronize junction table (acceptance 1) | Actual grant/revoke/restore rows and concurrency tests; composite key preserved | PASS |
| Non-admin modification forbidden (acceptance 2) | 401 anonymous / 403 User; live GET/PUT checks | PASS |
| Every actual change audited (acceptance 3) | Per-right DB-trigger audit with actor, before/after, operation; actual DB verification | PASS |
| Issue audit field/action examples (§3) | Existing trigger format explicitly approved by user; no literal RIGHTS_UPDATED record | PASS under approved mapping |
| Update account stamp (§3) | Real DB stamp actor/time changes on differences; parent summary audit not duplicated | PASS |
| 36 rights/five modules, no-rights account | Live catalogue comparison and guide counts 3/6/13/7/7 | PASS |
| Eligibility and fresh authorization | GET/PUT state restrictions; unit stale-session/role/target checks before catalogue exposure | PASS |
| Module/individual/indeterminate/All/None | Automated dialog DOM tests | PASS |
| Cancel/Save/retry/confirmed state | No PUT on cancel, duplicate save blocked, errors retain selection, confirmed response rendered | PASS |
| Idempotency and atomic audited rollback | Live unchanged-set, real audit-trigger failure and subsequent SQL failure tests | PASS |
| Concurrency | Identical requests produce one grant set; competing sets remain complete; replayed audits match committed state | PASS |
| Prior task compatibility and hygiene | Full live regression suite; auth/approval/role/migration/package sources unchanged | PASS |

## Testing and verification results

Executed on 2026-11-19 against a fresh private PostgreSQL 16 cluster's hopedb with
all existing migrations applied unchanged: **148 PASS, 0 FAIL, 0 skipped**. The
full suite includes actual Express HTTP, persistent PostgreSQL sessions, database
audit triggers, and local SMTP for the existing reset tests.

All ten requested scenarios passed: standard/anonymous authorization; Admin
hierarchy; Superadmin catalogue; persistence/revoke/restore/idempotency; audit
identity/before-after/rollback; invalid payloads with no partial writes; frontend
checkbox/cancel/save behavior; concurrent updates; prior DEV-03/05/06 regressions;
Git hygiene. The guide and real database both contain the expected 36 rights.

The audit-failure test creates a temporary generated NOLOGIN database role with
trusted-backend read/write access but no audit_log INSERT privilege. A request
uses normal authenticated app authorization and transaction-local SET ROLE;
the real trigger fails and all writes roll back. A second test forces a real SQL
error after audited writes and verifies those audit rows also roll back. The
fixture role/grants are removed in cleanup. This test requires database superuser
privileges on an isolated cluster; otherwise that subtest is explicitly skipped.
It executed and passed in the reported run. No test bypasses application auth.

Also PASS: git diff --check, no staged clutter/secrets/migrations, unchanged
package manifests, and npm audit --omit=dev with zero vulnerabilities.
Graphical browser, hosted database/deployment and external mailbox testing:
**NOT RUN**. Dialog handlers use DOM doubles; live backend tests use actual local
services, not simulated HTTP/SQL results.

Reproduce with private local PG* settings and a migrated isolated database:

```bash
npm test
# Full live suite, including the existing last-Superadmin fixture tests:
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
RESET_INTEGRATION=1 RESET_ALLOW_HOPEDB_TEST=1 \
USERS_INTEGRATION=1 USERS_ALLOW_HOPEDB_TEST=1 \
SUPERADMIN_INTEGRATION=1 SUPERADMIN_ALLOW_HOPEDB_TEST=1 \
RIGHTS_INTEGRATION=1 RIGHTS_ALLOW_HOPEDB_TEST=1 \
npm test -- --test-concurrency=1
```

Use hopedb_auth_test or explicitly authorized local hopedb. Full tests must run
sequentially to isolate Superadmin count assertions and need no pre-existing
active Superadmins. Rights fixtures use unique rights-test-* emails; cleanup
soft-deletes permissions/accounts and removes sessions, preserving audit history.
Business seeds and real credentials are unchanged. This session's private socket
directory is recorded in /tmp/hope-dev07-pg.path (port 55439, user codespace).

## Ready-to-paste PR description

### Summary

Add the User Management Rights dialog and secured APIs for all 36 per-action
rights, with transactional synchronization and audited grant/revoke/restore.

Closes #45

### Changes

- Add GET/PUT /api/users/:id/rights with full grouped catalogue and assigned codes.
- Enforce Admin/User hierarchy, target eligibility and fresh transactional authorization.
- Apply only actual changes, soft-delete revoked grants and restore existing pairs.
- Reuse DB audit triggers and touch the account stamp only when rights change.
- Add module/individual/All/None checkboxes, indeterminate headers, Save/Cancel,
  safe retry and confirmed state refresh to the existing User Management screen.
- Add unit, UI-handler, live audit/rollback/concurrency and regression coverage.

### Database Dependencies

Existing DBA-03 app_user/module/rights_catalogue/user_permission and audit/stamp
triggers. DBA-04 remains inherited through earlier features. No SQL migration,
seed or package changes. The catalogue must contain 36 active rights grouped
3/6/13/7/7; discrepancies fail closed for DBA review.

### Testing Notes

148 tests passed, zero failures/skips, on local migrated hopedb with live HTTP,
PostgreSQL sessions/triggers and local SMTP reset regression delivery. Covered
all ten requested scenarios, including actual audit failure and rollback,
idempotency, concurrency, and dialog selection/retry/cancel behavior. Diff/hygiene
checks passed; runtime dependency audit reported zero vulnerabilities. Graphical
browser, hosted deployment and external mailbox tests were not run.

### Security Verification

Unauthenticated 401 and User 403; Admin direct-ID privileged targets get generic
404. Active/unblocked/nondeleted targets only. Origin/JSON guards, allowlisted
payloads, parameterized SQL, fresh locked actor/target checks and atomic audited
writes. No credential/session/private profile fields are returned by rights APIs.

### Scope Confirmation

Only S1-DEV-07 relative to feat/S1-DEV-06-superadmin-controls. Existing approval,
role designation, authentication and official migrations are unchanged. The
shared transaction helper is reused without changing those operations' behavior.

### Deferred Tasks

S1-DEV-08 dashboard/sidebar/module tiles and general downstream per-action route
enforcement, plus catalogue/schema changes and unrelated business modules.

### Audit Contract / Dependencies

The user approved mapping the issue's performedBy/RIGHTS_UPDATED/details example
to existing per-right action_by/ADD-DELETE-RESTORE/old_values-new_values records.
No literal RIGHTS_UPDATED or duplicate summary audit record is inserted; changing
that database format later belongs to a separate DBA task. Stacked on open PR #52;
target feat/S1-DEV-06-superadmin-controls and retarget after the dependency lands.

## Git commands after review and publication approval

```bash
git diff --check
git status --short
git add README.md docs/S1-DEV-07.md src/users/service.js src/users/routes.js \
  src/users/rights-service.js src/users/rights-controller.js \
  public/users.js public/users.css public/rights.js views/users/index.html \
  test/rights.test.js test/rights-form.test.js test/rights-postgres.test.js \
  test/users-form.test.js
git diff --cached --check
git diff --cached --stat
git commit -m "feat(S1-DEV-07): add audited rights assignment dialog"
git push -u origin feat/S1-DEV-07-rights-dialog
# Save the PR description above to /tmp/s1-dev-07-pr.md, then:
gh pr create --base feat/S1-DEV-06-superadmin-controls \
  --head feat/S1-DEV-07-rights-dialog \
  --title '[S1-DEV-07] Rights dialog: admin/superadmin assign per-action rights by module (Customer, Product, Human Resources, Sales, Reports) with module checkbox and All/None; log every rights change in audit_log' \
  --body-file /tmp/s1-dev-07-pr.md
```
