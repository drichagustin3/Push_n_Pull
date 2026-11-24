Closes #79

> **Stacked PR:** Targets `feat/S2-DEV-07-price-history` while PR #97 remains open.
> **Draft:** Customer CRUD lives on open PRs #92/#93 and is verified only in a disposable
> combined checkout. No Customer commits are added here; inherited DBA blockers remain.

### Summary

Complete the missing permission/session/security integration for the nine Customer,
Product and Price History actions. Preserve the already-correct current-price query
and strengthen simultaneous cross-module and stale-UI verification.

### Changes

- Add fresh effective rightCodes and nine boolean permissions to the authenticated
  session response using the existing effective-right service; no cached/client rights.
- Synchronize workspace permissions, prune stale controls, close/reset revoked forms
  and intercept stale UI handlers before mutation callbacks, preserving server guards.
- Refresh navigation after mutation/rejection; distinguish Price Add/Edit explicitly
  while busy so focus refresh cannot misclassify a pending Add as Edit.
- Add one redacted structured security event for 401/403 on each of the nine mutation
  routes, including case variants. No URLs, identifiers, bodies, credentials, identities
  or cookies are logged; denied HTTP events are separate from successful DB audit rows.
- Add nine-action SQL/HTTP matrix, security/DOM tests, combined browser evidence and
  precise cross-stack reproduction/dependency report in docs/S2-DEV-08.md.

### Database and Integration Dependencies

No official migrations, shared schema/data/security changes, new rights or Customer
CRUD implementation. Customer List is on main; PRs #92/#93 still supply its mutations.
A detached temporary merge tested those exact Customer branches alongside this Product
stack; it was removed afterward. The combined changes are not in the submitted branch.

Inherited business soft-delete/stamp migration, stamp-label/capacity, profile unit/length
and Product active-child-policy blockers remain with DBA owners. Test-only proposed
contracts do not prove shared compatibility. Supabase Data API/RLS/privileges and
Vercel/Windows/log collection/retention still require authorized deployed verification.

### Testing Notes

Final PASS, zero failures/skips on Node 24.22.2 / disposable PostgreSQL 16.15:

- Task non-PG: 162; combined non-PG with Customer CRUD: 174 (overlapping suites).
- `python3 database/tests/run_products.py`: 11.
- Combined `run_customer_forms.py`: 12; `run_customer_states.py`: 11.
- `run_price_history.py --browser`: 12 Product create/edit, 9 state, 12 Price History,
  1 auth regression and six parent browser groups.
- Combined `run_action_rights.py --browser`: same parent SQL regressions plus
  15 nine-action matrix tests and six combined browser groups.
- JavaScript syntax, whitespace, no duplicate routers/guards and task-scope review.

Every action succeeds for its single-right User and Admin/Superadmin; anonymous,
all eight wrong single rights, cross-module, revoked, blocked/inactive and forged
client-role requests are denied without business/audit mutations. Session/navigation
flags match current grants, all restore routes stay privileged, security events are
redacted, current prices/null/precision remain correct and stale dialogs close on
revocation. Browser covers real Customer form, Product/Price controls, direct 403s,
pending save/focus refresh, duplicate submission, mobile and no script errors.

Current-price display PASSED in isolated tests. Full nine-action submitted-branch
integration remains BLOCKED until Customer dependencies integrate; actual shared
Supabase/Vercel/Windows and central log retention are NOT VERIFIED. Full acceptance
matrix, commands, exact changed files and ephemeral evidence: docs/S2-DEV-08.md.

### Scope Confirmation

Only S2-DEV-08 relative to DEV-07. Existing pricing SQL and action guards reused;
no duplicate CRUD/routes, Customer commits, DBA migrations, credentials, dependency
changes, force pushes or automatic merges. Parent branches/PRs remain unchanged.

### Related Tasks Deferred

Merge/reconcile the existing Customer/Product stacks through normal review, then
reassess this base/history. DBA schema/stamp/policy and deployment-security work remain
separate. No HR/Sales/Reports or unrelated functionality is introduced.
