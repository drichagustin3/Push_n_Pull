# S2-DEV-03 — Customer soft delete and restore

Issue #74. Branch feat/S2-DEV-03-customer-soft-delete-restore, stacked on
feat/S2-DEV-02-customer-create-edit at 23d98a4. PR #91 and #92 were verified open
and unmerged before work. The user authorized commit, push and a separate stacked
PR, not merge, force-push, shared schema/data changes or invitations.

## Contract

DELETE /api/customers/:custNo requires the existing customer.delete right (with
existing active-catalogue privileged-role behavior). PUT /api/customers/:custNo/restore
requires Admin/Superadmin at the route AND under the mutation transaction's actor
lock; Users cannot restore even if granted customer.delete. Both use the existing
customer mutation service rather than duplicate services/route registrations.

- Schema mapping: inactive is is_deleted=true; active is false. No status column.
- Same-origin and configured HTTPS checks remain required. JSON empty object or
  a bodyless request is accepted; injected status/stamp/actor/profile fields fail 400.
- Valid identifiers use the existing <=5-character, no-control validation. Missing
  route identifiers are 404; malformed encoded identifiers return safe 400.
- Missing customer ->404. Deleting inactive/restoring active ->400. Existing active
  sales prevent deletion ->409. Unauthenticated ->401, unauthorized ->403.
- Success ->200 with top-level status (active/inactive). Privileged responses retain
  normal permitted metadata; User deletion acknowledgement includes only customer
  number and the operation's resulting status, not the inactive profile or stamp.
  User GET/list metadata remains unchanged and inactive rows remain excluded in SQL.
- The application never hard-deletes a customer. It updates only is_deleted and lets
  database triggers manage stamp/audit. Existing identity/profile/history/FKs remain.

## Transactions, audit and concurrency

Reuse the parent's authenticated actor/session version/role/catalogue/grant checks
and locks. Set app.username transaction-locally on the same mutation client. Never
accept an actor from the browser or duplicate trigger audit entries.

Every state change locks the customer FOR UPDATE and checks its current state.
Concurrent identical requests serialize: one success, then one 400, with one audit
event. A failed audit insertion or incompatible returned stamp rolls back state,
stamp and audit together. Existing rows/history are not erased.

For deletion, require the existing enabled unconditional customer_bu_check trigger
(public.trg_check_children, BEFORE UPDATE ROW). Lock public.sales IN SHARE MODE
BEFORE locking the customer, then check active dependencies. This waits for in-flight
sales writers before taking the dependency-check snapshot, and prevents concurrent
sales writes during the short state transaction. The original child guard remains
enabled and executes too. No child records are modified by the application.

This serializes checks against existing/in-flight sales transactions, not all
future writes after the transaction commits. A future Sales API/DBA invariant must
independently reject new active sales against inactive customers. This task does
not implement Sprint 4 or claim privileged direct SQL cannot violate that rule.
The table lock is intentionally coarse; tune in a separately reviewed design if
sales write throughput becomes a concern. Runtime role needs appropriate sales
SELECT/LOCK privileges and visibility of the relevant rows.

## UI

Extend the existing list with an independently loaded customer-state.js enhancement.
Delete is enabled only when the effective right is present; Restore additionally
requires privileged metadata visibility. Native confirmation is mandatory, and
cancel sends nothing. A per-customer pending set prevents duplicate clicks. Success
refreshes rows/counts and announces the change. 400/403/404 refresh stale rows; 409
reports the active-child conflict without revealing related records; dependency/
network failures do not expose driver diagnostics. Users never receive Restore.
Create/edit dialogs remain functional. Parent tests/source history are preserved.

## DBA dependency — NOT resolved by this Developer PR

The existing snapshots/reference define:
- customer.is_deleted, stamp varchar(60), legacy customer_biu_stamp -> trg_set_stamp.
- trg_set_stamp uses DELETE/RESTORE, not Issue #74's DELETED/RESTORED.
- customer_aiu_audit -> trg_audit_log('custno') uses compatible DELETE/RESTORE audit
  actions, and records actor, time, old/new values.
- customer_bu_check -> trg_check_children checks sales.is_deleted.

No current ordered migration supplies the required customer-specific DELETED/
RESTORED behavior, and the parent already documents missing migration-defined
business soft-delete/stamp infrastructure. The full reference contains destructive
DROP statements; do not replay it to solve this dependency.

Required DBA-owned additive migration (review independently):
1. Preserve existing data/FKs/history; ensure reproducible customer and sales
   soft-delete fields and required enabled business/audit guards.
