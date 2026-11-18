# S1-DBA-05 — catalogue verification and blocked account provisioning

Issue: [#47](https://github.com/drichagustin3/Push_n_Pull/issues/47).
Branch: feat/S1-DBA-05-seed-superadmins-modules-rights.
Base: fetched origin/main b0f81e9. The task title matches the requested PR title.
PR title: `[S1-DBA-05] Seed Data: Superadmin Accounts, 5 Modules & 36 Granular Rights Catalogue`.
DBA-01 PR #1, DBA-02 PR #10, DBA-03 PR #39 and DBA-04 PR #40 are merged.
DEV-05–08 remain open in their separate branches/PRs; none of their commits is
introduced into this DBA branch. All pre-existing work was preserved.

## Schema and seed alignment

| Table | Actual verified columns/keys | Existing state | Proposed task-only action |
| --- | --- | --- | --- |
| role | role_code text PK, description, is_deleted, stamp | user/admin/superadmin present | Verify only; no seed writes in this preparation |
| module | module_code text PK, description, is_deleted, stamp | Five canonical codes present | Verify existing five codes; preserve records |
| rights_catalogue | right_code varchar(50) PK; module_code FK; description; is_deleted; stamp | All 36 canonical rows/mappings/descriptions present | Issue aliases required; plan a separate compatible transition without creating 54 rows |
| app_user | user_id bigint identity; required first_name/last_name/email; unique canonical email; role text FK; nullable bcrypt password_hash; blocked; status; must_change_password; setup_token_hash/expiry; session_version; is_deleted; stamp | No approved handle-to-account mapping supplied | Await authorized identities/count; no privileged account guessed or inserted |
| user_permission | (user_id,right_code) PK; is_deleted; stamp | Existing active/revoked fixture associations | Preserve; do not grant or restore permissions in this task |
| audit_log | append-only ADD/EDIT/DELETE/RESTORE; actor from audit_user() | Existing triggers installed | Reuse; do not redefine or fabricate actor identity |

The isolated Unix-socket PostgreSQL 16 hopedb (path from /tmp/hope-dev08-pg.path,
port 55439, current_user codespace) was verified as local. It contains synthetic
fixtures from earlier authorized tests; no shared database was contacted. The
reference business audit setup applied previously is not a new DBA-05 migration.

## Resolved catalogue decision and remaining blockers

1. Issue #47 names **three** handles (drichagustin3, AshleyNicoleMarticio30,
   rickysanglay) but its acceptance criterion requires **five** team accounts.
   The app_user schema has no GitHub username field and requires real approved
   names/emails. GitHub handles are not email addresses or ownership proof.
   docs/TEAM_WORKING_AGREEMENT.md maps all three handles to Aldrich Rodolf Agustin,
   Ashley Nicole Marticio and Ricky Joe Sanglay, respectively. It provides no
   account emails; DB Admin and Tester names/handles are blank. docs/ROADMAP.md
   repeats those three names and two blanks. The QA test plan's demo accounts
   are explicitly test personas, not an approved initial Superadmin roster.
   Local app_user checks found no handle-based candidate for any of the three
   handles and no exact full-name matches for any of the three documented members. These limited checks
   cannot prove ownership or a complete roster. Do not infer account emails or
   promote an account from a similar name. Approved emails for the three named
   members, confirmation of three versus five accounts, and (if five) the other
   two approved names/emails remain missing.
2. Eighteen issue code aliases differ from the merged canonical set below. Adding
   aliases would produce 54 rows; renaming existing codes would break current
   permissions/contracts. The Student Guide defines the 3/6/13/7/7 action groups,
   while the actual merged migration defines the currently used exact codes.
   The user explicitly requires the issue aliases. That decision is settled.
   Compatibility changes are to be planned separately; this branch currently
   prepares read-only checks and the transition plan, not a catalogue rewrite.
3. Issue module descriptions such as Customer Management differ from existing
   Customer labels; the stable codes are identical. The issue annotates Customer
   deletion as Soft delete while the existing description is Delete Customer.
   Do not silently rewrite valid existing labels or seed a parallel catalogue.

## Exact 36-right comparison

All Existing rows below were confirmed present with the stated module/description
and active in the isolated database. This is not a claim that the issue aliases
are already installed. The issue-code column is the approved target contract.

