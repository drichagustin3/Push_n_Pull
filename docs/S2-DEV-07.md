# S2-DEV-07 — Price history: add, edit and delete price with effective date

## Git, PR & Scope Discipline (Strict — Non-Negotiable)

Issue #78; head `feat/S2-DEV-07-price-history`, base
`feat/S2-DEV-06-product-soft-delete-restore`. Created from verified remote parent
`7ab8deafc124ab105d687b06d43b652ea13329c2` while PRs #94, #95 and #96 were open.
No parent PR/branch, Customer branch, official migration or shared data is modified.
Only this branch is committed/pushed; no force push, merge, deployment, invitation
or real account provisioning is performed. Reassess stack history/diff after actual
parent merges before retargeting to main.

Exact changed files relative to DEV-06:

- `src/products/price-validation.js`: canonical dates, exact decimal text and payload/filter rules.
- `src/products/price-service.js`: one-snapshot history listing and transactional audited mutations.
- `src/products/price-controller.js`: request validation and response status composition.
- `src/products/routes.js`: five price routes using existing session/RBAC/write guards.
- `src/products/mutations.js`: extract existing actor-lock logic unchanged into a shared helper.
- `src/products/view.js`: integrated accessible Price History dialog and forms.
- `public/price-history.js`: history/filter/forms/actions/submission/error/refresh lifecycle.
- `public/products.js`: enable existing Prices action; preserve other Product actions.
- `public/products.css`: responsive history modal/table using existing design tokens.
- `test/price-validation.test.js`, `test/price-service.test.js`: input and projection/failure coverage.
- `test/price-history-postgres.test.js`: live SQL/HTTP acceptance and rollback/concurrency checks.
- `database/tests/run_price_history.py`: fresh private cluster, parent/auth regressions and optional browser.
- `database/tests/price_history_browser.cjs`: real local Chromium evidence.
- `docs/S2-DEV-07.md`, `docs/S2-DEV-07-PR-description.md`: contracts, blockers and evidence.

No parent test is removed or weakened. No dependency/lockfile, SQL migration, .env,
node_modules, AI folder, private proof, browser download or generated fixture output
is committed.

## Task-Specific Requirements

### API contract and access

All routes are below `/api/products/:prodCode/prices` and reuse existing sessions,
no-store responses, blocked/session-version checks and the Product RBAC catalogue.

| Method/suffix | Guard | Payload / result |
| --- | --- | --- |
| GET collection | Existing Product-module access; no invented price.view | Optional status=active/inactive/all; default active. DESC history and capabilities. |
| POST collection | price.add | `{effDate, unitPrice}`; 201 |
| PUT /:effDate | price.edit | `{unitPrice}`; 200, key immutable |
| DELETE /:effDate | price.delete | Empty body or `{}`; 200, is_deleted=true |
| PUT /:effDate/restore | Admin/Superadmin only | `{}`; 200, is_deleted=false; no price.restore right |

Admin/Superadmin retain existing active-catalogue operational rights. Restore also
rechecks privileged role under lock and existing price.delete catalogue eligibility.
Any existing Product-module grant can read history; the UI Prices entry follows the
inherited price-action capability policy. There is no separate history-view right.

Return shape: `{product:{prodcode,description},prices:[{effDate,unitPrice}],filter,
capabilities}`; privileged rows add lowercase status and stamp. SQL filters User
history to active rows before projection; inactive parent products are 404 for Users.
Admin/Superadmin may read inactive-parent history, with all mutation capabilities
false. GET uses one product/history statement and casts DATE/NUMERIC to text BEFORE
JSON aggregation; no host timezone or JS Number coercion occurs. Legacy nullable
amounts stay null, not fabricated zero.

Mutation success returns `{price:{effDate,unitPrice,...privilegedMetadata}}`; User
soft deletion confirms only effDate, avoiding an inactive profile response. State
and stamp are DB-owned; no physical status column, hard deletion or manual audit
INSERT is introduced. Product keys, price composite keys and sales data are retained.

Missing parent/record 404; inactive User targets 404; privileged inactive parent
mutation 409; privileged edit of inactive price 409; repeat privileged delete/restore
400 (existing state convention). Duplicate `(prodcode,effdate)` is 409 INCLUDING an
inactive conflicting row, which is never silently reused. Anonymous 401; denied or
blocked/revoked 401/403 as existing auth specifies. Safe validation 400, media 415,
large JSON 413 and DB/schema/audit errors 503. Origin/production HTTPS/JSON rules and
Product-only parser error handling remain inherited. No payload/query role, stamp,
status, date replacement or other unknown fields are accepted.

### Effective-date and money rules

- Exact real Gregorian YYYY-MM-DD, years 0001–9999; impossible dates, time components,
  noncanonical formatting and PostgreSQL infinity rejected. Historical/future dates
  are allowed, including leap days when valid.