2. Provide enough stamp storage for the FULL actor and timestamp: text preferred
   (or >=284 characters). Never truncate authenticated actor identity.
3. Set customer-only DELETED/RESTORED on actual state transitions, preserving
   CREATED/EDITED behavior required by parent DEV-02 and no-op preservation.
4. Preserve the DELETE/RESTORE audit_log vocabulary, actor, old/new snapshots and
   transactional consistency. Exactly one unconditional known audit writer remains.
5. Preserve customer_bu_check, enabled stamp trigger and FK/dependency behavior,
   and account for dependent views/grants/RLS when changing columns/functions.
6. Complete the parent's name/payment-term requirements separately; DEV-03 state
   changes do NOT unnecessarily require custname widening to 100. The state SQL
   test intentionally retains varchar(20) to prove that separation.

Until compatible stamp/storage/guard behavior exists, operations fail safely with
503; no partial state/audit is committed. Current-schema rejection is tested, not
misrepresented as shared successful deletion/restoration. No official SQL,
Supabase schema/data/grants, old migration or existing audit writer was changed.

## Tests and evidence

PowerShell source/unit/form regression:

```powershell
node --test test/customer-state.test.js
$tests = Get-ChildItem .\test\*.test.js | Where-Object { $_.Name -notlike '*-postgres.test.js' } | Sort-Object Name | ForEach-Object { $_.FullName }
node --test --test-concurrency=1 $tests
```

Codespaces/Linux only (fresh private clusters, TCP disabled, inherited PG settings
ignored; never target shared/Windows existing hopedb):

```bash
python3 database/tests/run_customers.py
python3 database/tests/run_customer_forms.py
python3 database/tests/run_customer_states.py
```

The state runner copies existing schema/function definitions into a new empty
cluster, matches only fixture fields, and tests legacy safe rejection BEFORE
installing the isolated target stamp function. It never supplies an official DBA
migration or disables an audit writer. A missing child-guard catalog result is
simulated through a test adapter, leaving the real trigger enabled. An additional
fixture-only audit-failure trigger proves rollback and is then removed.

Actual results:
- PASS: 140 unit/form tests, 0 failures/skips (includes four new state tests).
- PASS: parent list SQL/HTTP suite, 8 reported tests, 0 failures/skips.
- PASS: parent create/edit SQL/HTTP suite, 12 reported tests, 0 failures/skips.
- PASS: state SQL/HTTP suite, 11 reported tests (parent + ten subtests), 0 failures/skips.
- PASS: 7 headless Chromium scenarios, zero uncaught JS errors, real test-account
  login and synthetic target-contract data only. Parent create/edit browser regression
  also exercised after enabling all proposed parent fixture fields/terms locally.
- NOT RUN: Windows/Edge, deployed Vercel/Supabase, live grants/RLS/TLS verification.
- BLOCKED: actual shared acceptance until required DBA contract is approved/applied.

Evidence paths in the review workspace:
/tmp/s2-dev03-unit-tests.log
/tmp/hope-customer-list-test-9g_dom98/customers-live.log (parent list)
/tmp/hope-customer-list-test-9u7iybin/customers-live.log (parent forms)
/tmp/hope-customer-list-test-6svfw1yc/customers-live.log (state)
/tmp/hope-customer-list-test-6svfw1yc/states-browser.log
/tmp/s2-dev03-browser/evidence/browser-results.json and synthetic screenshots:
S2-DEV-03-user-before-delete, user-after-delete, admin-inactive, restored,
child-conflict, parent-regression, forbidden (.png). All clusters stopped.

## Acceptance criteria

| Issue #74 | Isolated evidence | Actual-target status |
| --- | --- | --- |
| Soft Delete Logic | Row/profile/history retained; DELETED actor stamp; one DELETE audit; invalid/repeated/concurrent/rollback cases pass. | DBA stamp/storage/guard dependency BLOCKED. |
| Active View Filtering | User active-only SQL/search, Admin inactive/all and counts before/after tested; browser verifies User row removal. | Shared smoke/security verification NOT RUN. |
| Account Restoration | Admin/Superadmin only, direct-service User denial, RESTORED/audit, missing/repeated states and counts pass. | DBA stamp/storage dependency BLOCKED. |

Open as a draft stacked review PR. Do not mark complete or merge while external
acceptance is blocked. Shared Data API grants/RLS risk from parents remains open:
Express checks do not secure a separately exposed Supabase table/view API.
