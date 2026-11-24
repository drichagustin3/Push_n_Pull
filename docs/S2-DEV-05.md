# S2-DEV-05 — Product create and edit form

## Git, PR & Scope Discipline (Strict — Non-Negotiable)

Issue #76; branch `feat/S2-DEV-05-product-create-edit`, stacked onto
`feat/S2-DEV-04-product-list` at `0f02f7e899a8f1e6e19cfd8a199cdd7bd1659df9`.
PR #94 was verified open and unmerged before implementation and before publishing.
No Customer branch, parent PR, official migration, shared schema/data or dependency
manifest is changed. Only this branch is committed/pushed; no merge is authorized.
After #94 merges, verify its actual merge history before retargeting to main; do
not force-push or include duplicated parent changes.

## Task-Specific Requirements

### API and authorization

- `POST /api/products`: `{prodCode, description, unit}`; 201 on success.
- `PUT /api/products/:prodCode`: `{description, unit}`; 200 on success.
- Code: 1–6 ASCII alphanumeric/hyphen characters, starts alphanumeric, immutable.
  Existing codes are preserved exactly; no case conversion, truncation or aliases.
- Description: trim surrounding whitespace, required, <=100 characters, no control
  characters. Unit: exact value from `pc, ea, mtr, pkg, ltr, pcs, can, pair, meter`.
  This finite proposed target catalogue preserves the five legacy values and four
  explicit Issue #76 examples. No unsupported business unit or translation is
  invented. Additional units require business/DBA approval.
- `product.add` and `product.edit` are separate server guards. Existing effective
  rights allow Admin/Superadmin active-catalogue operational rights; Users need the
  exact active grant. A price-only right never permits a profile mutation.
- Same-origin JSON required; configured production HTTPS enforced. Unknown/system/
  price fields rejected. Missing/inactive edit ->404, duplicate ->400 per issue,
  validation ->400, unauthenticated ->401, denied ->403, wrong content type ->415,
  oversized JSON ->413, incompatible/unavailable DB ->503 without SQL details.
  Product-only parser boundary handles invalid JSON before unrelated routers.
- Account/session version, role, module, catalogue and User grant are rechecked
  inside the transaction under row locks. Parameters carry all untrusted values.
  Existing account-management lock boundaries protect against concurrent blocking
  or revocation. Transaction-local `app.username` uses authenticated email.
- DB triggers own stamps/audit records. Approved enabled trigger identities and
  column capacities are checked before writing; changed rows must return exactly
  CREATED/EDITED plus the actor and Manila timestamp before COMMIT. Invalid output
  rolls back product and trigger-generated audit entries together. No manual audit
  INSERT or stamp override. No-op updates preserve trigger no-op behavior.
- New product uses `is_deleted=false` (existing API maps this to active). Inactive
  products cannot be edited/reactivated. Price history and key relationships are
  preserved; no price is created. New products have null currentPrice on listing.
- User mutation responses exclude privileged stamp/status metadata, consistent
  with the inherited Product list contract.

### UI

Native accessible modal: required fields, code pattern/maxlength, description
maxlength, explicit unit select, locked code on edit, inline errors, pending-save
state and duplicate-submit protection. Escape/cancel reset the form except while
saving; focus returns to its trigger. Success refreshes the existing list without
resetting search/status; 401/403 clear the form and refresh/redirect appropriately.
Action visibility follows server-returned capabilities; server checks remain
mandatory. Prices/Delete/Restore stay disabled future-task controls. Price display,
Customer routing, filters and privileged columns remain intact.

### DBA dependency: current schema does not satisfy Issue #76

