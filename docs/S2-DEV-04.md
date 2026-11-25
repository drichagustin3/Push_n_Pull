# S2-DEV-04 — Product list with search and filter

Official Issue #75. Independent branch feat/S2-DEV-04-product-list from latest
origin/main at 3157a99; PR base main. PRs #91/#92/#93 were open/unmerged when checked.
No unmerged Customer code is a runtime dependency and no Customer commits belong
in this PR. The user authorized implementation, tests, commit, push and PR, not merge,
shared schema/data/security changes or invitations.

## API and role rules

GET /api/products?search=...&status=active|inactive|all reuses sessions and
requireModuleAccess('product'). There is no product.view right. The Product module
contains product.add/edit/delete and price.add/edit/delete. An active grant to any
of these supplies User module access under the existing effective-right model.
Admin/Superadmin retain existing active-catalogue operational privileges.

- Optional search: trim, <=100 characters, no controls; case-insensitive literal
  substring matching prodcode OR description only. Percent, underscore and backslash
  are escaped as literals. No wireframe-only unit search is added.
- Status defaults active; invalid/duplicate/structured or unknown query fields ->400.
  Valid inactive/all requests from Users are overridden to active in SQL.
- User SELECT explicitly WHERE NOT p.is_deleted and does not project product status/
  stamp/is_deleted or inactive counts. Output keys: prodcode, description, unit,
  currentPrice. Privileged output adds status (active/inactive), stamp and counts.
- Privileged counts reflect search matches across all statuses; tab selection
  filters returned rows. One statement/snapshot produces rows and counts.
- Stable prodcode ascending order. No pagination was specified; no silent cap.
- Anonymous ->401; no module/revoked/blocked ->401/403 as existing auth specifies;
  database/schema errors ->503 with generic message. Responses are no-store.

Example (synthetic):

```json
{
  "products": [{"prodcode":"P00001","description":"Pump","unit":"pc","currentPrice":"2.34"}],
  "filter":{"search":"","status":"active"},
  "capabilities":{"metadata":false,"add":false,"edit":true,"delete":false,"prices":false}
}
```

## Current price contract

LEFT JOIN LATERAL selects the latest h.effdate DESC LIMIT 1 for matching prodcode,
NOT h.is_deleted and h.effdate <= CURRENT_DATE. Product deletion does not implicitly
filter its prices: authorized inactive products can retain an eligible current price.
Future/deleted tiers are excluded; older eligible tiers remain valid when newer
ones are future/deleted. No eligible price yields null, rendered as an em dash.
CURRENT_DATE is the database date, not a client-selectable date or JavaScript timezone.

unitprice NUMERIC(10,2) is cast to text BEFORE JSON aggregation. JSON and UI retain
decimal strings, including 0.10 and 99999999.99; formatting uses string grouping,
not Number/parseFloat arithmetic. SQL performs one list statement regardless of
number of rows; lateral database lookups do not create per-product network queries.

The tracked legacy column permits NULL unitprice. A selected latest row with a
NULL amount is missing pricing data and remains unavailable; the app does not
fabricate zero or silently fall back to an older amount. This behavior is tested.
A future DBA data-quality constraint/cleanup requires separate scope.

## Frontend

/workspace/product replaces only the Product shell using the existing decorated
workspace/navigation. Live search (250ms debounce), status tabs/counts, safe text,
loading/empty/error/retry, stale-response suppression, focus/visibility revalidation
and role-specific metadata are implemented. The table is horizontally scrollable
and keyboard-focusable on mobile. Prices/status labels do not split across lines.

Add/Edit/Delete/Restore/Prices are permission-gated DISABLED coming-soon controls;
Restore placeholder is privileged-only. There are no product or price-history mutation
routes or history dialog. Prices capability means at least one active price action
right; it does not invent a price.view permission or expose history records.

## Schema/deployment dependencies and read-only inspection

Tracked snapshots:
- public.product: prodcode varchar(6), description varchar(30), unit varchar(3),
  is_deleted boolean NOT NULL default false, stamp varchar(60).
- public.pricehist: effdate date + prodcode composite PK/FK, unitprice numeric(10,2)
  with positive-value check (NULL allowed), is_deleted/stamp fields.
- Actual unit values remain pc/ea/mtr/pkg/ltr; no wireframe example units are seeded.

Current ordered DBA-02/03/04/05/06 migrations do not add product/pricehist business
soft-delete columns. Snapshot/reference artifacts define them but are not wired
as automatic ordered migration replay. run_products.py verifies the migration-only
schema lacks these fields before matching snapshots ONLY in its disposable fixture.
The query requires product.is_deleted/product.stamp and pricehist.is_deleted;
pricehist.stamp is not read. No official SQL is created or modified by this PR.
A DBA-owned additive migration is needed for reproducible migration-only bootstrap.
Do not replay the full reference SQL (it contains destructive drops).

Codespaces .env selected local 127.0.0.1/hopedb, not Supabase. No remote credentials
or read-only Supabase connector were available; no live database API was queried.
Actual deployment schema/grants/RLS/TLS are NOT VERIFIED. Snapshots contain broad
anon/authenticated grants on business tables/views; inspect live Data API exposure,
view ownership/invoker behavior and policies separately. Express guards do not
protect a separately exposed Supabase REST table/view. Do not change those settings
or seed shared data from this task. /api/health is liveness, not Product readiness.

The primary key supports effective-date identity, but search/lateral performance
at production scale was not benchmarked. DBA indexing/pagination work is separate;
no EXPLAIN ANALYZE against shared data or new index is claimed here.

## Exact verification commands

PowerShell source checks (Node 24+, dependencies installed):