| Canonical code | Module | Existing description | Issue #47 code | Existing vs required |
| --- | --- | --- | --- | --- |
| customer.add | customer | Add Customer | customer.add | PRESENT |
| customer.edit | customer | Edit Customer | customer.edit | PRESENT |
| customer.delete | customer | Delete Customer | customer.delete | PRESENT |
| product.add | product | Add Product | product.add | PRESENT |
| product.edit | product | Edit Product | product.edit | PRESENT |
| product.delete | product | Delete Product | product.delete | PRESENT |
| price.add | product | Add Price | price.add | PRESENT |
| price.edit | product | Edit Price | price.edit | PRESENT |
| price.delete | product | Delete Price | price.delete | PRESENT |
| job.add | human_resources | Add Job | job.add | PRESENT |
| job.edit | human_resources | Edit Job | job.edit | PRESENT |
| job.delete | human_resources | Delete Job | job.delete | PRESENT |
| department.add | human_resources | Add Department | dept.add | ALIAS CONFLICT |
| department.edit | human_resources | Edit Department | dept.edit | ALIAS CONFLICT |
| department.delete | human_resources | Delete Department | dept.delete | ALIAS CONFLICT |
| employee.add | human_resources | Add Employee | emp.add | ALIAS CONFLICT |
| employee.edit | human_resources | Edit Employee | emp.edit | ALIAS CONFLICT |
| employee.delete | human_resources | Delete Employee | emp.delete | ALIAS CONFLICT |
| job_history.view | human_resources | View Job History | jobhistory.view | ALIAS CONFLICT |
| job_history.add | human_resources | Add Job History | jobhistory.add | ALIAS CONFLICT |
| job_history.edit | human_resources | Edit Job History | jobhistory.edit | ALIAS CONFLICT |
| job_history.delete | human_resources | Delete Job History | jobhistory.delete | ALIAS CONFLICT |
| sale.add | sales | Add Sale | sale.add | PRESENT |
| sale.edit | sales | Edit Sale | sale.edit | PRESENT |
| sale.delete | sales | Delete Sale | sale.delete | PRESENT |
| sale_detail.view | sales | View Sale Detail | saledetail.view | ALIAS CONFLICT |
| sale_detail.add | sales | Add Sale Detail | saledetail.add | ALIAS CONFLICT |
| sale_detail.edit | sales | Edit Sale Detail | saledetail.edit | ALIAS CONFLICT |
| sale_detail.delete | sales | Delete Sale Detail | saledetail.delete | ALIAS CONFLICT |
| report.top_customers | reports | Top Customers | report.top_customers | PRESENT |
| report.product_master_list | reports | Product Master List | report.product_master | ALIAS CONFLICT |
| report.top_products | reports | Top Products | report.top_products | PRESENT |
| report.active_employees | reports | Active Employees | report.active_emp | ALIAS CONFLICT |
| report.all_employees | reports | All Employees | report.all_emp | ALIAS CONFLICT |
| report.employee_job_history | reports | Employee Job History | report.emp_job_history | ALIAS CONFLICT |
| report.top_sales | reports | Top Sales | report.top_sales | PRESENT |

## Secure provisioning assessment / plan

DEV-03 requires bcrypt verification, or an unexpired private setup token checked
against SHA-256 setup_token_hash before establishing a restricted session. Merely
knowing an email with password_hash NULL does not permit login or password setup.
The final setup transaction consumes proof, hashes the new password, increments
the session version and rejects reuse. The mechanism is suitable for secure
provisioning without changing any authentication code.

After approval of identities and a separately reviewed catalogue transition, author one additive transaction
in supabase/migrations using stable codes/email unique keys, never numeric IDs.
Use ON CONFLICT DO NOTHING for existing accounts; detect conflicting account roles
without promotion/reset. Preserve passwords, setup proofs, roles, block/status,
soft-delete and permission state. New approved accounts need private, expiring
setup proof supplied out of band through an operator-only configuration; neither
raw setup tokens nor hashes of real existing credentials belong in Git or logs.
No default/shared password or email-only account claim will be introduced.

Do not require installing DEV-06/07/08 application commits into this DBA PR for
compatibility checks. Use an isolated checkout of the existing Developer branch
when needed; keep this branch database-only.

## Existing unrelated issue