| Artifact | Verified existing contract | Required DBA-owned correction |
| --- | --- | --- |
| `supabase/migrations/20261114121000_dba02_base_tables.sql` | Business `is_deleted`/`stamp` absent in migration-only replay | Add compatible soft-delete/audit support and triggers through an additive migration |
| `supabase/schemas/public/tables/product.sql` | description varchar(30), unit varchar(3), stamp varchar(60) | Description >=100; unit >=5; stamp text or >=284 to retain full authenticated email |
| Same snapshot, `unit_ck` | pc/ea/mtr/pkg/ltr only | Review and approve exact additional pcs/can/pair/meter values without removing valid legacy units or translating their meaning |
| `trg_set_stamp` / `product_biu_stamp` | ADD/EDIT stamp labels | Product-specific CREATED/EDITED stamps, preserving other tables, no-op semantics and soft-delete protections |
| `product_aiu_audit` / `trg_audit_log('prodcode')` | ADD/EDIT audit actions with actor and before/after JSON | Retain existing audit-log actions/contracts; CREATED/EDITED apply to product stamp text only |

The runtime accepts `public.trg_set_stamp` or `public.product_set_stamp` for the
named BEFORE INSERT/UPDATE row trigger, and a single recognized AFTER audit writer.
The proposed fixture uses `product_set_stamp` with the existing audit writer.
Snapshot files are evidence, not automatically replayed deployment migrations.
No official SQL migration is supplied by this Developer PR. Current legacy schemas
fail closed; passing proposed-contract fixture tests do not prove deployment readiness.
Actual Supabase schema/trigger capabilities, privileges, RLS, direct Data API
exposure and Vercel connectivity remain unverified. The tracked product snapshot
includes broad anon/authenticated grants; server RBAC alone does not secure direct
Data API access. Security/DBA owners must inspect and resolve shared exposure before
deployment; this PR does not change permissions or claim that exposure is confirmed
on the deployed target.

Pricing/catalog wording in acceptance is interpreted using the explicit profile
payloads. Current-price rendering is preserved; pricing inputs are rejected.
Price-history mutations belong to S2-DEV-07; current-price expansion belongs to
S2-DEV-08. Product deletion/restore belongs to S2-DEV-06.

### Changed files

- `src/create-app.js`: Product-only JSON-parser error boundary.
- `src/products/controller.js`, `routes.js`, `validation.js`, `mutations.js`, `view.js`:
  request validation, exact-right routes, transactional writes, audit gate and modal.
- `public/product-editor.js`, `products.js`, `products.css`: form, list integration and styles.
- `test/product-write.test.js`, `product-editor-form.test.js`,
  `product-write-postgres.test.js`: validation/DOM/live write coverage.
- `test/products-postgres.test.js`: remove only obsolete unsupported-POST expectation.
- `database/tests/run_product_writes.py`, `product_write_browser.cjs`: private
  disposable SQL/auth/browser orchestration; all fixture DDL restricted to that cluster.
- `docs/S2-DEV-05.md`, `S2-DEV-05-PR-description.md`: scope, dependency and test evidence.

### Issue #76 compliance

| Official acceptance criterion | Isolated evidence | Deployment status / owner |
| --- | --- | --- |
| Product Forms & Validation, unit and catalog attributes | PASSED: UI/DOM/browser plus API input tests; legacy values and explicit examples retained | BLOCKED: DBA approval/deployment of proposed unit catalogue and description length; pricing writes deferred per explicit payload scope |
| Backend Endpoints & Database Operations, correct stamp formatting | PASSED on proposed contract; legacy rejection and atomic rollback passed | BLOCKED: existing DBA/schema dependency for fields and CREATED/EDITED trigger behavior |
| Permission & Audit Verification | PASSED: exact rights, revocation/blocking, actor attribution, no duplicate/no-op audits, price preservation | NOT VERIFIED on shared target; external security/deployment review pending |

No acceptance criterion is represented as fully deployment-complete.

## Deliverables & Live Local Verification

Executed with Node 24.22.2 and PostgreSQL 16.15 in fresh private Unix-socket clusters,
TCP disabled, inherited PG/VERCEL/DATABASE_URL settings removed. No existing local,
Windows, Supabase or production DB is selected. Only synthetic accounts/data/proofs
are used; no real invitations or provisioning occur. Cluster shutdown runs in finally.

