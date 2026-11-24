Closes #78

> **Stacked PR:** Targets `feat/S2-DEV-06-product-soft-delete-restore` while PR #96 is open.
> **Draft / dependencies:** Actual PRICEHIST soft-delete/stamp support needs DBA work.
> Extra interval-overlap wording is unverified; the schema stores effective-date points.

### Summary

Implement effective-date Price History listing, add/edit, soft delete and privileged
restore inside the existing Product catalog, preserving current-price resolution.

### Changes

- Five nested Price History endpoints with existing Product access and exact
  price.add/edit/delete checks; Admin/Superadmin-only restore, no new permission.
- Real canonical dates; strictly positive NUMERIC(10,2) decimal text without JS
  floating-point rounding; duplicate composite keys rejected even when inactive.
- Transactional actor/role/grant rechecks, parent/price row locks, parameterized SQL,
  DB-owned stamps/audits and atomic rollback on incompatible trigger output.
- User active-only rows without status/stamp; privileged filters/history metadata;
  inactive Product history readable only by privileged roles and never mutable.
- Integrated accessible history dialog/forms/actions, confirmations, busy guards,
  feedback, loading/empty/retry/mobile states and current-price/list refresh.
- Extract existing Product actor-lock helper for reuse without changing its policy;
  retain every inherited Product/Customer/auth regression test.

### Database Dependencies

Existing Product/PRICEHIST schema and DBA-03/04/06 auth/audit infrastructure. No
new official SQL migrations, shared data changes, trigger disabling or invitations.

DBA-owned blockers: migration-only business is_deleted/stamp columns; sufficient
PRICEHIST stamp capacity; compatible CREATED/EDITED/DELETED/RESTORED stamp labels.
Existing audit_log ADD/EDIT/DELETE/RESTORE actions stay unchanged. Recognized trigger
contract and proposed price-specific fixture are documented in docs/S2-DEV-07.md.
The fixture proves required behavior, not shared deployment readiness. Parent
DEV-05/06 DBA dependencies remain external.

### Testing Notes

PASS final runs, Node 24.22.2 / isolated PostgreSQL 16.15, 0 failures/skips:

- Complete feasible non-PG suite: 154 tests; exact selection command in task report.
- `python3 database/tests/run_products.py`: 11 inherited Product list tests.
- `python3 database/tests/run_customers.py`: 8 Customer list tests.
- `python3 database/tests/run_price_history.py --browser` with documented external
  Playwright paths: 12 create/edit tests, 9 Product state tests, 1 live auth regression,
  12 Price History tests and six real Chromium groups.
- JavaScript syntax, whitespace and task-only scope checks.

Verified real dates, exact money bounds/scale, active/inactive duplicate conflicts,
strict action/role authorization, actor/composite-key audit attribution, rollback,
no-op silence, concurrent duplicates/transitions, history-row and sales preservation,
current-price add/edit/delete fallback/restore, future exclusion and null behavior.
Browser verifies forms/order/visibility/errors/loading/mobile and live price refresh.
Evidence and all changed files are recorded in docs/S2-DEV-07.md.

NOT VERIFIED: any Guide-only additional interval-overlap rule, actual Supabase
schema/privileges/RLS/direct Data API controls, Vercel HTTPS and Windows/Edge smoke.
No range columns/approved interval rule were found; duplicate point dates are
rejected, distinct dates remain valid. Full issue completion is not claimed.

### Scope Confirmation

Only S2-DEV-07 relative to DEV-06. No parent branch modifications, Customer CRUD,
Sales edits, inventory, new roles/rights, official DBA migration, dependency/lockfile
changes, secrets, force push or automatic merge.

### Related Tasks Deferred

S2-DEV-08 broader current-price/per-action work; DBA field/stamp and inherited
Product policy migrations; business clarification of overlap wording; external
security/deployment verification. Reassess base/history after parent PRs merge.