scripts/seed-test-sers.sql from the merged tester task targets users/userId/isBlocked
and hard-deletes fixtures. It does not match app_user or its hard-delete guards.
It is not an authorized initial-account roster and is neither executed nor changed
here. Fixing that tester fixture belongs to a separate task.

## Verification and readiness

The read-only database/tests/validate_dba05_catalogue.sql checks exact sets,
module mappings and descriptions via bidirectional EXCEPT, not count alone.
It performs no seed writes; it is a baseline check, not issue acceptance.
The separate database/tests/validate_dba05_issue_catalogue.sql enforces the
approved issue codes, mappings, existing action labels, exact counts and active
state. It deliberately fails against the current 18 differing canonical codes.
Run either with psql -X -v ON_ERROR_STOP=1 -f <file> against the intended local DB.
Both scripts use BEGIN READ ONLY and make no data or schema changes.

Executed PASS: exact canonical catalogue preflight (all 36 active), local connection/
role/module/schema inspection, and git diff --check. The existing main-branch
auth-postgres integration test also executed PASS (1 test, no skips/failures),
covering private first-login proof, concurrent one-time setup, replay rejection,
password hashing and session revocation. This proves the existing mechanism is
compatible with secure provisioning; it does not prove uncreated seed accounts
are ready. No hash or raw credential was included in output.

Migration creation/execution, exact rerun/idempotency, rollback injection, initial
Superadmin presence and full seed-dependent DEV-06/07/08 integration remain
NOT RUN until the approved account roster and compatibility prerequisites are available. No seed migration was created,
no credentials were changed. This report records the preflight results; the
verification-only work is being submitted as a draft, not a completed seed migration.

Current status: **PARTIAL / BLOCKED** on the authorized account roster/count and
implementation of the separately planned rights compatibility transition. The
issue aliases are required, not an open decision. Do not mark issue #47 complete
or claim the Superadmins are provisioned. No final seed migration is supplied.

## Separate compatibility plan (not implemented)

1. Inventory every affected user_permission association, including revoked rows,
   and all catalogue consumers before changing identifiers. The 18 mappings above
   preserve meaning and module membership; adding both code sets would create
   54 rights and violate the exact-36 requirement.
2. Prepare a separately scoped database changeover that preserves association
   state, audit history and foreign-key integrity. Existing nondeferrable foreign
   keys and hard-delete guards mean a simple primary-key rename or parent delete
   is unsafe. Do not disable protections or edit the merged DBA-03 migration.
   Conflicting old/new associations need an explicit resolution policy before
   any data changes; revoked rights must never become granted accidentally.
3. Review affected application callers, documentation and tests in their own
   task branches. For example, DEV-08 docs/S1-DEV-08.md currently names
   job_history.view. Runtime calls and fixture expectations must be audited
   against all 18 mappings, including future modules. Do not merge DEV-05–08
   application commits into this DBA branch to do this review.
4. Coordinate rollout so application authorization and the database use the same
   approved identifiers. Test denied/allowed/revoked permissions and all module
   counts in an isolated integration checkout before deployment. Compatibility
   handling must not expand a user's rights or silently accept arbitrary aliases.
5. Re-run both catalogue checks: the issue-target checker must pass after the
   transition, while the old canonical checker then correctly reports drift.
   Test reruns, transaction rollback and unchanged existing account/security data.

No data transition, application compatibility code, account inserts or privilege
grants are authorized by this preparation report. Those changes remain pending
confirmed requirements and their own appropriate review.

## Latest executed verification

- **PASS:** merged canonical catalogue verifier, twice; all 36 rights active.
- **FAIL (confirmed contract mismatch):** issue-target catalogue verifier, twice;
  18 required issue codes are absent and 18 old codes remain. This is an actual
  unmet acceptance criterion, not a passing migration test.
- **PASS:** before/after content fingerprints for roles, modules, rights, users,
  permissions, audit records and sessions were identical across both repeated
  read-only checks.
- **PASS:** local account inspection completed; zero exact full-name candidates
  for the three documented members and zero handle-based candidates. This does
  not establish any approved account email or resolve the five-account count.
- **PASS:** whitespace checks include all three task files; no application or migration
  files changed.
- **NOT RUN:** seed migration application, seed idempotency and initial-account
  acceptance tests; no seed migration or approved account roster exists yet.