Exact non-PG command (145 passed, 0 failed/skipped):

```bash
python3 - <<'PY'
import pathlib, subprocess
files = sorted(str(p) for p in pathlib.Path('test').glob('*.test.js')
               if not p.name.endswith('-postgres.test.js'))
subprocess.run(['node', '--test', '--test-concurrency=1', *files], check=True)
PY
```

Isolated SQL/HTTP commands:

```bash
python3 database/tests/run_product_writes.py
python3 database/tests/run_products.py
python3 database/tests/run_customers.py
```

`run_product_writes.py --browser` was executed and includes the write command's
same checks: 12 Product write tests (parent + 11 subtests), 1 existing auth test
covering real login/session persistence/revocation/concurrent first-password flow.
Inherited Product list: 11 passed; Customer list: 8 passed. All 0 failed/skipped.
The runner provisions the auth test's required synthetic employee in a separate
fresh `hopedb_auth_test`. It never copies real account credentials.

The optional browser runner uses an external Playwright installation, keeping
package.json/lockfile unchanged. Install Playwright/Chromium under a private temp
directory with required system libraries, then run (POSIX only):

```bash
HOPE_PLAYWRIGHT_MODULE=/tmp/s2-dev05-browser/node_modules/playwright \
PLAYWRIGHT_BROWSERS_PATH=/tmp/s2-dev05-browser/browsers \
LD_LIBRARY_PATH=/tmp/s2-dev05-browser/libs/usr/lib/x86_64-linux-gnu \
python3 database/tests/run_product_writes.py --browser
```

Six browser groups PASSED: create/native validation/null price/search retention;
edit/immutable code/100 characters/refresh; duplicate/cancel; sanitized failure;
390px mobile form; exact-right visibility/metadata privacy/no JS errors.
The script logs the evidence directory inside its private stopped-cluster folder.
Screenshots: create.png, edit.png, duplicate.png, mobile.png, user-edit-only.png.

Evidence from the final runs (ephemeral Codespaces files, not committed):
- `/tmp/s2dev05-unit.log`: 145 passed, 0 failed/skipped.
- `/tmp/s2dev05-browser.log`: 1 auth + 12 writes, six browser PASS lines.
- `/tmp/hope-product-write-test-izvh1n7u/`: auth-live.log, products-live.log,
  browser.log, browser-evidence/*.png, migration and fixture logs; cluster stopped.
- `/tmp/s2dev05-product-list.log`: 11 passed, 0 failed/skipped.
- `/tmp/s2dev05-customer-list.log`: 8 passed, 0 failed/skipped.

Initial test setup problems were corrected and rerun: audit key is audit_id rather
than log_id; auth regression needs synthetic employee 00001; browser logout must
finish navigation before the next login. No application security guard was bypassed.

Syntax checks and git diff --check PASSED. No official migration, dependency lock,
.env, node_modules, AI folder, customer source or parent commit is newly changed.
Only the obsolete POST-not-implemented assertion in the parent list integration
suite is removed; PUT/DELETE collection rejection and all list/price checks remain.

Remaining deployment smoke checks (NOT RUN; require authorized compatible target):
verify additive DBA migration replay from empty baseline; inspect enabled triggers
and capabilities; inspect Supabase grants/RLS/views/Data API exposure; authenticate
separate add-only/edit-only/price-only actors; test browser create/edit/duplicate,
revocation/blocking, null/existing prices, search/status retention; inspect exactly
one DB-owned audit entry per actual mutation and full actor stamps; check HTTPS,
Vercel origin/session behavior and Windows/Edge. Use approved synthetic records and
capture create/edit/conflict/mobile/denied screenshots without secrets.

Final status: Developer implementation available for DRAFT review; deployment and
full Issue #76 completion BLOCKED by documented DBA and external verification work.
