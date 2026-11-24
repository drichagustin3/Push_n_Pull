# S2-DEV-08 — Current-price display on product page

## Git, PR & Scope Discipline (Strict — Non-Negotiable)

Issue #79. Head `feat/S2-DEV-08-current-price-rights`; base
`feat/S2-DEV-07-price-history`, verified remote c6198739114f707230cf7edef186599a63e69fe7.
PR #91 is merged; Customer PR #92 (23d98a4) targets DEV-01 and #93 (216bec3) targets
DEV-02, both open. Product PRs #94–#97 remain open in their existing stack. Only
Customer List is on main/the Product stack; Customer mutations are NOT in this PR.

For cross-module evidence, created a detached `/tmp/hope-dev08-combined` checkout
from the Product parent and normally merged the verified Customer DEV-03 head
216bec3cdc86ac4a95578e01fb0ae3bee341dc07 with --no-commit/--no-ff. Merge was clean.
Applied only the DEV-08 working-file overlay there and ran combined tests, then
removed this disposable worktree. No combined commit exists, and no Customer commits
are added to DEV-08. Parent branches/PRs and unrelated existing worktrees are untouched.
No force push, merge to main, shared DB change, real invitation or provisioning.

Changed files relative to DEV-07:

- `src/security/action-denials.js`: narrowly scoped redacted security log for the nine mutation routes.
- `src/create-app.js`: attach denial observer before routers; injectable logger for verification.
- `src/rbac/service.js`: nine effective permission flags derived from existing trusted rights.
- `src/auth/controller.js`: additive fresh rightCodes/permissions on the authenticated session endpoint.
- `src/workspace/view.js`: load shared permission synchronization script.
- `public/permissions.js`: remove stale controls and intercept revoked form/action handlers.
- `public/workspace.js`: synchronize navigation rights, fail closed on refresh failure, refresh after mutations/rejections.
- `public/price-history.js`: notify permission refresh on 403 and explicitly distinguish Add/Edit while busy.
- `test/auth.test.js`: update pool double to distinguish the new catalogue read; existing assertions retained.
- `test/action-security.test.js`: redacted/once-only/case-insensitive logging and exact session flag tests.
- `test/permission-sync.test.js`: stale form/control/revocation/restore-role DOM tests.
- `test/action-rights-postgres.test.js`: combined nine-action SQL/HTTP/security matrix.
- `database/tests/run_action_rights.py`: fresh disposable combined regression runner with Customer dependency guard.
- `database/tests/action_rights_browser.cjs`: real combined browser/revocation/current-price verification.
- `docs/S2-DEV-08.md`, `docs/S2-DEV-08-PR-description.md`: scope, evidence, dependencies and reproduction.

No official migration, new permission code, dependency/lockfile, .env, generated
fixture, secret, Customer CRUD source, or unrelated branch changes are included.

## Task-Specific Requirements

### Audit of existing functionality

| Requirement | Initial finding | DEV-08 action |
| --- | --- | --- |
| Current-price SQL, precision, null/em dash, mutation refresh | Already implemented and verified in DEV-04/07 | Retain code; rerun SQL/HTTP/browser evidence. No pricing query rewrite. |
| Six Product/Price action guards | Already implemented | Verify exact one-action success, eight wrong rights denied, revocation and no mutation. |
| Three Customer action guards | Implemented on open PRs #92/#93 only | Inspect source and test simultaneously in disposable combined checkout; do not copy CRUD into this branch. |
| Navigation effective rightCodes | Already present from fresh loadAccess | Reuse trusted payload, preserve role policy. |
| Effective rights from auth session endpoint | Missing | Add current rightCodes plus nine boolean permissions without caching rights in the session. |
| Denied-action security events | Missing; DB mutation audit cannot represent denied HTTP actions | Add separate structured console security events, never fabricate DB audit actions. |
| Stale open dialogs after permission refresh | Required stronger handling | Shared capture guard/pruning closes stale forms, refreshes on rejection, preserves server guards. |
| Price Add while fields disabled during save | Mode cannot safely be inferred from disabled date | Explicit price form requiredRight (UI only), preserving Add mode during refresh while pending. |

