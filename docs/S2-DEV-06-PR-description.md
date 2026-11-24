Closes #77

> **Stacked PR:** Targets `feat/S2-DEV-05-product-create-edit` while PR #95 is open.
> **Draft / deployment blocked:** Existing stamp labels and the active-child deletion
> policy need DBA review. Proposed isolated fixtures do not establish shared readiness.

### Summary

Add permission-protected Product soft deletion and privileged restoration, retaining
physical Product rows, historical references and the inherited Product catalog/forms.

### Changes

- DELETE /api/products/:prodCode with product.delete; PUT /api/products/:prodCode/restore
  restricted to Admin/Superadmin, with transaction-time actor/role/grant rechecks.
- Reuse pooled transactions, parameterized SQL, row locking and transaction-local
  authenticated audit context. DB triggers own stamps/audits; wrong output rolls back.
- Preserve dependency guards and serialize child writers during delete. Existing
  active-child prohibition returns safe 409; missing guard/schema/stamps fail closed.
- Confirmation, duplicate-click protection, role-aware actions, success/failure
  feedback and list/count refresh retaining search/status/current-price behavior.
- Isolated SQL/HTTP/DOM/browser tests and precise DBA handoff/acceptance matrix.

### Database Dependencies

Inherited DBA-03/04/06 auth/audit infrastructure and Product/Price History/Sales Detail
schema. No official migrations, shared schema changes, trigger disabling or data seeding.

Required DBA work: reproducible business soft-delete/stamp migration, sufficient stamp
capacity, and product-specific DELETED/RESTORED labels. Existing audit_log DELETE/RESTORE
actions stay unchanged. Current trg_check_children blocks products with active prices
or sales details; a reviewed DBA/business decision is required to reconcile this with
Issue #77 historical-record preservation. Runtime does not bypass that rule.

Parent DEV-05 profile/CREATED/EDITED dependencies remain in PR #95. State-only operations
do not unnecessarily depend on widening profile description/unit columns.

### Testing Notes

PASS, final runs with 0 failures/skips on disposable PostgreSQL 16.15 / Node 24.22.2:

- Complete non-PostgreSQL suite: 148 tests. Exact file-selection command in task report.
- `python3 database/tests/run_products.py`: 11 inherited Product list checks.
- `python3 database/tests/run_customers.py`: 8 Customer list checks.
- `python3 database/tests/run_product_states.py --browser` with external Playwright:
  12 inherited create/edit tests, 1 live auth regression, 9 state tests and six browser
  groups. Without --browser the same runner executes all SQL/HTTP/auth checks.
- JavaScript syntax, whitespace, and task-only diff review.

Verified original child-guard rejection, incompatible-stamp rollback, exact permissions,
User restore denial, Admin/Superadmin restore, missing/repeated/concurrent transitions,
actor and before/after audit records, PK preservation, byte-identical Price History and
sales-detail rows, retained current prices, list visibility/counts and browser behavior.
Successful history-bearing transitions use an explicitly proposed fixture-only policy,
not a deployed or silently approved trigger change. No real user credentials are used.

NOT VERIFIED: actual shared Supabase schema/privileges/RLS/direct Data API exposure,
Vercel HTTPS smoke, Windows/Edge. No shared or production database was changed.
Full results, evidence paths, changed files and acceptance classifications:
`docs/S2-DEV-06.md`.

### Scope Confirmation

Only S2-DEV-06 relative to DEV-05. Parent Product list/create/edit and Customer/auth
regressions retained; no Customer implementation changes, official DBA migration,
secrets, dependency changes, invitations, force pushes or automatic merges.

### Related Tasks Deferred

S2-DEV-07 Price History mutations; S2-DEV-08 current-price expansion. DBA policy/stamp
changes and external security/deployment checks remain separate. Keep this PR draft
until dependencies are resolved; reassess its base after verified parent merges.
