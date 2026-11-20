# S1-DBA-06 — Logged-in audit user context

## A. Issue and dependency verification

Repository: https://github.com/drichagustin3/Push_n_Pull.
Issue: [#48](https://github.com/drichagustin3/Push_n_Pull/issues/48).
Its actual title remains `[S1-DBA-06] Audit Trail Implementation: audit_user() Context Function & audit_log Triggers`.
The issue has no comments, linked PR timeline entries or declared blocking-issue
relationships at inspection. Its two acceptance criteria are:

1. Rights changes produce a verifiable audit_log row.
2. The target stamp contains the current actor and timestamp.

**Accepted contract clarification:** the issue's proposed camelCase columns and
CREATED/EDITED/RIGHTS_UPDATED example actions differ from the merged reference
schema. The user previously approved keeping action_by, old_values/new_values
and ADD/EDIT/DELETE/RESTORE. Literal schema-name parity is not claimed. This
clarification has not been posted to the GitHub issue by this task.

PR #55 remains OPEN and unmerged. Its approved roster contains three identities;
shared deployment is not assumed from local testing or the user's Windows-local
provisioning. The latest instructions explicitly require stacking DBA-06 on
`feat/S1-DBA-05-seed-superadmins-modules-rights` while #55 remains open.

The saved local DBA-06 commit 1024b54 was preserved. Its branch was renamed from
feat/S1-DBA-06-audit-trail-triggers to the required
`feat/S1-DBA-06-audit-user-context`, then DBA-05 head 45fd999 was safely merged
without rebasing, force-pushing or discarding work. No second DBA-06 PR exists.
The intended review base is the DBA-05 branch, not main while the stack is open.

## B. Implementation and audit contract

### Alignment inspected before changes

| Contract | Reference/current implementation | DBA-06 behavior |
| --- | --- | --- |
| Actor resolver | public.audit_user() RETURNS text, no arguments | Preserve signature/OID/owner/grants; normalize and safely bound context |
| GUC | app.username | Same setting; no app.current_user_id/hope.audit_user alternative |
| Actor representation | Authenticated email/username; app_user.user_id is separately bigint | Keep text; no numeric cast or invented application ID |
| Missing context | Reference/DBA-03 explicitly fall back to SESSION_USER | Same database-operation fallback; never claim this is an authenticated ERP account |
| Empty/malformed | Empty fallback existed; arbitrary text otherwise accepted | Trim outer spaces; empty, control-character and >254-character context safely falls back |
| Non-email text | Reference permits username text | Valid bounded usernames remain supported; no unnecessary app_user lookup |
| Audit schema | audit_id bigint identity, table_name varchar30, action varchar7, record_key varchar60, old_values/new_values jsonb, action_by text, action_at timestamptz | Unchanged |
| Action vocabulary | ADD/EDIT/DELETE/RESTORE | Unchanged; is_deleted transition uses DELETE/RESTORE; status-only changes remain EDIT |
| Stamp | rbac_set_stamp() with actor/time in Asia/Manila | Unchanged; preserve intentional DEV-07 account stamp touch |
| Existing writer | DBA-03 rbac_write_audit(), RBAC-specific keys | Retain callable legacy function; bind existing writers to reusable log_audit_event() |
| No-op | Ignore stamp-only differences for audit purposes | Same NULL-safe no-op policy; secret-only changes still produce scrubbed events |
| Trigger coverage | Five Sprint 1 tables, one rbac_40_audit per table | Same five targets; no duplicate writers or future-table attachment |
| Hard DELETE | Existing guards prohibit it on all five tables | Preserve guards; generic permitted DELETE tested only on disposable fixtures |

The original reference SQL and Guide §§2.3/2.4/3.8 were reviewed in this conversation:
the guide calls its account layout a proposed starting point, stamps describe
latest actions, and full history belongs in a separate log. The reference's
DROP statements were never executed. DBA-01 is empty, DBA-02 supplies business
fixtures, DBA-03 supplies RBAC/audit/session infrastructure, DBA-04 supplies
reset-token infrastructure, and DBA-05 supplies the reconciled 36-right catalogue.
No prior migration is rewritten.

### Verified backend identity path

Existing backend code already does the necessary integration:

1. requireSession validates the server session, current app_user status and
   session_version; it refreshes identity from PostgreSQL.
2. DEV-05 withManagedUser checks out one client and begins a transaction, locks
   and revalidates the actor, then sets app.username to the database actor email
   using parameterized set_config(...,true).
3. DEV-06 and DEV-07 reuse that helper. Mutations and triggers execute on that
   same checked-out client before COMMIT/ROLLBACK and release.
4. DEV-03 password setup and DEV-04 password reset also use their verified
   current account email in the same transaction.

No backend changes or extra setter/middleware were necessary. These services
were inspected on the existing Developer consumer branch and tested from an
isolated detached checkout; their commits are not added to this DBA PR.

### Security boundary

A custom GUC is not authentication. A caller holding the trusted database role
could set arbitrary text, including another known email. This function does not
turn that text into a verified identity. Only the protected backend may derive
context from authenticated server-side state; never accept actor IDs/emails from
request bodies. The new HTTP test rejects such a body override and checks the
actual authenticated actor instead. Do not use session-level SET for pooled
HTTP requests; the function cannot infer whether an arbitrary SQL caller used
SET or SET LOCAL. Correct transaction-local setting is enforced by the reviewed
backend integration and verified by same-connection tests.

No-context system operations retain the explicit SESSION_USER fallback. Invalid
context means empty/oversized/control-containing text under this established
text contract, not failure to parse a bigint or a speculative database account
lookup. Existing valid usernames and normalized emails remain compatible.

### Migration and scrubbing

`supabase/migrations/20261119070000_dba06_audit_trail.sql` executes BEGIN/COMMIT,
checks existing schema/PK/trigger contracts, updates audit_user() compatibly,
adds reusable audit_redact(jsonb)/log_audit_event(), and rebinds only the five
existing rbac_40_audit triggers. An exact rerun keeps correct trigger OIDs.

The writer discovers actual PK columns and preserves scalar/pipe-delimited
record_key order. Missing, sensitive, ambiguous or oversized identities fail
without including their values in error messages. Existing table-name/key
length limits remain; future attachments must review them first. It never
attaches itself to audit_log, session or password-reset tables. No privilege
escalation or SECURITY DEFINER is introduced, and audit insertion errors abort
the associated mutation.

OLD and NEW snapshots recursively omit password/token/secret/credential/session/
recovery-code fields and sid/sess/otp, including nested objects/arrays. Safe
must_change_password/session_version metadata remains. Actual account password
and setup-field updates and permitted fixture DELETE snapshots are tested.
Future sensitive columns with different naming must extend the redaction policy
with tests before trigger attachment; free-text secrets cannot be inferred by a
key filter. Existing historical rows are preserved, not rewritten.

| Target | Record key | Events |
| --- | --- | --- |
| role | role_code | ADD/EDIT/soft DELETE/RESTORE |
| module | module_code | Same |
| rights_catalogue | right_code | Same |
| app_user | user_id | Same; account secrets scrubbed |
| user_permission | user_id\|right_code | Exactly one event per actual grant/revoke/restore |

## C. Actual testing and evidence

Environment: fresh private Codespaces PostgreSQL **16.15**, database hopedb,
role dba06_test, port 55452, private Unix socket, listen_addresses empty and
inet_server_addr() NULL. Data directory was verified under the newly created
private /tmp/hope-dba06-context-pg.* directory. No Windows/shared target was used.
Python assertions remained enabled. No real invitation tool was invoked.

Prerequisites DBA-01–04 were applied only to this new empty cluster. Then the
unchanged DBA-05 runner executed all nine groups successfully before DBA-06,
using fixture digests only. DBA-06 cannot be installed before that runner because
its existing safety guard prohibits DBA-06; that safeguard was not bypassed.
After installation, the actual DBA-05 seed rerun, catalogue checks and complete
fixture-state digests passed under DBA-06.

Exact connection environment used (local test values, no password):

```sh
export PGHOST=/tmp/hope-dba06-context-pg.01r84_dc/socket
export PGPORT=55452
export PGUSER=dba06_test
export PGDATABASE=hopedb
export PGSSLMODE=disable
```

Commands used, with that verified isolated environment set:

```sh
DBA05_ALLOW_LOCAL_TEST=1 python3 database/tests/run_dba05.py
DBA06_ALLOW_LOCAL_TEST=1 python3 database/tests/run_dba06.py
DBA06_CONTEXT_INTEGRATION=1 DBA06_APP_ROOT=/tmp/hope-dba06-consumers-j9dz50qq \
  node --test database/tests/dba06-context.cjs
```

The consumer checkout was detached at commit d2132fe on the existing DEV-08
branch; node_modules was reused without changing any package/lockfile. The
focused context file passed **6 tests, zero failures/skips**. Its Pool(max:1)
checks one physical backend PID across two separately authenticated Admin
sessions and actual API mutations. Fixtures are synthetic @example.test
accounts, not the Windows users' credentials.

Full integration command from that isolated consumer checkout:

```sh
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
USERS_INTEGRATION=1 USERS_ALLOW_HOPEDB_TEST=1 \
SUPERADMIN_INTEGRATION=1 SUPERADMIN_ALLOW_HOPEDB_TEST=1 \
RIGHTS_INTEGRATION=1 RIGHTS_ALLOW_HOPEDB_TEST=1 \
RESET_INTEGRATION=1 RESET_ALLOW_HOPEDB_TEST=1 \
DBA06_CONTEXT_INTEGRATION=1 DBA06_APP_ROOT=/tmp/hope-dba06-consumers-j9dz50qq \
node --test --test-concurrency=1 test/auth-postgres.test.js \
  test/users-postgres.test.js test/superadmin-postgres.test.js \
  test/rights-postgres.test.js test/password-reset-postgres.test.js \
  /workspaces/Push_n_Pull/database/tests/dba06-context.cjs
```

Result: **46 tests PASS, zero failures/skips**. Password-reset mail was captured
by a local test SMTP server for synthetic accounts; no external email or real
invitation delivery occurred. Disposable DBA-05 fixture accounts were made
inactive only to let existing last-Superadmin tests establish their own active
account counts. No roster source, Windows account or shared data was modified.
The SQL migration/preservation harness was rerun afterward and passed again.
A final read-only check confirmed unset-context and initial system INSERT actor
fallbacks. The isolated cluster was then stopped; no test server remains running.

| Required test | Status | Executed verification |
| --- | --- | --- |
| 1. Migration once | PASS | Actual DDL execution after schema/coverage preflight |
| 2. Migration twice | PASS | Exact rerun, stable five trigger OIDs, preserved history/data/constraints |
| 3. User A INSERT | PASS | Actual authenticated API account creation; stored ADD, actor email, NEW snapshot/stamp |
| 4. User A UPDATE | PASS | API edit with correct OLD/NEW, actor, stamp; no duplicate/no-op row |
| 5. User A DELETE | PASS | Permitted temporary-fixture hard DELETE; committed scrubbed OLD and NULL NEW. Sprint 1 guards remain enforced |
| 6. User B mutation | PASS | Separately logged-in B edit/grant/revoke recorded as B, not A or service role |
| 7. Pooled connection reuse | PASS | Pool max1, same backend PID, exactly one connection, fallback restored after each request |
| 8. No context | PASS | Actual system mutation attributed to documented database fallback |
| 9. Empty/malformed context | PASS | Empty/whitespace/control/oversized fallback; bounded nonnumeric usernames accepted without casts |
| 10. Password hash change | PASS | Real first-password API mutation by synthetic target; bcrypt verified, both snapshots scrubbed |
| 11. Other secrets | PASS | Account setup fields, nested objects/arrays and DELETE snapshots scrubbed |
| 12. No-op update | PASS | Same profile, NULL-safe equality and stamp-only touches create no audit event |
| 13. Soft delete | PASS | Correct DELETE/RESTORE with old/new is_deleted state; no duplicate logical events |
| 14. Forced failure | PASS | Post-mutation division-by-zero rolls data/log/context back; separate DDL failure restores schema |
| 15. DBA-05 regression | PASS | All nine unchanged pre-DBA-06 groups; after DBA-06 actual seed rerun/catalogue/state preservation |
| 16. Scope/hygiene | PASS | Task-only stacked diff, unchanged roster/previous migrations, no secrets staged, whitespace checks |

Schema/overlapping-trigger rejection, unchanged unrelated functions/triggers,
audit_user signature/OID/owner/grants preservation and real audit-permission
failure rollback also passed. There were no unexpected test failures.

Logs are private temporary artifacts, not repository files:
- /tmp/hope-dba06-context-pg.01r84_dc/run_dba05.log
- /tmp/hope-dba06-context-pg.01r84_dc/run_dba06.log
- /tmp/hope-dba06-context-pg.01r84_dc/dba06-context-http.log
- /tmp/hope-dba06-context-pg.01r84_dc/sprint1-audit-regressions.log
- /tmp/hope-dba06-context-pg.01r84_dc/dba06-final-sql.log

## D. Git and PR readiness

Branch: `feat/S1-DBA-06-audit-user-context`.
Intended base while #55 is open: `feat/S1-DBA-05-seed-superadmins-modules-rights`.
Mandatory title: `[S1-DBA-06] Make audit_user() record the logged-in user in audit_log; test it`.
Ready-to-paste body: S1-DBA-06-PR-description.md (includes Closes #48).

Files added relative to that stacked base:
- supabase/migrations/20261119070000_dba06_audit_trail.sql
- database/tests/run_dba06.py
- database/tests/validate_dba06_audit.sql
- database/tests/validate_dba06_generic.sql
- database/tests/dba06-context.cjs
- docs/S1-DBA-06.md
- docs/S1-DBA-06-PR-description.md

The saved DBA-06 history is preserved and the inherited DBA-05 commits are not
represented as new task changes. No application implementation, dependency,
roster/environment/credential file, original migration or unrelated feature is
changed by this task. Local DBA-06 changes remain reviewable; no push, new PR,
merge to main, issue edit or deployment was performed.

## E. Remaining risks and approval gates

- Windows PostgreSQL 18.6, Windows filesystem permissions and actual logged-in
  Windows account mutations: **NOT RUN**. Codespaces test results do not prove
  Windows execution. Shared/production deployment and real invitations: **NOT RUN**.
- PR #55 must merge before final retargeting to main. Recheck its state, safely
  incorporate merged main and review the new base diff; do not force-push or
  combine task changes. Current preparation is intentionally stacked.
- Custom GUCs rely on the trusted backend/database-role boundary; they cannot
  stop a compromised trusted SQL caller from impersonating actor text. Keep
  browser credentials unable to write protected tables, and never use a
  request-body actor or session-level context for pooled requests.
- Retained record-key length/encoding and maintained redaction conventions must
  be reviewed when future DBA migrations attach auditing to other tables.
- Reviewer approval, code publication, Windows-local mutations and deployment
  need their respective authorization. No real account password is changed here.

Optional Windows **read-only inspection** (not executed by Codex), from PowerShell:

```powershell
$HopeDbUser = Read-Host "PostgreSQL username"
$HopeInspection = @'
BEGIN READ ONLY;
SELECT current_database(), current_user, current_setting('server_version');
SELECT pg_get_function_result('public.audit_user()'::regprocedure);
SELECT audit_id, table_name, action, action_by, action_at
FROM public.audit_log
WHERE table_name IN ('app_user','user_permission')
ORDER BY audit_id DESC LIMIT 10;
COMMIT;
'@
$HopeInspection | & "C:\Program Files\PostgreSQL\18\bin\psql.exe" `
  -h 127.0.0.1 -p 5432 -U $HopeDbUser -d hopedb -W -X -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Read-only audit inspection failed." }
```

This reveals audit metadata only, not row JSON containing historical credentials.
Do not run the mutation harnesses against Windows hopedb or apply DBA-06 there
without separate approval.

## F. Final assessment

**READY FOR REVIEW as a stacked DBA-06 change.** Implementation and required
local pre-PR checks pass. No technical blocker remains under the approved merged
audit contract; Windows execution and deployment are explicitly unverified.
No real invitations have been generated by this task.
