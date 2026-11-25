# S2-DEV-06 — Product soft delete and restore

## Git, PR & Scope Discipline (Strict — Non-Negotiable)

Issue #77. Branch `feat/S2-DEV-06-product-soft-delete-restore` was created from
verified remote DEV-05 `6137f585fb68e2a22261a521bdcfaddfe28bd0b5`, while PRs #94
and #95 remained open. The PR targets `feat/S2-DEV-05-product-create-edit`, not main.
No parent branch/PR, Customer branch, official migration or shared DB is changed.
No force push, merge, provisioning or invitation is performed. Reassess stack bases
only after verifying actual parent merges and the resulting task-only diff.

Changed files relative to DEV-05:

- `src/products/routes.js`: DELETE/restore routes and bodyless DELETE guard support.
- `src/products/controller.js`: shared transition controller, strict empty input.
- `src/products/mutations.js`: reuse existing transaction/actor/audit logic for states.
- `src/products/view.js`: state-script loading and updated deferred-task notice.
- `public/product-state.js`: confirmation, submission guard, feedback and refresh.
- `public/products.js`: enable Delete/Restore from server capabilities.
- `test/product-state-form.test.js`: confirmation/submission/error DOM coverage.
- `test/product-state-postgres.test.js`: live SQL/HTTP guard and contract verification.
- `database/tests/run_product_states.py`: fresh private cluster and regression runner.
- `database/tests/product_state_browser.cjs`: optional real Chromium verification.
- `docs/S2-DEV-06.md`, `docs/S2-DEV-06-PR-description.md`: evidence and DBA handoff.

No parent test is removed or weakened. No .sql, .env, dependency/lockfile, AI folder,
private database fixture output or browser artifact is committed.

## Task-Specific Requirements

### API and security

- `DELETE /api/products/:prodCode`: exact `product.delete` guard. Existing
  Admin/Superadmin active-catalogue operational privileges remain.
- `PUT /api/products/:prodCode/restore`: Admin/Superadmin only, independently checked
  again under the transaction's actor lock. A User with product.delete cannot restore.
  No new right code is invented; existing active product.delete catalogue/module
  eligibility is retained for both operations, consistent with privileged rights.
- Both use real `is_deleted`, no invented status column and no hard SQL DELETE.
  Success 200; missing 404; anonymous 401; unauthorized/revoked/blocked 401/403 as
  existing auth specifies. Privileged repeat transitions 400 (existing Customer
  convention); User deletion of an inactive target 404 to avoid inactive disclosure.
- No query fields or payload fields are accepted. DELETE permits no body or an empty
  JSON object; restore requires JSON (empty object). Role/rights/stamp spoofing fails.
  Same-origin/production HTTPS checks retained; unsafe media type 415; malformed
  JSON 400; invalid product codes 400 using inherited validation.
- The existing pooled transaction handles all state mutations. It rechecks session
  version, account state, role, module, catalogue and grant under row locks. The
  target is locked FOR UPDATE, serializing repeated/concurrent transitions.
- Deletion requires the enabled, unconditional `product_bu_check` row trigger using
  `public.trg_check_children`, and locks pricehist/salesdetail IN SHARE MODE before
  the product row. This serializes child writers with the dependency decision;
  it is conservative and can temporarily delay unrelated child writes. Existing
  five-second lock timeout bounds waiting; database failures roll back safely.
- Transaction-local app.username is the authenticated email. Existing triggers own
  stamps/audit entries; changed output must match DELETED/RESTORED, full actor and
  Manila timestamp before COMMIT. Wrong output rolls back state and audit together.
  No manual duplicate audit INSERT or stamp override. Repeats never issue UPDATE.
- User transition responses contain only the affected product code plus confirmation;
  no inactive profile/status/stamp is returned. Privileged responses retain metadata.
- Exact recognized child-guard errors become structured 409 without exposing raw SQL.
  Missing guard/audit support or incompatible stamps ->503. Other DB errors are safe.

### UI

Delete appears only when the server returns delete capability. Restore appears only
for privileged inactive rows, retaining the existing metadata/capability model.
Confirmation precedes requests; cancellation sends nothing. A shared pending flag
prevents duplicate transition submissions; row controls are disabled while pending.
Completion always refreshes the inherited list, retaining search/status, recalculating
counts and removing inactive results from Users. Failure feedback remains visible;
401 redirects, 403 refreshes access. Price formatting/current-price selection, Add/
Edit forms, Customer routes and navigation remain intact. Price management is deferred.

### Verified schema conflicts and DBA handoff

| Existing artifact | Verified conflict / action required |
| --- | --- |
| DBA-02 migration-only replay | Business soft-delete/stamp columns are absent. Requires an additive, reproducible DBA migration; inherited from DEV-04/05. |
| product snapshot stamp varchar(60) | Cannot guarantee full actor stamps. State writes require text or >=284 characters; profile-only length/unit checks do not unnecessarily gate state changes. |
| `trg_set_stamp` | Emits DELETE/RESTORE, while Issue #77 requires DELETED/RESTORED stamp text. DBA must supply compatible product-specific behavior without changing unrelated tables/no-op semantics. |
| `trg_audit_log('prodcode')` | Existing DELETE/RESTORE audit actions are retained; these are distinct from DELETED/RESTORED product stamp labels. No audit-log contract change required. |
| `trg_check_children`, product branch | Rejects deletion with any active pricehist or salesdetail record. This conflicts with deactivating a priced/sold product while preserving those records. Runtime retains this guard and returns 409. DBA/business review must explicitly resolve the policy before broad issue compliance is claimed. |

