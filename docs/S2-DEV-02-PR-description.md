## Overview

Closes #73

**Draft stacked PR — DBA contract dependency unresolved.** Targets
`feat/S2-DEV-01-customer-list` while parent PR #91 remains open/unmerged. Contains
only DEV-02 changes relative to that parent. Do not merge either PR automatically.

Implement customer create/edit forms and POST/PUT endpoints while retaining the
literal Issue #73 contract. Successful database/browser tests use a clearly named
isolated TARGET-CONTRACT fixture. **Shared Supabase compatibility is NOT established;
the documented current schema intentionally rejects writes safely with 503.**

## Changes Implemented

- POST /api/customers and PUT /api/customers/:custNo; camelCase request fields,
  required immutable number, required name <=100, optional address <=50 and the
  five required payment labels; safe 400/404/409 responses.
- Exact-action RBAC, same-origin JSON/HTTPS guards, authenticated account and
  effective-right rechecks under transaction locks, parameterized SQL and local
  authenticated actor context on the mutation client.
- DB-owned audit/stamp preflight and rollback if schema, audit coverage, payment
  constraints or CREATED/EDITED stamp behavior are incompatible. Never silently
  truncate names, relabel unsupported terms, bypass triggers or duplicate audits.
- Native create/edit dialogs, editable profile fields, immutable number, clear
  validation/conflict/dependency errors, duplicate-submit prevention and list refresh.
- Delete/Restore remain disabled; no DEV-03 or unrelated functionality.
- Unit/DOM/real HTTP/PostgreSQL tests and a fresh disposable test runner.

## Schema Discrepancies and DBA Dependencies

The user explicitly retained Issue #73, rather than approving the legacy limits:

| Requirement | Existing contract | Required DBA-owned change |
| --- | --- | --- |
| 100-character names | custname varchar(20) | Widen to varchar(100) or text. |
| Net 15/Prepaid plus existing terms | pay_ck permits only COD/30D/45D | Review proposed codes 15D/PRE and extend CHECK, preserving existing codes/data. API labels remain COD/Net 15/Net 30/Net 45/Prepaid. |
| CREATED/EDITED full-actor stamps | generic trigger forces ADD/EDIT; varchar(60) | Compatible customer-only stamp trigger, full-identity storage (text preferred), preserving no-op and future DELETE/RESTORE semantics. |

No current ordered migration resolves these discrepancies. audit_stamp(text) can
format the required label, but the existing stamp trigger overrides it with ADD/EDIT.
Snapshot/reference SQL is not a safe automatic migration substitute. Parent PR #91
also documents missing migration-defined business soft-delete fields and unresolved
live Supabase Data API/RLS security. Those dependencies remain open.

The 15D/PRE adapter is a proposed DBA storage contract exercised only in isolated
tests, not a claim those values exist today. The exact handoff, dependent-view,
privilege and audit requirements are in docs/S2-DEV-02.md. No official migration,
shared schema/data/grants, old audit history or account security state changed.

## Permission Enforcement and Auditing

Existing customer.add/customer.edit guards and privileged Admin/Superadmin behavior
are reused. Actor, version, active role/module/catalogue/grant are revalidated in
the same transaction; only the authenticated database email reaches app.username.
The DB writer produces one ADD/EDIT audit row with the correct record, actor,
timestamp and old/new values. No-op saves do not add history. Failures roll back
both customer and audit changes. User responses omit metadata as in the parent.

## Testing Performed

**PASS — actually executed:**

- `node --test test/customer-write.test.js test/customer-editor-form.test.js test/customers.test.js test/customers-form.test.js`: 17 passed, zero failures/skips.
- Complete non-PostgreSQL suite: 136 passed, zero failures/skips (includes those 17).
- `python3 database/tests/run_customers.py`: inherited list regression, 8 reported
  tests (parent + seven subtests), zero failures/skips.
- `python3 database/tests/run_customer_forms.py`: 12 reported tests (parent + eleven
  subtests), zero failures/skips, using a pool of one connection for actor isolation.
  Current-schema 503/no-change behavior, exact target name/payment contract,
  authenticated audit old/new/timestamp, duplicates/invalid inputs, no-op, archived
  edit denial, SQL-like text, long actor/stamp, audit insertion failure rollback,
  simulated missing coverage, incorrect stamp rollback, revoked/blocked actors.
- Eight real headless Chromium scenarios: actual login, create/native required
  validation, 100-character name/Net 15, duplicates, edit/Prepaid and actor audit,
  role-specific controls, mobile modal, safe dependency errors and forbidden access.
  Zero uncaught JS errors; screenshots use synthetic data only.
- Scope/whitespace review against the parent; no official SQL, secrets or dependencies.

**NOT RUN / BLOCKED:** shared Supabase schema/API/grants/RLS/TLS, Windows/Edge,
Vercel deployed smoke tests and actual-target acceptance. The current documented
schema is not compatible; passing target-fixture tests do not resolve that blocker.

Evidence: `/tmp/s2-dev02-unit-tests.log`;
`/tmp/hope-customer-list-test-m5pfgrbz/customers-live.log` (parent list);
`/tmp/hope-customer-list-test-4hmej5dn/customers-live.log` (final write suite);
`/tmp/hope-customer-list-test-2pwxzdqg/forms-browser.log` and
`/tmp/s2-dev02-browser/evidence/` (browser JSON/screenshots). All clusters stopped.
All database writes and schema simulations ran only in fresh disposable local
PostgreSQL clusters; no shared connection, customer seeding or real invites.

## Acceptance Criteria

| Issue #73 acceptance criterion | Evidence / status |
| --- | --- |
| Customer Forms & Validation | Implemented; focused unit/DOM and real browser checks pass against the target fixture. Shared acceptance remains dependent on the DBA contract. |
| Backend Endpoints & Database Operations | POST/PUT tested for exact contract including CREATED/EDITED; existing-schema rejection verified. **BLOCKED for actual shared schema until DBA migration.** |
| Permission & Audit Verification | Real login/session/exact rights, correct ADD/EDIT records, before/after values, rollback/no-op and actor context tested in isolated PostgreSQL. **Shared verification NOT RUN.** |

## Scope Confirmation

One task, one stacked branch, one PR. Parent list implementation and regression
coverage retained. Only its obsolete assertion that POST is unimplemented changes;
list restrictions and unsupported collection PUT/DELETE checks remain. No official
DBA migration, delete/restore API, product, registration or account-management change.

## Remaining Verification and Deployment Gates

- DBA-approved schema/storage/stamp migration and fresh/shared schema verification.
- Actual Supabase grants/RLS/Data API/runtime-role and TLS inspection.
- Windows/Edge and deployed Vercel HTTPS/session/CSP/asset smoke tests.
- Review of the parent #91 and later safe base update after its real merge.

No shared provisioning or schema/data changes, real invitation generation, force
push, automatic merge, issue edits or unsupported acceptance claims were performed.
