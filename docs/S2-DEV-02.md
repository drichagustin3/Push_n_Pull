# S2-DEV-02 — Customer create and edit form

Issue #73 remains the acceptance contract. Parent PR #91 is open; this task is
stacked on feat/S2-DEV-01-customer-list at bd3aa0d. Task branch:
feat/S2-DEV-02-customer-create-edit. User authorized implementation, tests, commit,
push and a separate stacked PR; no merge, shared schema/data change or invitation.

## Readiness: DBA BLOCKED, implementation reviewable

The user explicitly chose to retain the official 100-character name, five payment
terms and CREATED/EDITED stamp requirements. The current schema contract differs.
This PR DOES NOT claim those requirements work on shared Supabase. It supplies
safe implementation and tests against a clearly identified proposed target fixture.
The review PR stays draft pending DBA reconciliation and actual deployment checks.

| Contract | Current artifact | Required resolution |
| --- | --- | --- |
| Customer name <=100 | customer.custname varchar(20) | DBA migration widens to varchar(100) or text; app still caps at 100. |
| COD/Net 15/Net 30/Net 45/Prepaid | payterm varchar(3), pay_ck only COD/30D/45D | Proposed adapter: COD/15D/30D/45D/PRE; DBA must approve and extend CHECK to those five values, preserving existing COD/30D/45D data. |
| CREATED/EDITED full actor + timestamp | trg_set_stamp always writes ADD/EDIT, stamp varchar(60) | DBA-owned customer-only stamp behavior must use CREATED/EDITED; preserve existing DELETE/RESTORE/no-op semantics and other modules. Use text (preferred) or varchar >=284 for full actor. |
| Audited creates/edits | customer_aiu_audit -> trg_audit_log('custno') | Preserve one enabled unconditional audit writer and actual authenticated actor; ADD/EDIT audit_log actions remain compatible. |

The 15D/PRE storage adapter is a PROPOSED DBA contract, not an assertion that those
values are currently supported or a silently relabelled existing value. No term is
mapped to a different financial meaning. No input/stamp truncation is performed.
DBA review may choose another representation; coordinate the adapter and its tests
before merge if so. API/UI values always use the issue's five exact labels.

## Evidence that no existing migration solves the discrepancy

- DBA-02 creates custname varchar(20), address varchar(50), payterm varchar(3) with
  COD/30D/45D check. It excludes business soft-delete/stamp infrastructure.
- supabase/schemas/public/tables/customer.sql has the same name/payment limits,
  plus is_deleted/stamp and customer_biu_stamp/customer_aiu_audit triggers.
- trg_set_stamp.sql overrides client stamp on INSERT/UPDATE with audit_stamp(ADD/EDIT).
  audit_stamp.sql supports formatting any label but cannot override that trigger.
- The reference HopeDB_audit.sql.txt defines the legacy behavior, not the new issue
  contract. The full reference includes destructive drops and must not be replayed.
- Current DBA-03/04/05/06 migrations do not widen these customer fields or add the
  missing payment terms/customer-specific CREATED/EDITED semantics.
- The configured migration path still lacks the business soft-delete setup noted
  in parent PR #91. Schema snapshots are not automatically replayed as migrations.

Thus no safe application-only override satisfies the issue against the documented
current schema. A separate DBA-owned ordered migration is required. Do not modify
merged DBA migrations or disable auditing to get a green result.

## Exact DBA handoff (NOT executed against shared Supabase)

Prepare an independently reviewed additive migration that:
1. Confirms actual columns, constraints, existing data, triggers and dependent views.
2. Preserves data/IDs and makes the customer soft-delete/stamp prerequisites
   reproducible on fresh databases, without replaying destructive reference SQL.
3. Widens custname to at least 100 and stamp to text/preapproved sufficient length.
   Account for dependent customer_active/other views; do not blindly ALTER types,
   DROP ... CASCADE, or lose grants/security options when managing dependencies.
4. Extends the existing payment CHECK to include approved 15D and PRE storage codes,
   leaving COD/30D/45D unchanged. Validate old/new rows and retain the payterm API mapping.
5. Provides customer-only CREATED/EDITED stamps with full audit_user() identity and
   Asia/Manila YYYY-MM-DD HH12:MI AM format. A dedicated public.customer_set_stamp()
   on customer_biu_stamp is supported; preserving a compatible trg_set_stamp() is
   also supported. Do not change unrelated entities' stamp contracts accidentally.
6. Keeps no-op saves unchanged, DELETE/RESTORE semantics for later tasks, one
   customer_aiu_audit AFTER INSERT/UPDATE (or I/U/D) audit trigger, existing append-only
   audit history protections and the ADD/EDIT audit action vocabulary.
7. Verifies live grants/RLS/Data API exposure and runtime role privileges separately.
8. Tests migration rerun/rollback, full length, every payment value, correct actor,
   stamps, audit old/new values, no duplicates and dependent-view preservation.

No migration SQL is committed here; the isolated fixture in the test is explicitly
NOT a deployment script. Do not run tests or the fixture against shared databases.

## API and security

POST /api/customers accepts only {custNo,custName,address,payTerms}; returns 201.
PUT /api/customers/:custNo accepts only {custName,address,payTerms}; returns 200.
Number is immutable on edit, required on create, <=5 characters. Name is required,
<=100, address optional <=50. Trim text; reject controls, structured/unknown fields,
unsupported terms and client status/stamp/actor injection with 400. Duplicates,
including archived records, return 409; missing/archived edit target returns 404.

