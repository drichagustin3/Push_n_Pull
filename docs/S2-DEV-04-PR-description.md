## Overview

Closes #75

Implement the Product Catalog at `/workspace/product` and `GET /api/products`,
including role-safe search/status filters, latest eligible current prices and
permission-aware disabled placeholders. **Independent PR against main**, based on
3157a99; no unmerged Customer commits. PRs #91/#92/#93 remain separate and unchanged.

Ready for code review with explicit schema/deployment gates, not unconditional
shared deployment approval. No product/history mutation functionality is included.

## Changes Implemented

- Modular Product routes/controller/validation/service/view and existing app/
  workspace integration. Reuse sessions and requireModuleAccess('product'); no
  invented product.view right or authentication/RBAC refactor.
- Optional literal substring search over prodcode/description; validated status
  active/inactive/all, stable prodcode order and correct empty results.
- SQL-level active-only User projection without status/stamp/inactive counts;
  Admin/Superadmin metadata, filters and search-scoped dynamic counts.
- One lateral SQL list query selects the latest nondeleted effdate <= CURRENT_DATE
  price, independent of product deletion. Missing prices remain null.
- NUMERIC converted to text before JSON; price formatting uses strings, preserving
  decimal precision and displaying — for unavailable amounts.
- Live search, tabs/counts, safe text, loading/empty/error/retry, stale-response
  protection, accessible horizontal table scroll and disabled action placeholders.
- Tests, disposable PostgreSQL runner and detailed acceptance/dependency report.

## Permission Enforcement

Existing Product module rights are product.add/edit/delete and price.add/edit/delete.
An active grant to any of them provides User module access under existing policy;
Admin/Superadmin keep existing active-catalogue privileges. Unknown role/right query
fields do not grant access. Anonymous ->401, no/revoked/blocked access ->401/403.
Only authorized action placeholders appear; all remain disabled/coming soon.
Restore placeholder is privileged-only; there is no new restore/view permission.
Responses use no-store and database failures return generic 503, not driver details.

## Current Price and Search Contract

- Price lookup: matching product + NOT pricehist.is_deleted + effdate<=CURRENT_DATE,
  ordered effdate DESC LIMIT 1. Future/deleted tiers cannot replace a valid older one.
- Inactive products can have an eligible price in privileged views; product and
  history soft deletion remain independent. No matching tier -> currentPrice:null.
- NUMERIC(10,2) remains a decimal JSON string, never a JSON/JavaScript floating number.
- Legacy unitprice is nullable; a selected NULL amount is unavailable, not fabricated
  zero or silently backfilled from an older row. Separate DBA quality review if needed.
- Search <=100 characters, trimmed, no controls; percent/underscore/backslash literal.
  Unknown/duplicate/structured/invalid parameters ->400. Status defaults active;
  Users requesting inactive/all still receive only active products.
- Counts cover current search across statuses. Rows/counts use one snapshot;
  no per-product network queries, unspecified pagination or silent truncation.

## Testing Performed

**PASS — actually executed:**

- `node --test test/products.test.js test/products-form.test.js`: 10 focused tests,
  zero failures/skips.
- Complete non-PostgreSQL main-branch suite: 129 passed, zero failures/skips,
  including those 10 and existing auth/dashboard/navigation/startup/config tests.
- `python3 database/tests/run_products.py`: final 11 reported tests (parent + ten
  subtests), zero failures/skips. All mandatory auth/filter/search/price/precision/
  revocation/blocking/no-mutation cases plus NULL-amount behavior tested with real
  login, PgStore and HTTP/PostgreSQL.
- Eight actual Chromium scenarios: User visibility/actions, precise/missing prices,
  Admin tabs/counts/metadata, live search, empty/loading/error/retry, mobile scroll,
  401/403, revocation and logout. Zero uncaught JS errors; synthetic screenshots.
- Isolated detached integration checkout over Customer head 216bec3 plus Product
  overlay: 150 unit/form checks and Customer list 8, forms 12, states 11, Product 10
  SQL checks at that checkpoint all passed. Checkout removed; no Customer branch
  modified. A subsequent nullable-amount test is included in final standalone 11.
- Visual review found price/status wrapping; final focused/browser tests rerun after
  preventing those labels from splitting across lines.
- Complete scope and whitespace review against main, including new files.

All SQL writes were confined to new private PostgreSQL 16 clusters with TCP disabled;
fixtures match tracked business columns and never touch shared accounts/data.
All clusters stopped. Browser dependencies remain outside Git under /tmp.

**Not Verified:** Windows/Edge, actual Supabase schema/data/grants/RLS/TLS, Vercel
deployed smoke tests and production-scale performance. No real invitations/seeds.

## Acceptance Criteria

| Official Issue #75 | Classification and evidence |
| --- | --- |
| Product List UI & Search/Filter | **Passed locally** — SQL/DOM/Chromium search/filter/count/empty behavior. **Not Verified deployed.** |
| Current Price Display | **Passed locally** — latest eligible dates, excluded future/deleted rows, historical eligibility, null display, independent deletion and decimal precision. **Not Verified on live data.** |
| Permission-Checked Access | **Passed locally on Express** — SQL User restriction, omitted metadata, real session/module guards and live revocation/blocking. **Not Verified for direct shared Data API exposure.** |

All 20 assignment scenarios are individually mapped in docs/S2-DEV-04.md.

## Dependencies and Risks

- **Blocked: migration-only fresh bootstrap.** Current ordered migrations lack
  product.is_deleted/product.stamp/pricehist.is_deleted. Snapshots/reference define
  those fields, but are not automatically applied by the migration path. The test
  runner verifies the gap before installing fixture fields. A DBA-owned additive
  migration is needed; no old migration or official SQL changed here.
- No Supabase connection available: configured Codespaces DB is local hopedb.
  Actual live schema/security not inferred from snapshots. Broad business API
  grants in snapshots require live grants/RLS/view/exposed-schema review before
  deployment; Express module guards do not secure a separate direct Data API.
- No pagination/load benchmark claimed; database index tuning is a separate DBA
  task. Large datasets may require a separately agreed API/performance design.
- Future integration of Customer PRs must retain both routers and page selections
  in the two shared integration files. The isolated combined tests validate that
  wiring, without requiring Customer commits as a dependency of this PR.

## Scope Confirmation

Only DEV-04. No Customer CRUD, Product create/edit/delete/restore, price-history
mutation/dialog, new rights, account/provisioning changes, schema/grant migration,
shared seeding, force-push, parent PR changes or automatic merge.


## Review Evidence

Commands, all 20 scenario classifications, fields and exact outstanding gates:
`docs/S2-DEV-04.md`. Logs: `/tmp/s2-dev04-unit-tests.log`,
`/tmp/hope-product-list-test-5bh4q4xj/products-live.log`,
`/tmp/hope-product-list-test-5bh4q4xj/products-browser.log` and
`/tmp/s2-dev04-browser/evidence/` (combined regression logs, browser JSON and screenshots).
No real customer/product PII, session headers, credentials or browser traces are
included in screenshots. Windows and deployed acceptance remain Not Verified.
