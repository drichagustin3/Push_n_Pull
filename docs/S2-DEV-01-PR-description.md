## Overview

Closes #72

**Review status:** submitted for code review with explicit dependency gates, not
for unconditional deployment approval. A DBA-owned migration must make the customer
soft-delete/stamp contract reproducible on a fresh database; live Supabase Data API
security and Windows/Vercel smoke checks remain outstanding.

Implement the permission-checked customer directory at `/workspace/customer` and
`GET /api/customers`. Users see active records only; Admins/Superadmins can search
across active/inactive records, inspect metadata and use counted status filters.

## Changes Implemented

- Add modular customer route/controller, query validation, SQL service and workspace view.
- Mount the API with existing session and module authorization; replace only the
  Customer workspace shell with the list, leaving other modules unchanged.
- Add live search, Admin/Superadmin tabs/counts, role-appropriate columns, disabled
  action placeholders, loading/empty/error/retry states and safe text rendering.
- Add query, HTTP authorization, DOM and disposable PostgreSQL acceptance tests,
  an isolated test-cluster runner, and Windows/operator verification documentation.
- No new dependencies or official SQL migrations.

## Permission Enforcement

Reuse `requireModuleAccess('customer')` and the existing live account/catalogue/
permission checks. No customer.view right is invented. Existing Admin/Superadmin
operational privileges are preserved. Users need an active Customer-module grant.
User SQL explicitly filters `NOT is_deleted` regardless of a requested inactive/all
status, and projects only custno/custname/address/payterm. No status, stamp,
is_deleted or inactive counts reach User responses. Unknown role/permission query
parameters are rejected. Anonymous/unauthorized requests receive 401/403;
responses are not cached. Database failure details are not returned.

## Search and Filtering

- `search`: optional trimmed case-insensitive literal substring across customer
  number/name/address; maximum 100 characters, no controls or repeated/structured values.
- `status`: active (default), inactive, all; Users always get active results.
- Unknown/invalid query parameters: 400.
- Stable ascending custno order; no unspecified pagination or silent truncation.
- Privileged tab counts reflect all status groups matching the search. Rows/counts
  use one statement/snapshot. Empty results are valid JSON/explicit UI states.
- SQL values are parameterized; wildcard characters are escaped for literal search.

## Testing Performed

**PASS — actually executed:**

- `node --test test/customers.test.js test/customers-form.test.js`: 9 tests,
  zero failures/skips.
- Complete non-PostgreSQL `test/*.test.js` suite: 128 tests, zero failures/skips,
  including the nine customer tests above. This is the retained implementation-run
  result; focused tests and affected browser checks were rerun during the audit.
  Existing auth, registration, user/
  rights management, workspace, configuration and startup test files were included.
- `python3 database/tests/run_customers.py`: 8 reported PostgreSQL integration
  tests (parent plus seven subtests), zero failures/skips, with real login, PgStore
  sessions, module authorization and HTTP requests.
- SQL-backed tests verify genuinely empty data, all three roles, active/inactive/all,
  search across the three specified fields, search/count combinations, literal
  percent/underscore/backslash, SQL-like input, invalid/duplicate query values,
  no metadata/inactive exposure to Users, live revocation/blocking, page/assets,
  liveness and no new mutation APIs/customer-data changes from requests.
- DOM tests cover safe rendering, action visibility, counted status tabs, live
  search, stale-response suppression, permission-loss clearing, errors/retry and
  expired-session redirects. HTTP-double tests cover safe database failures.
- Ten actual headless Chromium scenarios against the isolated app/PostgreSQL:
  real form login, role views/status tabs, search/counts, empty results, denied
  access, safe text/disabled actions, loading/error/retry, mobile horizontal scroll,
  Superadmin parity, revocation and logout. Zero uncaught browser JavaScript errors.
- Visual audit detected narrow-screen letter-by-letter table wrapping; corrected
  table minimum width and header wrapping, then repeated browser verification.
- Git diff/whitespace and task-scope review.

All SQL testing used a newly created private PostgreSQL 16 cluster with TCP disabled.
Base schema definitions were copied without demo records; merged DBA-03/04/06 were
applied. Test-only customer columns match the user-verified shared schema.
Synthetic accounts/customers existed only there; cluster shutdown completed.
Final audit evidence is under `/tmp/hope-customer-browser-audit/evidence/` in the
review workspace: `customer-unit.log`, `non-postgres-suite-original.log`,
`customers-live.log`, `browser-review.log`, `browser-results.json`, screenshots
and `S2-DEV-01-final-audit.md`. Latest disposable cluster:
`/tmp/hope-customer-list-test-42nkb9ue`, stopped after verification.

**NOT RUN / Not independently verified:** Windows PostgreSQL/Edge execution,
Vercel deployment and shared Supabase HTTP/database checks.
Shared customer schema/data status was supplied by the user; shared data was not
seeded or modified. Browser evidence uses Linux headless Chromium and synthetic
fixtures; it is not presented as Windows or deployed verification.

## Acceptance Criteria

| Official Issue #72 criterion | Implementation/evidence |
| --- | --- |
| Customer List UI & Search/Filter | Workspace table, debounced search, counted privileged tabs; DOM and live PostgreSQL filter/search tests pass. |
| Permission-Checked Access | Existing authenticated Customer module guard; anonymous/no-grant/revoked/blocked and allowed requests tested. |
| Server-Side Role Enforcement | SQL-level User active restriction and metadata omission; all three role/filter combinations tested with real PostgreSQL. |

## Dependencies

- Actual `public.customer` contract: custno/custname/address/payterm/is_deleted/stamp;
  status is derived from is_deleted. Existing account/session/role/module/right/
  permission tables and startup configuration are reused.
- DBA-02 alone does not add customer is_deleted/stamp; deployment requires the
  DBA-owned business soft-delete setup already present in the verified shared
  schema supplied by the user. The full schema snapshot and reference audit SQL
  define the fields, but the configured migration path does not replay those
  artifacts. A fresh disposable database reproduced missing-column error 42703
  before adding the test-only contract fields. No official DBA migration was
  changed in this PR. Missing fields fail
  with a safe 503 rather than silently returning incorrect visibility.
- Customer schema snapshots contain broad Supabase API grants. Actual live grants/
  RLS/Data API exposure need DBA verification: Express guards cannot enforce
  authorization on a separate directly exposed database API. No security grants
  or policies were changed as part of this Developer task.
- Existing Vercel src/index.js entrypoint and src/create-app.js architecture are
  reused, not refactored. Shared deployment acceptance remains outstanding.

## Scope Confirmation

Only S2-DEV-01 is implemented. Customer Add/Edit/Delete/Restore controls are
permission-gated, explicitly disabled placeholders. Create/edit, soft delete/
restore, product/price workflows, exports, DBA changes and shared seeding remain
assigned to their separate tasks. The older sprint planning draft's bundled CRUD
scope and wireframe pay-term search do not override Issue #72.

## Review Evidence

See `docs/S2-DEV-01.md` for exact commands, assumptions and redacted evidence names.
Capture browser screenshots only with synthetic data and no credentials, cookies,
raw tokens or real customer PII. The user subsequently authorized committing,
pushing and creating this review PR. No merge, deployment, shared seeding or
permission change is authorized or performed by this publication.
