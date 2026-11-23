## Overview

Closes #74

**Draft stacked PR:** targets `feat/S2-DEV-02-customer-create-edit` (parent #92),
which targets DEV-01 #91. Neither parent is modified or automatically merged.
Only DEV-03 changes appear relative to the DEV-02 parent.

Implement customer soft delete and privileged restore while preserving profiles,
history, RBAC and existing create/edit/list behavior. **Actual shared acceptance
remains DBA-blocked.** Passing tests use explicitly isolated target-contract
fixtures; this PR does not claim the current shared database is compatible.

## Changes Implemented

- DELETE /api/customers/:custNo -> UPDATE is_deleted=true, never hard deletion.
- PUT /api/customers/:custNo/restore -> UPDATE is_deleted=false, Admin/Superadmin-only
  at both route and transaction layers. Standard Users cannot restore even with
  customer.delete.
- Reuse existing mutation service, actor/version/role/grant checks and locks, same-
  origin/HTTPS checks, parameterized queries and transaction-local authenticated actor.
- Row locking/current-state checks: missing ->404, invalid transition ->400;
  active sales prevent deletion ->409; unauthorized ->401/403.
- Retain the enabled database child guard, wait for in-flight sales writers using
  a short SHARE table lock, check active dependencies before updating the customer.
- Validate DB-owned DELETED/RESTORED actor stamps; incompatible schema/coverage or
  audit failures roll back state, stamp and audit. No duplicate manual audit writer.
- Permission-based Delete/Restore controls, confirmation/cancel, duplicate-click
  prevention, safe feedback and list/count refresh. Restore hidden from Users.
- New state unit/DOM/SQL/HTTP tests, isolated runner and exact DBA dependency notes.

## Permission Enforcement and Data Preservation

Existing customer.delete/privileged-role policy is reused, no new right or status
column. Actor authority is rechecked under lock; client state/stamp/actor/profile
injection is rejected. User deletion acknowledgements contain only customer number
and the resulting operation status; inactive profile/stamp and list metadata remain
restricted. No related sales data or customer identity/profile fields are modified.

## Database and Audit Dependencies

The documented existing trigger writes DELETE/RESTORE stamps, whereas Issue #74
requires DELETED/RESTORED. stamp varchar(60) also cannot safely hold all full actor
identities. Current migrations do not resolve that behavior or fully reproduce
business soft-delete setup. Required DBA-owned additive migration must preserve
history/FKs/guards, supply sufficient stamp storage, and provide customer-specific
DELETED/RESTORED alongside the parent's CREATED/EDITED/no-op behavior. Keep the
compatible DELETE/RESTORE audit_log actions and exactly one enabled audit writer.

DEV-03 does not require unrelated name/payment widening just for a state change;
its state fixture retains varchar(20). Parent #92 dependencies remain separately
open for create/edit. See docs/S2-DEV-03.md for the exact handoff.

No official SQL migration, shared schema/data/grant, existing audit writer or
parent PR branch was changed. Actual Supabase grants/RLS/Data API/TLS and runtime
privileges remain unverified. Runtime needs appropriate sales SELECT/LOCK access;
the coarse table lock is a deliberate short-transaction safety tradeoff.
Future sales insertion must independently reject inactive parents after this state
transaction commits; this task does not implement future Sales APIs/invariants.

## Testing Performed

**PASS — actually executed, zero failures/skips:**

- `node --test test/customer-state.test.js`: four new validation/confirmation/error/
  duplicate-click UI tests (included in the complete suite below).
- Complete non-PostgreSQL suite: 140 tests, including inherited DEV-01/02 tests.
- `python3 database/tests/run_customers.py`: 8 reported parent list SQL/HTTP tests.
- `python3 database/tests/run_customer_forms.py`: 12 reported parent write/audit tests.
- `python3 database/tests/run_customer_states.py`: 11 reported state SQL/HTTP tests
  (parent plus ten subtests): legacy schema/stamp rejection without changes, roles,
  401/403/404/400, safe malformed IDs, row/history/FK preservation, correct stamps,
  authenticated DELETE/RESTORE audit before/after/time, filtered lists/counts,
  active/inactive child handling, in-flight sales writer serialization, missing
  child guard failure, concurrent duplicate transitions, audit rollback and
  revoked/blocked actors.
- Seven actual headless Chromium scenarios: real login, enabled Delete/cancel,
  confirmed User deletion and metadata restrictions, Admin Inactive/Restore,
  restoration counts/User visibility, safe active-child conflict, parent create/
  edit regression, denied access and logout. Zero uncaught JS errors.
- Complete diff/scope/whitespace review against DEV-02 parent.

All SQL writes/schema simulations used fresh disposable PostgreSQL 16 clusters;
TCP disabled, no inherited shared credentials, no invites. Existing audit writers
were not disabled. Browser screenshots contain only synthetic data. Clusters stopped.
Logs and screenshots are listed in docs/S2-DEV-03.md.

**NOT RUN:** Windows/Edge, live shared Supabase database/API/security inspection,
Vercel deployment smoke tests. **BLOCKED:** actual-target state/audit acceptance
until the DBA dependency is resolved. Existing-schema 503 and target-fixture PASS
are deliberately reported separately.

## Acceptance Criteria

| Official #74 criterion | Implementation/evidence | Remaining gate |
| --- | --- | --- |
| Soft Delete Logic | State-only UPDATE, DELETED actor stamp, one audit, history retained; SQL/browser checks pass. | Actual DB stamp/storage/guard contract. |
| Active View Filtering | Existing User active-only query retained; Admin inactive/all and counts refresh, browser verified. | Shared deployed/security smoke. |
| Account Restoration | Strict privileged role check twice; RESTORED/audit and 404/400/concurrency tests pass. | Actual DB stamp/storage contract. |

## Scope Confirmation

Only S2-DEV-03. Parent source history and tests retained; no create/edit redesign,
product, sales workflow, DBA migration, account/provisioning or unrelated task work.
No merge, force push, shared changes or unsupported completion claim.