- unitPrice is a decimal STRING, not JSON Number: strictly positive <=99999999.99,
  <=2 decimal places; normalize e.g. `1.2` to `1.20`. Regex and integer BigInt cents
  verify positivity without rounding; PostgreSQL receives the validated decimal text.
  Negative/zero, exponent, whitespace, excessive precision, overflow and malformed
  values fail. No scientific notation, unsafe Number conversion or silent rounding.
- Existing current-price SQL is unchanged: latest active effdate <=CURRENT_DATE;
  future/deleted entries excluded; no eligible price ->null. Every successful price
  mutation refreshes the Product List while preserving its search/status selection.
- Overlap wording: actual PRICEHIST stores points, not start/end intervals. Its PK
  `(effdate,prodcode)` gives one price per point; adjacent dates are valid and each
  later eligible date supersedes earlier ones. No distinct approved range-overlap
  rule was found in tracked schema/docs. Student Guide PDF was not available in the
  workspace/attachments; its additional wording is NOT VERIFIED. Do not claim a
  separate interval-overlap criterion passed. Business clarification remains pending
  if Issue #78 intends something beyond duplicate effective-date rejection.

### Transactions, locks and auditing

Existing actor/account/role/module/catalogue/grant recheck is extracted verbatim into
`lockProductActor` and reused; parent mutation behavior remains covered by regressions.
Each price write starts a pooled transaction, sets safe local search_path/lock timeout,
locks actor/grant state, verifies enabled recognized stamp/audit triggers, and locks
PRICEHIST in ROW EXCLUSIVE mode before taking a FOR SHARE lock on the active Product.
This follows DEV-06's child-table-before-parent ordering to avoid a lock inversion.
Price updates then lock the composite-key row FOR UPDATE; inserts rely on the PK.
Concurrent duplicates and repeated transitions serialize without duplicate mutations.

The parent lock prevents Product deactivation while its price mutation commits.
Inactive products must first be restored through the existing Product workflow.
The app supplies only transaction-local app.username from authenticated email.
Enabled DB triggers own stamps and audit rows; actual change stamps must match
CREATED/EDITED/DELETED/RESTORED, full actor and Manila timestamp before COMMIT.
Mismatch/failure rolls back history and trigger audit atomically; no-op edits retain
old stamp and create no audit. All untrusted values use SQL parameters.

### UI and references

Extends `/workspace/product`, not a standalone disconnected screen. Reuses
`docs/ui/wireframes-products.md` design tokens, Product table/status/action patterns
and accessible native dialogs. The tracked wireframe document contains the Product
catalog layout; complete Guide Figures 12–13 were not available locally.

History includes selected code/description, descending dates, decimal amounts,
privileged-only status/stamps/filter, exact-right Add/Edit/Delete, privileged Restore,
required date/positive price input, immutable edit date, duplicate errors, deletion
confirmation, pending-save protection, empty/loading/retry/error states and responsive
scrolling. Close/cancel cannot dismiss an in-flight mutation; stale list responses
are ignored, 401 redirects, 403 refreshes available actions. Success reloads history
and emits the inherited products:changed event for current-price refresh.

### DBA/security/deployment dependencies

- Migration-only DBA-02 lacks business is_deleted/stamp fields. Reproducible additive
  DBA migrations must supply Product/PRICEHIST soft-delete/audit support; snapshots
  alone are not deployment migrations.
- Tracked pricehist.stamp varchar(60) is insufficient for full actor stamps. Required
  capacity: text or >=284 characters. Existing trg_set_stamp emits legacy labels,
  not the four required past-tense labels. DBA must supply price-specific compatible
  stamping (recognized function pricehist_set_stamp or corrected trg_set_stamp)
  without altering unrelated tables or no-op/state protections.
- Expected BEFORE row trigger pricehist_biu_stamp; one AFTER audit writer named
  pricehist_aiu_audit, existing trg_audit_log('effdate','prodcode') argument order.
  Existing ADD/EDIT/DELETE/RESTORE audit actions remain, distinct from stamp labels.
- Runtime never disables/bypasses triggers. Tests FIRST prove snapshot-capacity
  rejection and legacy-label rollback. Required stamps are then tested through an
  explicitly PROPOSED disposable fixture only. No official migration is supplied.
- Inherited DEV-05/06 schema, stamp and Product active-child-policy blockers remain.
  Price mutations do not remove price/sales records to evade the Product guard.
- Actual Supabase privileges/RLS/direct Data API and Vercel SSL/origin/session
  behavior are NOT VERIFIED. Tracked broad anon/authenticated business-table grants
  require external security review; Express RBAC does not secure direct Data API.
  No shared schema, grants or data are inspected/altered by this test runner.

### Official Issue #78 acceptance matrix