### Nine-action verification matrix

All entries PASSED in the combined fixture. Customer success evidence is not evidence
that Customer CRUD is present on the submitted Product branch.

| Right | Route | User with ONLY this right | Anonymous/no/wrong action/cross-module/forged rights | Revoked/blocked/inactive | Denied data/audit preservation |
| --- | --- | --- | --- | --- | --- |
| customer.add | POST /api/customers | 201 | 401/403 | 401/403 | unchanged |
| customer.edit | PUT /api/customers/:custNo | 200 | 401/403 | 401/403 | unchanged |
| customer.delete | DELETE /api/customers/:custNo | 200 | 401/403 | 401/403 | unchanged |
| product.add | POST /api/products | 201 | 401/403 | 401/403 | unchanged |
| product.edit | PUT /api/products/:prodCode | 200 | 401/403 | 401/403 | unchanged |
| product.delete | DELETE /api/products/:prodCode | 200 | 401/403 | 401/403 | unchanged |
| price.add | POST /api/products/:prodCode/prices | 201 | 401/403 | 401/403 | unchanged |
| price.edit | PUT /api/products/:prodCode/prices/:effDate | 200 | 401/403 | 401/403 | unchanged |
| price.delete | DELETE /api/products/:prodCode/prices/:effDate | 200 | 401/403 | 401/403 | unchanged |

Each endpoint is tested against all eight other single-action actors, not merely one
wrong right. Both Admin and Superadmin succeed on all nine under the existing active
catalogue policy. All User variants are denied all three restore routes. Successful
mutations keep the existing transaction-time actor/grant checks and DB audit behavior.
Denials compare digests of Customer, Product, PRICEHIST, Sales, Sales Detail AND
successful-mutation audit_log before/after. Session invalidation can legitimately
change auth_session and is not treated as a business mutation.

### Session and frontend synchronization

GET `/api/v1/auth/session` retains its existing user/message and adds `rightCodes`
and `permissions` keyed by the exact nine action codes. It loads current account,
role and grants through existing loadAccess for every request; blocked/restricted/
expired/version-mismatched sessions remain denied. No browser-supplied role or right
is trusted, and permissions are not cached into req.session. Navigation continues
exposing current rightCodes from the same effective-right service.

The workspace script supplies trusted navigation payloads to a shared UI guard.
It prunes missing Add/Edit/Delete/Prices controls, closes/reset stale Customer/Product
forms and Price dialogs on relevant loss, enforces privileged restore visibility,
and blocks stale handlers in capture phase before existing mutation callbacks run.
It observes inserted controls so an older list response cannot restore revoked actions.
A failed navigation refresh clears UI permissions; focus/visibility and mutation/
rejection refreshes supply updated rights. Server checks remain the security boundary;
there is no claim of instantaneous push-based revocation without a new request.

Customer templates are recognized by existing IDs only when those unmerged templates
are available. On this branch Customer Add remains its inherited future-task control;
DEV-08 does not enable or duplicate missing Customer CRUD. The combined browser proves
compatibility with the actual unmerged templates and their real form handlers.

### Security logging

The existing audit_log records actual database changes with constrained ADD/EDIT/
DELETE/RESTORE actions. It has no denied-request schema. The new middleware records
one JSON security event at response finish for 401/403 on the nine mutation routes:
`{event:"authorization_denied",action:"product.edit",status:403,at:"...UTC..."}`.
Route matching follows Express case-insensitive/trailing-slash behavior. This is an
HTTP security event, NOT a successful DB audit row, and it causes no DB writes.