```powershell
node --test test/products.test.js test/products-form.test.js
$tests = Get-ChildItem .\test\*.test.js | Where-Object { $_.Name -notlike '*-postgres.test.js' } | Sort-Object Name | ForEach-Object { $_.FullName }
node --test --test-concurrency=1 $tests
npm.cmd start
curl.exe -i http://localhost:3000/api/products
```

Anonymous API expects 401. Use the actual existing login flow for authorized
browser requests; browser cookies do not automatically authenticate PowerShell.
Never paste cookies/passwords into chat or saved screenshots.

Codespaces/Linux isolated SQL runner:

```bash
python3 database/tests/run_products.py
```

Creates a new private Unix-socket PostgreSQL cluster, TCP disabled, inherited PG
credentials ignored. Copies base schema WITHOUT data, applies existing DBA-03/04/06,
adds only test fixture fields, then runs test/products-postgres.test.js with explicit
opt-in and empty-product/price/account guards. Clusters always stop in finally.
It never targets Windows hopedb, shared Supabase or real accounts/invitations.

## Executed results

- PASS: 10 focused unit/HTTP-double/DOM tests, zero failures/skips.
- PASS: 129 complete non-PostgreSQL tests on this independent branch, includes those 10.
- PASS: 11 reported live PostgreSQL tests (parent + ten subtests), zero failures/skips.
- PASS: 8 actual headless Chromium scenarios; zero uncaught JavaScript errors.
- PASS: detached compatibility checkout with the entire unmerged Customer stack
  plus this Product overlay: 150 unit/form tests; Customer list 8, forms 12, states
  11, Product 10 reported SQL tests at that checkpoint, all zero failures/skips.
  The extra nullable-amount Product case was subsequently added/tested on the
  standalone branch. Customer code was not copied into this feature branch.
- PASS: final affected Product unit/browser tests after preventing price/status
  line wrapping found during visual review. No functional Customer code changed.
- NOT VERIFIED: actual Windows/Edge, deployed Vercel/Supabase, live security/TLS.
- BLOCKED: migration-only fresh deployment until DBA soft-delete fields are supplied.

Compatibility used a disposable detached worktree at Customer head 216bec3 and
explicitly combined the two app/router integration points. It did NOT merge, commit,
push or alter any Customer branch. The checkout was removed after tests; a future
merge should retain both customer/product mounts and workspace page selections.

Evidence in review environment:
/tmp/s2-dev04-unit-tests.log
/tmp/s2-dev04-browser/evidence/combined-unit.log
/tmp/s2-dev04-browser/evidence/combined-customer-list.log
/tmp/s2-dev04-browser/evidence/combined-customer-forms.log
/tmp/s2-dev04-browser/evidence/combined-customer-states.log
/tmp/s2-dev04-browser/evidence/combined-product.log
Final Product/browser cluster and screenshots are listed in the PR description.
All clusters stopped. Browser packages/runtime files were installed only under /tmp;
no repository dependencies/lockfile or system packages changed. Initial browser
attempt could not start because its previous temporary package directory was gone;
it was an environment setup failure, not a passing browser run, and was resolved.

## Mandatory scenario matrix

All Passed entries below mean isolated verified-contract evidence, not deployed signoff.

| # | Required scenario | Classification / evidence |
| --- | --- | --- |
| 1 | Anonymous ->401 | Passed — real sessions/API |
| 2 | No Product access ->403 | Passed — real no-grant account |
| 3 | Users active only | Passed — SQL and browser |
| 4 | Admin/Superadmin all filters | Passed — both roles SQL; Admin browser |
| 5 | User status manipulation | Passed — inactive/all remain active; role spoof rejected |
| 6 | Code search | Passed — real ILIKE |
| 7 | Description search | Passed — SQL/browser |
| 8 | Case-insensitive | Passed — mixed-case probes |
| 9 | SQL-like text | Passed — bound query value/no results |
| 10 | Literal percent/underscore/backslash | Passed — dedicated fixture |
| 11 | Empty results | Passed — fresh empty table and no match |
| 12 | Dynamic counts | Passed — status/search combinations |
| 13 | Latest eligible price | Passed — same-day tier overrides historical |
| 14 | Future excluded | Passed — future-only null and future ignored |
| 15 | Deleted price excluded | Passed — deleted-only null and older fallback |
| 16 | Missing price null | Passed — absent/future/deleted-only rows, UI em dash |
| 17 | Decimal precision | Passed — 0.10/99999999.99 strings; no float formatting |
| 18 | Revocation/blocking | Passed — real account/grant changes in disposable DB |
| 19 | User metadata omitted | Passed — exact payload key assertions and hidden columns |
| 20 | Auth/Customer/dashboard regression | Passed — 129 main tests plus isolated combined 150 and Customer SQL suites |

## Official acceptance / final gates

| Issue #75 acceptance criterion | Local classification | External classification |
| --- | --- | --- |
| Product List UI & Search/Filter | Passed | Not Verified on Windows/deployed target |
| Current Price Display | Passed | Not Verified on actual shared schema/data |
| Permission-Checked Access | Passed on Express | Not Verified for live Supabase direct Data API exposure |

No local failures remain. Ready for PR code review with explicit schema/deployment
gates, not unconditional deployment or task Done. No merge, shared writes or
related Customer PR modifications are authorized/performed by publication.

Final Product SQL/browser evidence (after visual price-wrap correction):
/tmp/hope-product-list-test-5bh4q4xj/products-live.log
/tmp/hope-product-list-test-5bh4q4xj/products-browser.log
/tmp/hope-product-list-test-5bh4q4xj/migration-only-columns.log
/tmp/s2-dev04-browser/evidence/browser-results.json and synthetic screenshots:
S2-DEV-04-admin-all.png, admin-inactive.png, user-catalog.png, search.png,
empty.png, loading.png, error.png, mobile.png, forbidden.png.
