Closes #76

> **Stacked PR:** Targets `feat/S2-DEV-04-product-list` while PR #94 remains open.
> **Draft / DBA dependency:** Issue #76 remains the acceptance contract. Current
> legacy schema cannot support it; writes fail closed pending an additive DBA migration.

### Summary

Implement Product create/edit APIs and forms while retaining the existing catalog,
search/status filters, authorization and current-price behavior.

### Changes

- POST /api/products and PUT /api/products/:prodCode with exact product.add/edit guards,
  transaction-time actor/grant rechecks, parameterized SQL and same-origin JSON checks.
- Required code/description/unit validation, immutable codes, inactive-target 404,
  duplicate 400 per issue, safe failures and Product-only malformed JSON handling.
- Accessible Add/Edit dialog, action visibility, pending submission protection,
  inline feedback, and list refresh retaining search/status.
- DB-owned stamps/audits with transaction-local authenticated actor, trigger/schema
  preflight and atomic rollback if CREATED/EDITED stamp output is incompatible.
- Unit/DOM, isolated PostgreSQL and optional browser verification; DBA handoff and
  acceptance/evidence matrix in docs/S2-DEV-05.md.

### Database Dependencies

Existing DBA-03/04/06 auth/audit infrastructure and Product/Price History tables.
No official migration or shared schema/data changes in this PR.

DBA-owned blockers: migration-only baseline lacks business soft-delete/stamp
columns; snapshot description varchar(30) must support 100; unit varchar(3)/unit_ck
must support approved exact pcs/can/pair/meter values alongside legacy pc/ea/mtr/pkg/ltr;
stamp varchar(60) and ADD/EDIT labels must support full actor CREATED/EDITED stamps.
The proposed finite unit catalogue requires DBA/business approval. No translation,
truncation or unsupported pricing mutation is introduced. Existing audit_log
ADD/EDIT actions remain; required CREATED/EDITED labels refer to product stamps.
See the precise trigger/column contract and deployment handoff in the task document.

### Testing Notes

PASS (Node 24.22.2 / disposable PostgreSQL 16.15, 0 failures/skips in final runs):
- Full non-PostgreSQL suite: 145 tests (`node --test --test-concurrency=1` excluding
  *-postgres.test.js; exact reproducible file-selection command in task document).
- `python3 database/tests/run_product_writes.py --browser`: 12 write tests,
  1 existing live auth regression, and six Chromium browser groups. Optional browser
  dependency paths/commands documented; no repository dependency added.
- `python3 database/tests/run_products.py`: 11 inherited Product list tests.
- `python3 database/tests/run_customers.py`: 8 Customer list tests.
- JS syntax, whitespace and task-scope review.

Verified legacy-schema rejection and proposed-contract creation/editing; exact
rights, anonymous/unauthorized/malformed inputs; duplicate/missing/inactive targets;
100-character descriptions/units; authenticated actor stamps/audits; no-op silence;
rollback; blocked/revoked users; untouched prices; browser validation/edit/refresh,
search retention, duplicate feedback, sanitized failure, mobile and edit-only controls.
Screenshots/log paths and corrected test-fixture failures are documented in the task report.

NOT RUN / NOT VERIFIED: Windows/Edge, deployed Vercel, actual shared Supabase
schema/privileges/RLS/direct Data API exposure and smoke tests. Proposed-contract
fixtures do not prove shared schema compatibility. No shared data seeded or changed.
Tracked broad business-table grants need separate security-owner verification.

### Scope Confirmation

Only S2-DEV-05 additions relative to the parent. Existing Customer/Product list
routing and authentication behavior retained. No official DBA migrations, secrets,
shared database mutations, invitations or automatic merges.

### Related Tasks Deferred

S2-DEV-06 delete/restore; S2-DEV-07 price-history mutations; S2-DEV-08 current-price
expansion. DBA schema/stamp/unit approval and deployment security remain external.
Do not mark Issue #76 fully complete until those blockers and deployed verification
are resolved. Retarget to main only after verifying the actual #94 merge/history.