Only fixed allowlisted action names, response status and server timestamp are logged:
no request URL or record identifiers, query/body, password/hash/setup proof, cookie,
Authorization header, IP, email or account identity. Unrelated login/read routes and
validation/DB failures are outside this narrow nine-action log. An injected logger
supports tests; default is structured console.warn for the deployment log collector.
Logger exceptions cannot authorize a request or crash response completion; a fixed
non-sensitive console error signals log-delivery failure. Central collection,
retention, access control and alerting are external deployment responsibilities;
no durable shared audit/security sink is claimed verified.

### Current-price evidence

Existing one-statement Product query uses a lateral latest-price lookup, matching
prodcode, NOT is_deleted, effdate <= CURRENT_DATE, ORDER BY effdate DESC LIMIT 1.
NUMERIC becomes text BEFORE JSON aggregation. There is no per-product N+1 query or
JS floating-point conversion. Eligible historical rows remain usable, future/deleted
rows are excluded, latest null remains null rather than an invented older fallback,
and missing eligible price is null/em dash. Product and price deletion remain distinct.

The Product/Price regressions and real browser verify add/edit refresh, delete fallback,
restore, future exclusion, null and maximum 99999999.99 -> `₱99,999,999.99`. No current-
price calculation change was needed. Existing price validation and audit stamps stay
in their owning parent tasks.

### Acceptance classification and dependencies

| Official Issue #79 criterion | Classification | Evidence / limit |
| --- | --- | --- |
| Current-Price Display on Product Page | PASSED in isolated application | Existing SQL/DOM/HTTP plus browser amount/null/precision and mutation refresh verified. Shared deployed target remains NOT VERIFIED. |
| Per-Action Rights Enforcement, nine guards and session/UI sync | BLOCKED for complete submitted-branch integration | All nine PASSED simultaneously in disposable combined checkout, including real browser revocation and logging. Only six mutation guards are inherited on this Product branch; actual Customer CRUD still requires PRs #92/#93. Session/UI/logging additions are present here. |

No final test failure or unresolved DEV-08 implementation defect remains. Keep draft:
Customer stack integration and existing DBA stamp/column/unit/active-child-policy
migration blockers still prevent full deployed readiness. Proposed test-only Customer
stamp/width and Product/Price fixture contracts do not establish actual shared schema
compatibility. No trigger was disabled on a shared database, and no official migration
is changed. Supabase RLS/grants/direct Data API, least-privilege DB role, Vercel TLS/
origin/session/log collection, Windows/Edge and shared smoke remain NOT VERIFIED.
Tracked broad business-table grants require security-owner inspection separately;
Express RBAC cannot secure direct Data API requests.

## Deliverables & Live Local Verification

Node 24.22.2 / PostgreSQL 16.15. All SQL fixtures run in newly created private clusters,
0700 directories/private Unix sockets, TCP disabled and inherited PG/VERCEL/DATABASE_URL
removed. Cluster cleanup occurs in finally. Only synthetic records/credentials are used;
no existing local hopedb, shared Supabase, production data or real invitations touched.

Executed non-PG command in both the task checkout and disposable combined checkout:

```bash
python3 - <<'PY'
import pathlib, subprocess
files = sorted(str(p) for p in pathlib.Path('test').glob('*.test.js')
               if not p.name.endswith('-postgres.test.js'))
subprocess.run(['node', '--test', '--test-concurrency=1', *files], check=True)
PY
```

Root Product regressions:

```bash
python3 database/tests/run_products.py
HOPE_PLAYWRIGHT_MODULE=/tmp/s2-dev05-browser/node_modules/playwright \
PLAYWRIGHT_BROWSERS_PATH=/tmp/s2-dev05-browser/browsers \
LD_LIBRARY_PATH=/tmp/s2-dev05-browser/libs/usr/lib/x86_64-linux-gnu \
python3 database/tests/run_price_history.py --browser
```

Combined checkout commands:

```bash
python3 database/tests/run_customer_forms.py
python3 database/tests/run_customer_states.py
HOPE_PLAYWRIGHT_MODULE=/tmp/s2-dev05-browser/node_modules/playwright \
PLAYWRIGHT_BROWSERS_PATH=/tmp/s2-dev05-browser/browsers \
LD_LIBRARY_PATH=/tmp/s2-dev05-browser/libs/usr/lib/x86_64-linux-gnu \
python3 database/tests/run_action_rights.py --browser
```

