# S1-DBA-05 — PR #55 resolution report

## Metadata and reinspection

- Issue: [#47](https://github.com/drichagustin3/Push_n_Pull/issues/47).
- Existing PR: [#55](https://github.com/drichagustin3/Push_n_Pull/pull/55); the user approved publishing this follow-up and opening it for review.
- Branch: `feat/S1-DBA-05-seed-superadmins-modules-rights`; base: `main`.
- Title: `[S1-DBA-05] Seed Data: Superadmin Accounts, 5 Modules & 36 Granular Rights Catalogue`.
- Preserved existing verification commit `93ef0be`; did not start a replacement PR.
- Fetched origin and inspected issue body/comments, PR body/files, review comments,
  reviews and checks. There were no comments, reviews or checks providing new
  roster approvals or a resolution. Main still supplies DBA-03/04, not DBA-05.
- Initial gaps were confirmed in code and an isolated recreation of the merged
  schema: all five modules existed, all 36 canonical rights existed, 18 codes
  differed from the issue, and the PR contained no migration or account seed.

Latest origin/main is 1045371 (DEV-05 merged); its migration files are unchanged
from the existing branch baseline b0f81e9. Scope is compared using the PR's
three-dot merge-base diff, not a two-tree diff that would misleadingly list
new main-only Developer files as removals. The existing branch/history and local
corrections are preserved; no dirty-tree merge/reset was attempted.

The older S1-DBA-05.md report is preserved as historical inspection evidence.
This report supersedes its pending catalogue/compatibility/migration findings.
The follow-up below is included in the existing PR under the user's explicit
commit/push/review approval. No DBA-06 or Developer commits are included.

## Requirements compliance matrix

| Requirement | Before | Correction / affected files | Risk and verification | Status |
| --- | --- | --- | --- | --- |
| Official: exact 36 granular rights | 36 semantic actions but 18 wrong identifiers | New DBA-05 catalogue migration; issue verifier | Parent/child key changes handled together; exact codes, descriptions, mappings/count tested | PASS locally |
| User-approved three-account roster | User confirmed three names/handles and supplied their emails in table order | Approved identity manifest, guarded seed and private operator tool | Three-account onboarding and security-state preservation tested | PASS locally |
| Account count acceptance | User explicitly superseded the original five-account wording with three | Evaluate against the three approved identities only | Count is resolved; no additional identities required | APPROVED |
| Five operational modules | All five already installed with valid reference labels | Insert missing modules only; preserve existing labels and associations | Empty-catalogue and existing-data scenarios tested | PASS |
| Preserve active/revoked permissions | Existing FK is non-deferrable NO ACTION | One-to-one code update with transaction-local deferral; restore exact FK definition | All associations including revoked/deleted-user rows compared by user/action/state; no orphans | PASS |
| Existing Developer compatibility | DEV-07/08 runtime loads codes dynamically | No Developer edits; add independent consumer test | All 18 new codes tested through rights API/navigation/requireRight; old codes fail closed | PASS within inspected consumers |
| Repeatable safe seed | No seed migration | BEGIN/COMMIT, locks, conflict checks, stable unique keys | Exact rerun produces no data/audit changes; injected failure restores all data/FK state | PASS |
| Preserve credentials/security/audit history | Must remain untouched | No account, session, token or historical-audit UPDATE/DELETE | Original-row digests unchanged; reconciliation EDITs and the three approved account ADDs are intentional | PASS |
| Secure onboarding | Existing private proof/first-login flow works | Per-account expiring private proofs; no email-only claim, shared password or credential reset | All three seeded identities completed first login; replay and seed reruns rejected/preserved appropriately | PASS locally |

## Exact rights reconciliation

All semantic descriptions and module assignments were compared against DBA-03,
the actual local tables, issue #47, the existing verifiers and Guide §3.8.
The following 18 mappings are one-to-one; the other 18 codes are unchanged:

| Existing code | Required issue code | Module |
| --- | --- | --- |
| department.add | dept.add | human_resources |
| department.edit | dept.edit | human_resources |
| department.delete | dept.delete | human_resources |
| employee.add | emp.add | human_resources |
| employee.edit | emp.edit | human_resources |
| employee.delete | emp.delete | human_resources |
| job_history.view | jobhistory.view | human_resources |
| job_history.add | jobhistory.add | human_resources |
| job_history.edit | jobhistory.edit | human_resources |
| job_history.delete | jobhistory.delete | human_resources |
| sale_detail.view | saledetail.view | sales |
| sale_detail.add | saledetail.add | sales |
| sale_detail.edit | saledetail.edit | sales |
| sale_detail.delete | saledetail.delete | sales |
| report.product_master_list | report.product_master | reports |
| report.active_employees | report.active_emp | reports |
| report.all_employees | report.all_emp | reports |
| report.employee_job_history | report.emp_job_history | reports |

`customer.delete` now uses the issue's exact `Delete Customer (Soft delete)`
caption. Other right descriptions retain the same meanings. Module labels
Customer/Product/Sales remain valid existing labels, as requested; missing rows
receive Customer Management/Product Management/Sales Management. Existing valid
labels are not overwritten merely to change presentation wording.

## Migration strategy and preservation guarantees

`supabase/migrations/20261119060000_dba05_catalogue_seed.sql`:

1. Starts a transaction with a five-second lock timeout; uses the established
   account-change advisory lock and table locks to serialize catalogue changes
   against DEV-06/07 mutations. Busy deployment can fail and roll back for retry.
2. Declares an explicit 36-row old-to-issue mapping. Detects unknown/disabled
   rights, wrong module/description, old/new duplicates and unexpected FK
   dependants rather than guessing how to merge them. Does not reactivate rows.
3. Inserts only missing modules, preserving valid existing rows.
4. If old codes remain, temporarily makes only the verified right-code FK
   deferrable, defers it in this transaction, updates the existing catalogue rows
   and every affected user_permission row, forces immediate validation and
   restores NOT DEFERRABLE. No FK or audit trigger is disabled. The exact original
   FK definition and the entire schema dump are unchanged after commit.
5. Inserts missing approved rights; applies the Customer soft-delete caption;
   verifies five modules, exact 36 active issue rights and no orphan assignments.
6. Provisions only the three explicitly approved identities below, using private
   setup digests/expiry supplied transaction-locally. Existing matching
   Superadmins are never reset, reactivated or renamed. An existing conflicting
   role/identity fails for manual review instead of being promoted silently.
   No DELETE/TRUNCATE, duplicate aliases, permanent schema redesign or previous
   migration edits are used; existing session/reset-token rows remain untouched.

Original permission user_id and is_deleted values are preserved, including
revoked rows and associations for deleted accounts. Only identifiers and their
normal audit stamps change during reconciliation. Existing DBA-03 triggers
append one EDIT per changed row; historical events retain their original code
snapshots and are never rewritten. A rerun emits no additional audit events.
No DBA-06 audit functions are installed or modified by this migration.

## Developer compatibility and rollout boundary

Inspected DEV-07 src/users/rights-service.js builds catalogue groups and allowed
codes from the DB. DEV-08 src/rbac/service.js loads granted codes via joins;
requireRight(code) checks exact catalogue membership. Searches of runtime source,
frontend and tests found no use of the 18 legacy spellings. DEV-08 documentation
contains a job_history.view example, now superseded by jobhistory.view; that
Developer documentation correction is deferred, not mixed into this DBA PR.

The test-only dba05-compatibility.cjs imports unchanged consumer code from a
detached checkout of DEV-08 commit 949df63. Each of the 18 new codes was granted,
retrieved, shown in navigation, allowed by real middleware, revoked and then
denied. Old spellings were rejected by middleware and by rights assignment;
restoration and exact audit counts also passed. No code translation/alias layer
or additional catalogue records are necessary for these inspected consumers.

**Rollout boundary:** right-code identifiers intentionally change. Reload open
rights forms after deployment; stale requests using old codes return validation
errors rather than granting a different action. Coordinate deployment with
clients that cache catalogue identifiers. Compatibility is verified for the
current inspected runtime, not a promise that unknown external integrations can
continue submitting old spellings.

## Approved roster and secure first-login assessment

The user approved **three** initial Superadmins and supplied these emails in the
same order as the documented roster. No fourth/fifth identity is invented:

| Handle | First name | Last name | Approved account email |
| --- | --- | --- | --- |
| drichagustin3 | Aldrich Rodolf | Agustin | drichagustin.3@gmail.com |
| AshleyNicoleMarticio30 | Ashley Nicole | Marticio | nicsmolina03@gmail.com |
| rickysanglay | Ricky Joe | Sanglay | rickyjoesanglay56@gmail.com |

The public identity manifest is database/seeds/dba05-superadmins.json and matches
the migration's explicit roster. The user explicitly instructed treating the
requirement as changed to three accounts and ignoring the earlier five-account
wording for now. Three is the effective acceptance count; no count discrepancy
blocks review. The GitHub issue text itself has not been edited.

app_user uses required first_name/last_name/normalized unique email and a text
role FK. New approved accounts are active, unblocked Superadmins with NULL
password_hash, must_change_password=true and an individually generated expiring
setup proof. The existing DEV-03 flow requires that proof before restricted
password setup, bcrypt-hashes the new password, consumes the proof and rejects
replay. Knowing an email alone cannot claim the account.

Existing approved emails must already have the expected identity and Superadmin
role, or the transaction fails for review. Existing passwords, proofs,
approval/block/deleted state and session versions are never overwritten. An
unavailable existing account stays unavailable; seeding is not an unblock or
credential recovery operation.

### Operator workflow

Use an authorized target and explicit PostgreSQL connection configuration. No
.env is currently configured in this workspace and no shared deployment was run.

```sh
PGHOST=/authorized/socket PGPORT=... PGUSER=... PGDATABASE=hopedb \
DBA05_ALLOW_PROVISION=1 node database/tools/provision_dba05.cjs
```

The DBA-only operator tool uses the existing pg dependency; it changes no
application routes/services. It generates a cryptographic 32-byte proof per
missing approved account, binds only SHA-256 digests/one-hour expiries into a
transaction-local hope.dba05_setup setting, and runs the same migration within
that transaction. The migration refuses missing, expired, repeated or unapproved
proof configuration and leaves no partially seeded account.

Raw proofs are written before commit to a 0600 private delivery file in a 0700
unique temporary directory outside Git; the tool refuses a TMPDIR inside the
repository. It prints only the file path, never proof values or digests. It does
not send email. Deliver each proof only to its approved owner through a trusted
private channel after confirming commit; the owner enters their approved email
and setup proof in the existing login form, then sets their own password.
Generate proofs when owners are ready to use the one-hour window. Expired or
undelivered proofs require separately authorized recovery; rerunning the seed
never rotates existing credentials/proofs. Keep operator bind-parameter logging
private/disabled; never paste delivery files into issues, PRs or application logs.
If commit outcome is uncertain, retain the private artifact and review the DB
before retrying. Disposable test delivery artifacts are not deployment invites.

## Tests executed

Fresh PostgreSQL 16 isolated clusters used Unix sockets only, hopedb, codespace,
and NULL inet_server_addr(), with no shared/production writes. Schema recreation
included DBA-01–04 only, not unmerged DBA-06. Final migration/preservation tests
used port 55447; HTTP consumer tests used the identical migration on port 55445.

```sh
# Fresh disposable hopedb with merged DBA-01–04 applied; never a shared cluster.
PGHOST=/isolated/socket PGPORT=55447 PGUSER=codespace PGDATABASE=hopedb \
DBA05_ALLOW_LOCAL_TEST=1 python3 database/tests/run_dba05.py
```

The harness requires a fresh DB with no existing app_user records, creates
synthetic preservation fixtures and a separate empty-catalogue test database,
and provisions the three approved identities ONLY inside that disposable cluster
using test-generated digests. It leaves disposable records for inspection.
Rolled-back identity-sequence gaps are normal.

| Requested test | Result | Evidence / limit |
| --- | --- | --- |
| 1. Migration | PASS | Exact file applies; full schema unchanged; only intended row changes/audit additions |
| 2. Idempotency | PASS | Second run preserves full rights/permission/audit digests and credentials/security state |
| 3. Five modules | PASS | Existing labels preserved; empty-catalogue insert scenario creates exactly five |
| 4. Exact 36 rights | PASS | Issue verifier passes strict codes, caption/descriptions, modules, active state/count; no aliases |
| 5. Permission integrity | PASS | All 73 synthetic associations preserved by action/user/revoked state; no FK orphans |
| 6. Developer compatibility | PASS | 30 live HTTP/PostgreSQL tests: 29 existing DEV-03/05/06/07 regressions plus 18-code DEV-07/08 consumer coverage |
| 7. Three-account Superadmin provisioning | PASS locally | Exactly the approved three inserted; private per-owner proof, restricted setup, bcrypt, replay rejection and unchanged reruns tested |
| 8. Rollback | PASS | Controlled end-of-migration failure restores all table digests and FK/schema; ambiguous/conflicting/disabled rights rejected atomically |
| 9. Data preservation | PASS | Existing users, roles, modules, sessions, reset tokens and historical audit rows unchanged; permissions mapped one-to-one |
| 10. Git/PR scope | PASS | Only DBA-05 SQL/tests/docs; no DBA-06/Developer commits, prior migration edits or staged secrets |

An additional run directly from latest origin/main commit 1045371 passed all
13 authentication/user-management HTTP/PostgreSQL tests (zero failures/skips),
confirming compatibility with the newly merged DEV-05 implementation as well as
the separate DEV-07/08 consumer checkout.

The retained canonical verifier passes before reconciliation and intentionally
reports drift afterward. The issue-specific verifier is now the post-seed
acceptance check. This is an identifier-contract transition, not two competing
post-migration success conditions.

The full DEV-08 business metrics suite was NOT RUN because its independent
business-table soft-delete migration is absent from merged schema. Navigation
and exact-action middleware were tested over real HTTP without adding business
columns or changing Developer code. Shared deployment was NOT RUN; there is no configured shared target. Local
approved-identity onboarding is now tested, not blocked by missing roster data.

## Additional verification after roster approval

- **PASS:** full migration/preservation harness on fresh isolated PostgreSQL 16
  hopedb (Unix socket, port 55448), without DBA-06. New cases cover missing,
  expired, reused and unapproved proof configuration; original transactions,
  account credentials/security state and audits roll back or remain untouched.
- **PASS:** one real HTTP/PostgreSQL onboarding test on a separate fresh isolated
  hopedb (port 55449) exercised all three identities, the actual operator CLI,
  0600/0700 outside-Git artifacts, no email-only claim, restricted sessions,
  bcrypt password setup, proof replay rejection, and no-op settled-account reruns.
- **PASS:** operator refuses a TMPDIR inside Git before connecting.
- **PASS:** 13 latest-main authentication/user-management tests with the three
  seeded test accounts active. Then 30 DEV-03/05/06/07 plus DEV-08 compatibility
  tests passed again (zero failures/skips). For the latter suite only, the three
  disposable seeded identities were marked inactive so existing last-Superadmin
  tests could establish their own isolated active-account counts. No shared or
  genuine user credentials/security state was changed by these fixture steps.

## Final status

**READY FOR REVIEW against the approved three-account requirement.** The user
explicitly resolved the count, and no implementation/test blocker remains.
The user approved committing/pushing the follow-up and opening existing PR #55
for review; the original issue wording is not a blocker.
No shared deployment, emails, replacement PR or merge is included in this
publication. See S1-DBA-05-PR55-description.md for the current PR body.