No deployed trigger is disabled or bypassed. No new migration is written. The
isolated tests FIRST exercise the tracked guard and incompatible stamps and assert
no mutation. They then use explicitly PROPOSED fixture-only stamp/function bodies
to demonstrate the issue contract. The proposed product branch allows historical
references to remain; the guard stays enabled and other table branches remain
tracked. This fixture policy is not approved or installed on any shared target.
Passing it is not evidence that the existing deployment supports that policy.
Successful no-child transitions are also tested with the original child guard.

Existing DEV-05 description/unit/CREATED/EDITED dependencies remain documented in
that parent PR. No pricing/history mutations or product-profile redesign is added.
Supabase RLS/grants/direct Data API exposure and Vercel/Windows behavior are not
verified here. Broad anon/authenticated business-table grants in tracked snapshots
require external security-owner review; Express RBAC does not secure a direct Data
API. No claim is made that the snapshot grants match the actual shared database.

### Issue #77 acceptance matrix

| Official criterion | Classification | Evidence / remaining requirement |
| --- | --- | --- |
| Soft Delete Logic | BLOCKED for deployment | API, authorization, physical-row retention, audit attribution and DELETED stamp PASSED on proposed fixture. Current stamp contract and active-child policy require DBA resolution. |
| Active View Filtering | PASSED in isolated SQL/HTTP/browser tests | Active/User exclusion, privileged inactive/all counts, retained history/current price and restored visibility verified. Shared target/security verification remains NOT VERIFIED. |
| Record Restoration | BLOCKED for deployment | Admin and Superadmin allowed, all Users denied, one RESTORE audit, RESTORED stamp, concurrent/repeated behavior PASSED on proposed fixture. Actual stamp migration/deployment still required. |

No final test failure remains. Full deployment/task completion is not claimed.

## Deliverables & Live Local Verification

Node 24.22.2 / PostgreSQL 16.15; fresh private cluster with TCP disabled and local
Unix socket. Runner strips inherited PG/VERCEL/DATABASE_URL settings, builds from
tracked migrations, creates synthetic fixtures, stops cluster in finally. No real
users, invitations, shared Supabase, Windows DB or production target is modified.

Executed commands:

```bash
python3 - <<'PY'
import pathlib, subprocess
files = sorted(str(p) for p in pathlib.Path('test').glob('*.test.js')
               if not p.name.endswith('-postgres.test.js'))
subprocess.run(['node', '--test', '--test-concurrency=1', *files], check=True)
PY
python3 database/tests/run_products.py
python3 database/tests/run_customers.py
HOPE_PLAYWRIGHT_MODULE=/tmp/s2-dev05-browser/node_modules/playwright \
PLAYWRIGHT_BROWSERS_PATH=/tmp/s2-dev05-browser/browsers \
LD_LIBRARY_PATH=/tmp/s2-dev05-browser/libs/usr/lib/x86_64-linux-gnu \
python3 database/tests/run_product_states.py --browser
```

Without the optional external Playwright installation, run
`python3 database/tests/run_product_states.py` for all its SQL/HTTP/auth checks.
No browser package or downloaded OS library is added to the repo. The optional
browser uses only a loopback server, synthetic actors and the runner's private DB.

Final results (all 0 failures/skips):

| Check | Actual result | Evidence |
| --- | --- | --- |
| Complete non-PG suite | PASS: 148 | /tmp/s2dev06-unit.log |
| Inherited Product list | PASS: 11 | /tmp/s2dev06-list.log |
| Customer list regression | PASS: 8 | /tmp/s2dev06-customers.log |
| Inherited Product create/edit | PASS: 12 | /tmp/s2dev06-browser.log; private products-live.log |
| Existing live auth/session/setup regression | PASS: 1 | Same runner, separate hopedb_auth_test; auth-live.log |
| Product state SQL/HTTP | PASS: 9 (parent + 8 subtests) | states-live.log |
| Chromium browser | PASS: 6 groups | browser.log |
| JS syntax / whitespace / staged scope | PASS | node --check; git diff --check; explicit task-file review |
| Windows, shared Supabase/Vercel smoke, actual deployed RLS/grants | NOT RUN / NOT VERIFIED | No shared target modified |

Final combined evidence directory:
`/tmp/hope-product-state-test-ggq7dizs/` (cluster stopped), including migration,
fixture, SQL/HTTP and browser logs and `browser-evidence/` screenshots:
`inactive-restore.png`, `mobile-state.png`, `user-delete-only.png`.
These are ephemeral local evidence, not committed confidential artifacts.

SQL assertions verify 200/400/401/403/404/409/503 handling, target PK persistence,
byte-for-byte equality of pricehist/salesdetail rows across transitions, unchanged
current price 12.34, active/inactive/all counts, before/after audit JSON, full actor,
one entry per transition, rollback on incompatible stamps, and 200+400 concurrent
pairs. Original guard's active-child rejection is tested separately from the proposed
historical-reference policy. A test setup assumption that app_user was empty after
parent regressions was corrected to check only this suite's synthetic prefix;
final reruns pass without relaxing any provisioning or production safety guard.

Browser groups: confirmation cancel; delete/search/count updates; restore/status/
price retention; delete conflict feedback; sanitized restore failure; mobile layout/
User delete-only visibility/no script errors. Existing Add/Edit tests run unchanged.

Required authorized deployment follow-up: additive DBA migration/policy approval;
fresh migration replay; inspect actual Supabase trigger definitions, least-privilege
connection role, RLS/Data API grants; approved synthetic browser/API smoke on HTTPS
Vercel; cross-browser/Windows verification. No shared fixture seeding is authorized.

Status: implementation available for DRAFT review; deployment remains BLOCKED by
DBA stamp/dependency policy and external security/deployment verification.