The external Playwright/browser/library paths were already available from prior tasks;
no package or OS library is added to Git. Without --browser, the combined runner
executes all SQL/HTTP/auth/matrix checks. It refuses to run on this Product-only
checkout when Customer mutations are absent; this is intentional dependency safety.

To reproduce combined evidence AFTER DEV-08 is committed (POSIX; verify parent refs
first, stop/review any unexpected conflict rather than accepting whole files):

```bash
repo_root=$(git rev-parse --show-toplevel)
integration_root=$(mktemp -d /tmp/hope-dev08-recheck-XXXXXX)
git worktree add --detach "$integration_root/tree" feat/S2-DEV-08-current-price-rights
git -C "$integration_root/tree" merge --no-commit --no-ff 216bec3cdc86ac4a95578e01fb0ae3bee341dc07
ln -s "$repo_root/node_modules" "$integration_root/tree/node_modules"
cd "$integration_root/tree"
python3 database/tests/run_action_rights.py
# Optional --browser with the external module/browser/library variables above.
cd "$repo_root"
# Only remove this newly created disposable checkout and its deliberate test merge.
git worktree remove --force "$integration_root/tree"
rmdir "$integration_root"
```

| Final verification | Actual result | Evidence |
| --- | --- | --- |
| Task-branch non-PG suite | PASS 162, zero failures/skips | /tmp/s2dev08-unit.log |
| Combined non-PG incl Customer CRUD | PASS 174, zero failures/skips | /tmp/s2dev08-combined-unit.log |
| Inherited Product list | PASS 11 | /tmp/s2dev08-products.log |
| Customer create/edit | PASS 12 | /tmp/s2dev08-customer-forms.log |
| Customer delete/restore | PASS 11 | /tmp/s2dev08-customer-states.log |
| Parent Product create/edit, state, Price History, auth | PASS 12 / 9 / 12 / 1 | /tmp/s2dev08-parent-browser.log and combined runner |
| Nine-action SQL/HTTP matrix | PASS 15 (parent + 14 subtests) | /tmp/s2dev08-browser.log; action-rights-live.log |
| Combined real browser | PASS six groups | same combined log; browser.log |
| Parent Price History real browser | PASS six groups | /tmp/s2dev08-parent-browser.log |
| Syntax, whitespace, task-only staged scope | PASS | node --check; git diff --check |
| Shared Supabase/Vercel/Windows/central log retention | NOT RUN / NOT VERIFIED | No shared target modified |

Counts from separate checkouts/runs overlap; do not add them as distinct tests.
Final combined stopped cluster: `/tmp/hope-action-rights-test-txa3alf6/`; private
`browser-evidence/` contains customer-add-only.png, product-exact-prices.png and
price-add-only-mobile.png. Root parent browser evidence:
`/tmp/hope-price-history-test-7x9ebix3/`. Temporary integration revisions were saved
in `/tmp/s2dev08-integration-revisions.log`; combined checkout was removed after tests.
These logs/screenshots are ephemeral local evidence, not committed private artifacts.

Browser proves real Customer Add-only form success; Customer revocation closing its
stale form and direct POST 403; Product exact/null/max amounts and Edit-only controls;
Product revocation closing its stale editor and direct PUT 403; Price Add-only controls,
focus/navigation while a save is pending, duplicate-submit guard, future exclusion and
mobile; Price revocation closing history, clearing stale rows, updated session flags
and direct POST 403. No page errors were observed. Case-insensitive denial matching
and explicit pending Price Add mode were corrected during review and verified by
final unit/browser reruns; no production guard was bypassed.

Final status: DRAFT review available; complete cross-stack/deployed acceptance remains
BLOCKED by the documented Customer/DBA/deployment dependencies. Do not merge automatically.
