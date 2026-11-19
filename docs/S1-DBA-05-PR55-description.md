## Summary

Complete S1-DBA-05 for the user-approved **three initial Superadmins**, five
modules and exactly 36 issue-required granular rights, preserving existing data
and first-login security.

Related issue: #47. **The approved acceptance requirement is three accounts.**
The user explicitly superseded the original five-account wording; no additional
identities or count-related changes are required. Publication and opening this
existing PR for review have been approved.

**Publication scope:** this PR includes the tested seed migration, operator
tooling and verification follow-up. No shared deployment or invite email has
been performed.

## Changes

- Add a transaction-safe, idempotent seed migration for five modules and exactly
  36 active issue-required rights.
- Reconcile the 18 differing identifiers one-to-one in catalogue/permission rows;
  preserve granted/revoked state, historical audits and the exact original FK.
- Add the approved three-person identity manifest and secure new-account seed.
  Existing matching accounts keep their credentials/security state; conflicting
  identities/roles fail for review rather than being silently promoted/reset.
- Add a DBA operator tool that supplies per-account digest/expiry transactionally
  and stores raw proofs only in a 0600 file outside Git. No email sending or
  plaintext/shared passwords; the existing ownership-verified first-login flow
  sets each owner's bcrypt password and consumes the proof once.
- Add migration, conflict/rollback/preservation, consumer compatibility and actual
  three-account onboarding verification; preserve the initial inspection report.

## Database Dependencies

Requires merged DBA-03 and its existing audit/link/soft-delete protections.
DBA-04 is included in preservation/authentication regression tests.
No DBA-06 changes, Developer implementation edits, old migration rewrites or
unrelated Sprint 2 structures are included. The operator CLI is a DBA tool, not
an application behavior change.

## Testing Notes

Executed in isolated local PostgreSQL 16 hopedb databases matching DBA-01–04:

- **PASS:** migration application/rerun, five modules, exact 36 issue codes,
  descriptions/mappings and active count; no duplicate aliases.
- **PASS:** all 73 synthetic active/revoked/deleted-user associations preserved
  one-to-one; no FK orphans; original FK/schema restored.
- **PASS:** original account/security/session/reset-token/historical-audit data
  preserved; rerun makes no additional changes/audit entries.
- **PASS:** end-of-migration rollback and duplicate/conflicting/disabled-code
  rejection; missing/expired/reused/unapproved setup proofs fail atomically.
- **PASS:** exactly three approved identities provisioned; no fabricated users,
  existing-role promotion, credential reset or blocked-account reactivation.
- **PASS:** dedicated actual operator/HTTP/PostgreSQL onboarding test for all
  three accounts: private artifact permissions, no email-only claim, restricted
  setup, bcrypt storage, replay rejection and settled-account rerun preservation.
- **PASS:** 30 existing/targeted consumer HTTP/PostgreSQL tests, plus 13 tests
  directly from latest main; zero failures/skips. Last-Superadmin fixture tests
  isolate active-account counts by deactivating only disposable seeded identities.
- **PASS:** operator rejects a private-artifact directory inside Git; whitespace
  and task-scope checks.
- **NOT RUN:** shared deployment, actual invite delivery and DEV-08 business
  metrics suite (independent business soft-delete migration is absent).

## Security Verification

New-account proofs are cryptographic, distinct, private and expiring; only their
SHA-256 digests/expiry reach the DB. Passwords are set by owners through existing
DEV-03. No password, proof, digest or session secret is added to Git/log output.
Existing account roles, credentials, block/status/deleted flags, proofs and
session state are preserved; historical audit records remain unchanged.

## Compatibility and Rollout

DEV-07/08 dynamically load catalogue codes; all 18 new spellings pass unchanged
consumer tests. No 54-right catalogue or legacy alias layer. Reload cached rights
forms after deployment; old-code requests fail closed. An old example in DEV-08
documentation is a separate Developer documentation follow-up.

The migration requires private proof configuration for missing approved accounts;
use the documented operator tool, not an unconfigured migration run. Generate
proofs when owners can use their one-hour window. Existing proof expiry/recovery
is not bypassed by rerunning the seed.

## Scope Confirmation

Only S1-DBA-05 seed, DBA operator tooling, tests and documentation in this existing
PR/branch. No DBA-06 or Developer-task functionality changes.

## Remaining Items

- No account-count blocker remains: the approved roster contains three accounts.
- Review and merge this existing PR through the normal approval process; no merge has been performed.
- Apply on an authorized shared target and deliver each private proof to its
  approved owner only after deployment approval. No actual invites have been sent.