| Official criterion | Classification | Actual evidence / remaining dependency |
| --- | --- | --- |
| Price History CRUD Operations, stamps, role visibility, audit tracking | BLOCKED for deployment | PASSED on isolated proposed schema: five endpoints, UI, exact rights, strict restore, stamp/actor/key JSON, no physical deletion, sales preservation, rollback and current-price updates. Actual field/stamp migration and deployment verification remain required. |
| Effective Date Validation, positive price and duplicate/overlapping-date rejection | NOT VERIFIED in full | PASSED for real canonical dates, positive exact decimal bounds, historical/future dates, duplicate active/inactive keys and concurrency. Any additional interval-overlap rule remains unspecified/unverified against unavailable Guide text; none is invented. |

No failed final automated check remains, but the issue is not declared complete.

## Deliverables & Live Local Verification

Executed on Node 24.22.2 and PostgreSQL 16.15. Runner creates a new private cluster
0700, private Unix socket, TCP disabled, host auth rejected; strips inherited PG/
VERCEL/DATABASE_URL settings and stops the cluster in finally. Uses tracked base
schema/auth migrations then strictly disposable business-contract fixtures. Existing
Windows hopedb, shared Supabase and production are never selected. Test users,
passwords and setup credentials are synthetic, never real invitations or roster proofs.

Exact executed non-PG command:

```bash
python3 - <<'PY'
import pathlib, subprocess
files = sorted(str(p) for p in pathlib.Path('test').glob('*.test.js')
               if not p.name.endswith('-postgres.test.js'))
subprocess.run(['node', '--test', '--test-concurrency=1', *files], check=True)
PY
```

SQL/HTTP and browser commands:

```bash
python3 database/tests/run_products.py
python3 database/tests/run_customers.py
# Executed combined regression + price acceptance + optional external browser:
HOPE_PLAYWRIGHT_MODULE=/tmp/s2-dev05-browser/node_modules/playwright \
PLAYWRIGHT_BROWSERS_PATH=/tmp/s2-dev05-browser/browsers \
LD_LIBRARY_PATH=/tmp/s2-dev05-browser/libs/usr/lib/x86_64-linux-gnu \
python3 database/tests/run_price_history.py --browser
# Equivalent SQL/HTTP/auth tests without browser dependency:
python3 database/tests/run_price_history.py
```

External Playwright/Chromium and needed OS libraries were already installed under
/tmp for prior tasks. They are not repository dependencies. Optional paths must be
set to an available external installation; this runner is POSIX-only, never a tool
for testing a shared Windows/Supabase DB.

| Verification | Final actual result | Logs |
| --- | --- | --- |
| Complete feasible non-PostgreSQL suite | PASS 154, 0 fail/skip | /tmp/s2dev07-unit.log |
| Existing Product list | PASS 11, 0 fail/skip | /tmp/s2dev07-products.log |
| Customer list | PASS 8, 0 fail/skip | /tmp/s2dev07-customers.log |
| Parent create/edit | PASS 12, 0 fail/skip | products-live.log in combined cluster |
| Parent soft delete/restore | PASS 9, 0 fail/skip | states-live.log |
| Existing live auth/session/setup | PASS 1, 0 fail/skip | auth-live.log, separate fresh auth DB |
| Price history SQL/HTTP | PASS 12 (parent + 11 subtests), 0 fail/skip | price-history-live.log |
| Real Chromium browser | PASS six groups | browser.log |
| Syntax, whitespace, staged file/scope review | PASS | node --check; git diff --check |
| Windows, shared Supabase/Vercel and actual Data API/RLS | NOT RUN / NOT VERIFIED | No shared target modified |

Combined final evidence: `/tmp/s2dev07-browser.log` and private stopped cluster
`/tmp/hope-price-history-test-n3noavib/`. SQL tests verify exact money text maximum,
real calendar/positive/duplicate validation, inactive-row duplicate rejection, 401/
403/404/409 behavior, inactive parents, immutable dates, future exclusion, fallback/
restoration/null price, PK retention, byte-identical sales-detail history, exact audit
actor/composite key/before-after JSON, no-op silence, atomic rollback, revocation,
blocking, one-winner concurrent inserts and transitions, and safe unavailable-audit
errors. Initial test-fixture alias `day` was corrected to explicit `AS value`; final
reruns passed without changing database/application guards.

Browser groups: modal/empty/native validation/add/order/future exclusion;
edit/date-lock/current-price refresh; confirm-delete/fallback/restore;
duplicate-date feedback; loading/sanitized error/recovery/mobile; User active-only
history/hidden metadata/exact controls/no script errors. Screenshots under private
`browser-evidence/`: empty-history.png, inactive-price.png, duplicate-date.png,
loading-history.png, mobile-history.png, user-active-only.png. These are ephemeral
local evidence, not committed artifacts.

Before deployment: resolve additive DBA field/stamp migration; confirm the overlap
interpretation with the Guide/business owner; inspect actual least-privilege/RLS/Data
API controls; run authorized synthetic HTTPS browser/API smoke on deployed Vercel
and Windows/Edge. No permission to seed or modify that shared target is inferred.

Final status: available for DRAFT review; deployment and full Issue #78 completion
remain BLOCKED / NOT VERIFIED as classified above.
