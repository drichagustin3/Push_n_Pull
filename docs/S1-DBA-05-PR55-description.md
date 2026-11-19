## Summary

Implement S1-DBA-05 for the officially accepted **three initial Superadmins**,
five functional modules and exactly 36 granular rights. Preserve existing
accounts, permission state, credentials and audit history.

Related issue: #47. The approved roster consists of `drichagustin3`,
`AshleyNicoleMarticio30` and `rickysanglay`. The JSON identity manifest and SQL
seed match exactly. The approved count is three; no additional identities are
required.

**Issue wording:** inspection confirmed issue #47 still says "All 5 team
members" and has no comments documenting the change. Exact approval wording is
prepared in the final-review section of S1-DBA-05-PR55-resolution.md. This review
has not edited the GitHub issue or posted that wording.

**Deployment status:** shared deployment, real Superadmin invitation generation
and invite delivery have not occurred. Isolated test records/digests are not
live team accounts or usable invitations.

## Changes

- Add a transactional, repeatable seed for five modules and exactly 36 active
  issue-required rights, inserting only missing valid records.
- Reconcile 18 code spellings one-to-one in rights_catalogue/user_permission;
  preserve granted/revoked state, original FK definition and historical audits.
  Reject ambiguous, conflicting, unknown or disabled catalogue records.
- Seed only the approved three identities with private, expiring setup proofs.
  Existing matching accounts retain credentials/security state; conflicting
  identities/roles fail for manual review instead of automatic promotion/reset.
- Add a DBA operator tool that binds setup digests/expiry transactionally and
  stores raw proofs only in a private file outside Git. It sends no email.
- Retain ownership-verified DEV-03 first login: a private proof establishes a
  restricted setup session, the owner sets a bcrypt password, and proof replay
  is rejected. No application code changes or authentication bypasses.
- Add isolated migration, conflict, rollback, preservation, consumer and onboarding
  tests, plus the verification and approval documentation.

## Database Dependencies

DBA-03 supplies the RBAC/account/audit objects. DBA-04 is included in the test
baseline and preservation checks. No DBA-06 changes or prior migration edits
are included. The operator CLI is DBA tooling, not application behavior.

## Testing Notes

**Current final-review rerun:** the unchanged run_dba05.py completed with exit 0
on a fresh private PostgreSQL **16.15** Unix-socket cluster, with TCP disabled,
DBA-01–04 applied, zero initial accounts, no DBA-06 function and all safety guards
enabled. The cluster was stopped after verification.

All nine reported groups **PASS**:

1. Duplicate, conflicting and disabled rights rejected atomically.
2. Missing, expired, reused and unapproved proof configuration rejected atomically.
3. Injected failure rolls back data, audit additions and FK changes.
4. Five modules and exact 36 issue rights/descriptions/mappings verified.
5. All 73 fixture permission associations and existing security/history preserved.
6. Exact migration rerun is a data/audit no-op; original FK restored.
7. Empty-catalogue seeding inserts missing records and exactly three approved identities.
8. Existing credentials/block/status/deletion state preserved; no silent promotion.
9. Approved three-person roster verified in the disposable database.

Both post-test read-only issue verifiers also **PASS** (hopedb and
hopedb_dba05_empty). Final diff, roster and whitespace checks **PASS**.

**Earlier regression evidence, not rerun in this review:** 30 HTTP/PostgreSQL
consumer tests, 13 latest-main authentication/user-management tests, and the
operator/three-account onboarding test previously passed. Those runs are
historical evidence, not new final-review executions.

**NOT RUN in this review:** operator/onboarding CLI, Windows PostgreSQL 18.6
execution, shared deployment, real proof generation, invitation delivery and
the independent DEV-08 business metrics suite. The current run uses fixture
digests only and creates no private delivery files.

## Security Verification

New setup proofs are cryptographic, per-account and expiring; only their SHA-256
digests/expiry enter PostgreSQL. Owners set passwords through existing DEV-03.
Existing roles, credentials, block/status/deleted flags, proofs and session
state are preserved. Audit history is immutable; reconciliation appends normal
audit entries. No passwords, raw proofs or private delivery files belong in Git.

## Compatibility and Rollout

DEV-07/08 dynamically load catalogue codes; earlier unchanged-consumer tests
cover all 18 spellings. No 54-right catalogue or alias layer is introduced.
Reload cached rights forms after deployment: old-code requests fail closed.
The old DEV-08 documentation example is a separate Developer follow-up.

Missing approved accounts require private proof configuration. Use the operator
tool only after target verification and provisioning approval. It preserves
existing proofs and does not renew expired invitations. Windows operator-file
permissions and PostgreSQL 18.6 execution have not been validated by this Linux
PostgreSQL 16 review.

## Scope Confirmation

Only S1-DBA-05 seed, DBA tooling, tests and documentation in this branch/PR.
No DBA-06, Developer-task implementation, business-schema or unrelated changes.

## Review Readiness and Deferred Actions

**READY FOR REVIEW against the officially approved three-account requirement.**
No implementation/test blocker was found in this final review. The GitHub issue
wording still needs its approval recorded; the prepared text has not been posted.
The older five-account wording is informational, not a blocker under the approved
three-account scope. Normal reviewer/merge approval remains outstanding. Publishing
these documentation updates is authorized. Shared deployment and real invitations
still require separate explicit authorization and target verification; neither
has occurred, and no merge or GitHub issue edit is included.