Reuse requireRight(customer.add/customer.edit) and existing privileged-role behavior.
Require exact Origin, JSON media type and HTTPS when configured. Recheck actor,
account/session version, active role/module/right and grant inside a transaction;
use row locks and transaction-local set_config(app.username, authenticated email).
All customer values are query parameters. Never trust client-supplied actor/role.

Preflight verifies name/stamp storage and the enabled known unconditional stamp/
audit coverage. Current incompatible schema gets 503 with no committed rows/audit.
An outdated payment constraint or incorrect returned CREATED/EDITED stamp also
fails safely with rollback. No triggers are disabled or audit entries manually
fabricated. Database details, credentials and stack traces do not reach clients.
No-op updates preserve original stamp and emit no duplicate audit.

User responses keep the parent metadata restrictions. Admin/Superadmin responses
may include status/stamp. No customer delete/restore, contact/email columns,
product functionality or new right code is introduced.

## Frontend

Native dialog forms integrate with the existing customer list. Add/Edit controls
are enabled only for the corresponding effective rights and remain disabled if
the editor enhancement is unavailable. Delete/Restore remain disabled placeholders.
Edit prefill uses the parent list record and maps approved storage codes to labels.
Number is disabled on edit; save/cancel prevent duplicate saves; Escape is guarded
while saving. Native required/length checks and server error feedback are present.
Success closes/resets the form and refreshes the parent list. A current search/
status filter is preserved, so a new active record may not match the visible filter.
401 redirects; 403 clears form and refreshes authorization. A network/ambiguous
response warns that a retry may encounter a duplicate; no automatic retry occurs.

## Verification and acceptance

Run on Windows (existing authorized local config; no shared seeding):

```powershell
node --test test/customer-write.test.js test/customer-editor-form.test.js test/customers.test.js test/customers-form.test.js
$tests = Get-ChildItem .\test\*.test.js | Where-Object { $_.Name -notlike '*-postgres.test.js' } | Sort-Object Name | ForEach-Object { $_.FullName }
node --test --test-concurrency=1 $tests
npm.cmd start
```

Codespaces-only isolated runners (ignore existing PG connection credentials,
create a new private Unix-socket cluster, TCP disabled, stop in finally):

```bash
python3 database/tests/run_customers.py
python3 database/tests/run_customer_forms.py
```

The forms runner installs existing audit function definitions from snapshots only
in its new cluster. The test first proves the CURRENT schema fails safely, then
installs a TARGET-CONTRACT fixture for successful-write assertions. A missing-audit
catalog result is injected by the test adapter; no audit writer is disabled/dropped.
A temporary additional failure trigger proves audit-insert failure rolls back the
customer; it does not replace existing audit writers. No proof/invite generation.

The parent list regression retains all listing coverage. Its superseded assertion
that POST is absent was removed now that DEV-02 owns POST; unsupported collection
PUT/DELETE remain rejected. Other parent tests and its source history remain intact.

Acceptance matrix:
- Forms/validation: implemented; unit/browser target-contract checks PASS. Actual
  shared database acceptance BLOCKED by schema contract and unexecuted deployment checks.
- POST/PUT operations with required stamps: target fixture PASS; current schema
  rejects safely, so actual database compatibility remains BLOCKED by DBA migration.
- Permission/audit verification: real authentication/rights/actor, before/after,
  no-op, rollback and audit failures tested in isolated database; shared verification
  NOT RUN. No falsely claimed migration or deployment success.

User has authorized committing/pushing and opening this draft stacked PR even with
these documented dependencies. Do not merge or mark the task complete until the
DBA dependency is resolved and reviewed actual-target verification passes.


## Actual results and review artifacts

- Focused unit/DOM + parent customer tests: 17 PASS, 0 FAIL/SKIP.
- Full non-PostgreSQL suite: 136 PASS, 0 FAIL/SKIP, includes those 17.
- Parent list isolated suite: 8 reported tests PASS, 0 FAIL/SKIP.
- Final forms isolated suite (pool max=1): 12 reported tests PASS, 0 FAIL/SKIP.
- Actual headless Chromium: 8 scenarios PASS, zero uncaught JavaScript errors.
- NOT RUN: Windows/Edge and deployed Vercel/Supabase; actual schema acceptance BLOCKED.

Logs: /tmp/s2-dev02-unit-tests.log;
/tmp/hope-customer-list-test-m5pfgrbz/customers-live.log;
/tmp/hope-customer-list-test-4hmej5dn/customers-live.log;
/tmp/hope-customer-list-test-2pwxzdqg/forms-browser.log.
Browser artifacts /tmp/s2-dev02-browser/evidence/ include create/edit, duplicate,
saved list, mobile dialog, dependency-error and forbidden screenshots, plus JSON
scenario results. No credentials, traces, session cookies or actual customer PII.
The browser harness runs outside Git; it uses existing real auth plus synthetic
accounts in the disposable target-contract database, never a production bypass.

After PR #91 merges, inspect its actual merge commit and ancestry before updating
this PR base to main. Verify the resulting diff excludes inherited DEV-01 changes;
use a safe merge strategy when needed, never force-push/rebase shared history.
