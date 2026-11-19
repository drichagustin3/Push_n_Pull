# S1-DBA-06 — Audit Trail Implementation

## Task and Git metadata

- Issue: [#48 — Audit Trail Implementation: audit_user() Context Function & audit_log Triggers](https://github.com/drichagustin3/Push_n_Pull/issues/48).
- Branch: `feat/S1-DBA-06-audit-trail-triggers`.
- Base: fetched `origin/main`, commit `b0f81e9`; PR target `main`.
- PR title: `[S1-DBA-06] Audit Trail Implementation: audit_user() Context Function & audit_log Triggers`.
- DBA-05 PR #55 is still an open draft. Its verification/seed work is not an audit
  dependency; none of its commits or files is included here.
- Local commit authorized to preserve this work; push and PR creation remain deferred.

## Issue review and acceptance comparison before implementation

Issue #48 had no comments, linked PR timeline entries or declared blocking issue
relationships at inspection. Its two acceptance criteria and the implementation
assessment recorded before SQL work were:

| Acceptance criterion | Existing behavior | DBA-06 approach |
| --- | --- | --- |
| Rights modifications produce a verifiable audit_log row | DBA-03 per-right triggers already emit ADD/DELETE/RESTORE; DEV-07 does not write explicit audit rows | Preserve one event per real mutation; verify old/new values, actor, composite key, no-op suppression and failure atomicity |
| Target stamp includes current actor/time | Existing stamp triggers cover all five tables; DEV-07 deliberately touches app_user.stamp after actual rights changes | Preserve stamp/context functions and the deliberate account stamp touch; rerun HTTP rights tests |

**Specification discrepancy:** the issue's detailed proposed schema explicitly
lists id, performedBy, tableName, recordId, details, timestamp and example action
names such as CREATED/RIGHTS_UPDATED/BLOCKED. The merged PostgreSQL schema instead
uses audit_id, action_by, table_name, record_key, old_values/new_values, action_at,
and ADD/EDIT/DELETE/RESTORE. These literal names remain different. The user
explicitly approved preserving the merged contract while meeting the behavioral
requirements; this PR does not claim literal schema-name compliance or silently
rename columns. Maintainers should align the issue wording before closure.

## Audit Contract Alignment Report

| Concern | Reference / guide | Merged migrations and verified local schema | Preserved / implemented behavior |
| --- | --- | --- | --- |
| Actor function | audit_user() returns text | Same no-argument text signature | Unchanged |
| Setting | app.username | app.username | DEV-03/05/06/07 supply trusted email via set_config(...,true) in the mutation transaction |
| Actor type | Email or username | Text actor; app_user PK separately bigint | No numeric cast, invented user ID or competing context setting |
| Missing context | session_user fallback in reference | Same database-login fallback | Preserved as a database operation, not an authenticated app identity |
| Log columns | audit_id bigint identity; table_name varchar30; action varchar7; record_key varchar60; old_values/new_values jsonb; action_by varchar50; action_at timestamptz | Same columns; DBA-03 widens action_by to text | No schema/data rewrite |
| Actions | ADD/EDIT/DELETE/RESTORE | Same constrained values | Soft delete is DELETE; restore is RESTORE; hard DELETE where permitted also uses DELETE |
| Stamp | Action, actor, Manila local time | rbac_set_stamp()/rbac_30_stamp | Unchanged, including explicit DEV-07 account stamp touch |
| Writer | trg_audit_log(), explicit key arguments | rbac_write_audit(), hardcoded RBAC keys | New log_audit_event() discovers actual PK columns; old function retained for existing callers |
| Identity | Scalar/pipe-delimited composite keys | role_code, module_code, right_code, user_id, user_id + right_code | Same record_key encoding/order; unknown/secret/ambiguous/oversized keys fail closed |
| No-op | Compare values except stamp | Existing writer skips unchanged values except stamp | Same behavior; sensitive-only updates still generate an event without secret values |
| Redaction | Reference writes full JSON | DBA-03 strips password/setup fields | New audit_redact(jsonb) recursively scrubs credential-like fields in new events |
| Trigger coverage | Reference also covers business tables | Five Sprint 1 tables have one writer each | Replace only rbac_40_audit on those five tables; keep all other triggers |
| Deletion policy | Hard deletion blocked | Existing guards on five tables and audit_log | Guards unchanged; permitted hard DELETE tested only on disposable generic fixtures |

Guide §§2.3/2.4/3.8 were reviewed through the supplied Drive folder. Its account
schema is proposed, its stamps represent the latest action, and a separate log
retains history. The original reference SQL was inspected but never executed:
it begins with destructive DROP statements.

DBA-01 setup verification is empty; DBA-02 supplies operational tables. DBA-03
already establishes most audit/account/RBAC infrastructure. DBA-04 supplies the
password-reset token table, intentionally outside business audit coverage.
DBA-05 has not merged and supplies no dependency for this change.

## Implemented migration

`supabase/migrations/20261119070000_dba06_audit_trail.sql`:

1. Verifies the existing audit_user() return type, audit_log column types,
   approved table PKs and existing writer coverage before replacing anything.
   Rejects incompatible schemas, disabled/unexpected writers and overlapping
   known audit triggers; does not remove unrelated triggers.
2. Adds audit_redact(jsonb), an immutable recursive object/array scrubber.
3. Adds log_audit_event(), a generic invoker-rights AFTER ROW writer. It discovers
   PK columns from PostgreSQL metadata without dynamic value SQL and handles
   INSERT/UPDATE/DELETE, boolean is_deleted transitions and NULL-safe no-ops.
4. Rebinds the existing rbac_40_audit trigger names on the approved five tables
   to the new writer. An exact rerun leaves correct trigger OIDs untouched.
5. Wraps all DDL in BEGIN/COMMIT. No audit-history writes, table recreation,
   account/permission seeds, grants, ownership changes or prior migration edits.

| Table | PK / record_key | Coverage |
| --- | --- | --- |
| role | role_code | ADD/EDIT/soft DELETE/RESTORE |
| module | module_code | Same |
| rights_catalogue | right_code | Same |
| app_user | user_id | Same, with account secrets scrubbed |
| user_permission | user_id\|right_code | Grant/revoke/restore, exactly once per changed row |

All five retain hard-delete/truncate guards. There are no new triggers on
future domain tables, audit_log, auth_session or password_reset_token.

## Actor and security contract

A custom PostgreSQL setting is not proof of identity. A protected backend must
obtain the actor email from the trusted server session, revalidate it, begin a
transaction, set app.username locally, mutate using that same database client,
and commit/roll back before releasing the client. Existing Developer services
already do this; no new set_audit_user helper or audit_user replacement is needed.
Never set request actors at session level on pooled connections. Empty/missing
context uses the documented database login fallback; arbitrary text does not
cause numeric casting errors and does not establish an authenticated identity.

The scrubber normalizes JSON field names and removes fields containing password,
token, secret, credential, session or recoverycode, plus sid/sess/otp. It operates
recursively on objects/arrays for both OLD and NEW snapshots. The non-secret
must_change_password and session_version control fields are retained. Password
or token-only changes remain auditable, but no previous/new secret value is stored.
Sensitive PK fields are rejected before record_key is formed. Diagnostics do not
include key values. The writer rejects technical credential/history tables.

Future sensitive columns must follow these naming rules or extend the filter
with tests before generic trigger attachment. Arbitrary sensitive content in a
non-sensitive free-text field cannot be inferred by a key-based filter. Existing
historical rows remain immutable; this migration does not rewrite prior history.

The existing varchar30 table-name and varchar60 record-key limits are preserved.
Future migrations must review those limits and the pipe-delimited encoding; the
writer rejects incompatible identities rather than truncating or exposing them.
No SECURITY DEFINER escalation is introduced. Missing audit INSERT privileges or
other audit errors abort the business mutation in the same transaction.

## Executed testing and results

A new PostgreSQL 16 cluster under a unique /tmp/hope-dba06-pg.* directory uses
Unix sockets only on port 55446. Database hopedb, current_user codespace and NULL
inet_server_addr() were verified. DBA-01–04 applied successfully to a fresh DB;
no shared/production database or genuine user credentials were used. The earlier
task's temporary cluster was absent in this environment.

Run database verification with explicit isolated connection variables:

```sh
PGHOST=/path/to/isolated/socket PGPORT=55446 PGUSER=codespace PGDATABASE=hopedb \
DBA06_ALLOW_LOCAL_TEST=1 python3 database/tests/run_dba06.py
```

The harness applies the migration to the selected disposable DB. SQL fixture
rows, helper functions and temporary tables roll back; identity-sequence gaps
from rolled-back inserts are expected.

| Requested test | Status | Executed evidence |
| --- | --- | --- |
| 1. Migration execution/idempotency | PASS | Exact file applied twice; stable five trigger OIDs, identical rerun schema, unchanged existing audit history |
| 2. Actor attribution/pooling | PASS | Email attribution, transaction-local reset and authenticated HTTP transactions |
| 3. INSERT | PASS | Account/permission plus disposable module/catalogue rows; expected keys, NEW state, actor/time |
| 4. UPDATE/no-op | PASS | OLD/NEW assertions, NULL-safe no-op and stamp-only event suppression, all five targets exercised |
| 5. DELETE | PASS | Permitted delete on disposable generic fixture captures scrubbed OLD and NULL NEW; five-table guards still reject hard deletes |
| 6. Soft delete/restore | PASS | Permission/module/catalogue transitions; exactly one grant/revoke/restore event per mutation |
| 7. Secrets | PASS | Password/setup/reset/session/credential fields excluded, recursive nested/array assertions, sensitive-only updates retained, sensitive PK rejected |
| 8. Missing/malformed context | PASS | Empty fallback tested on actual mutation; nonnumeric text supported without casting errors; no fabricated app identity |
| 9. Transaction/audit failure | PASS | Injected end-of-migration division-by-zero rolls DDL back; mutation/audit rollback; live DEV-07 INSERT privilege failure aborts changes |
| 10. Permission compatibility | PASS | Real DEV-07 API grants/revokes/restores, no duplicates/no-op entries, concurrency, target stamps |
| 11. Sprint 1 regressions | PASS | 29 live PostgreSQL/HTTP tests after migration, zero failures/skips |
| 12. Git hygiene | PASS | Only five DBA-06 files; application/previous migrations untouched; no secrets staged |

Additional PASS checks: incompatible log schema and overlapping trigger writers
are rejected without persistent changes; function/trigger definitions unrelated
to the new writers are unchanged; rolled-back SQL fixtures preserve existing
users, roles, modules, rights and permission-state content digests.

A detached temporary checkout of DEV-08 commit 949df63 supplied existing
DEV-03/05/06/07 integration tests without adding any Developer commits here:

```sh
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
USERS_INTEGRATION=1 USERS_ALLOW_HOPEDB_TEST=1 \
SUPERADMIN_INTEGRATION=1 SUPERADMIN_ALLOW_HOPEDB_TEST=1 \
RIGHTS_INTEGRATION=1 RIGHTS_ALLOW_HOPEDB_TEST=1 \
node --test --test-concurrency=1 test/auth-postgres.test.js \
  test/users-postgres.test.js test/superadmin-postgres.test.js \
  test/rights-postgres.test.js
```

Both baseline and post-migration runs passed 29 tests. No application follow-up
was required for audit compatibility. NOT RUN: shared/production application of
this migration, which was neither requested nor authorized.

## Ready-to-paste PR description

### Summary

Strengthen Sprint 1 audit triggers while preserving the merged audit schema,
authenticated email context, actor stamps and existing audit history.

Closes #48

### Changes

- Add a transactional, repeatable DBA-06 migration with schema/trigger preflight.
- Add reusable actual-PK audit logging and recursive credential-field redaction.
- Replace only the five existing writer triggers; preserve stamp/link/session
  revocation triggers, hard-delete guards and callable legacy functions.
- Add rollback-only SQL verification and a local migration verification harness.

### Database Dependencies

DBA-03 supplies audit/account/RBAC objects. DBA-04 was present in regression
testing but is not changed. DBA-05 is not required; this PR targets main directly.
No account seeds, permission-code transition or prior migration edits are included.

### Audit Contract Alignment

Keep audit_user() RETURNS text, app.username, action_by, old_values/new_values,
and ADD/EDIT/DELETE/RESTORE. The user approved this compatible interpretation.
Issue #48's detailed literal column/action naming remains a documented discrepancy;
its behavioral criteria are tested, not falsely claimed as literal schema parity.
DEV-07 continues to rely on per-right triggers and explicit account stamp touch.

### Security Verification

Transaction-local trusted email attribution; recursive OLD/NEW secret redaction;
no-op suppression; safe PK validation; append-only history and deletion guards;
no privilege escalation. Audit errors roll back the associated business mutation.

### Testing Notes

PASS: migration apply/rerun, history preservation, stable trigger counts/OIDs,
injected transactional DDL rollback, schema/overlap rejection, all five targets,
composite keys, permitted DELETE, soft delete/restore, nested secret redaction,
no-op/NULL behavior and invalid-key rollback. PASS: 29 existing live
PostgreSQL/HTTP tests after migration, zero failures/skips. PASS: whitespace and
scope review. NOT RUN: deployment to shared/production database.

### Scope Confirmation

Only S1-DBA-06 migration, tests and documentation. No Node.js/frontend changes,
Developer commits, prior migration rewrites, seed changes or future module work.

### Deferred Tasks

DBA-05 initial-account roster and rights-code compatibility; future domain
migration attachment; S4-DEV-08 audit viewer. Maintainers should reconcile issue
#48's literal schema wording with the approved preserved contract.

## Readiness and publication

**READY FOR PR under the explicitly approved merged audit contract.** No
implementation/test blockers remain. The literal issue wording discrepancy is
disclosed above; shared deployment remains unperformed. Review and approval are
still required before push/PR creation; local commit is authorized and nothing has been published.
