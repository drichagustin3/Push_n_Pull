# S1-DBA-03 — RBAC schema migration

## Branch and preservation

Branch: `feat/S1-DBA-03-rbac-schema-migration`, based on fetched main 5601e38.
Separate worktree: `/workspaces/hope-dba-03`. The existing authentication branch
and its original 73286c7 commit are preserved in `/workspaces/Push_n_Pull`.
No remote push, PR creation/update, or Git merge is performed without user approval.

## Schema and scope

Migration: `supabase/migrations/20261116070000_dba03_rbac_schema.sql`.
Depends on merged DBA-02 (`20261114121000_dba02_base_tables.sql`) and PostgreSQL 15+
([security-invoker views](https://www.postgresql.org/docs/15/sql-createview.html)). It follows the baseline's `is_deleted` + `stamp` convention.
Approval `status` is independently constrained to pending/active/inactive.

- `role`: user/admin/superadmin codes, descriptions, soft delete, stamp.
- `module`: five Guide modules, soft delete, stamp.
- `rights_catalogue`: 36 stable per-action codes, module FK, soft delete, stamp.
- `app_user`: registration-compatible names/email/hash/text role FK; blocked flag,
  pending approval default, nullable employee FK, setup flag/token digest/expiry,
  session_version, soft delete, stamp.
- `user_permission`: composite user/right PK, both FKs, soft delete and stamp.
- `auth_session`: sid PK, JSON session, indexed expiry; explicitly authorized by
  the user as an additional supporting dependency. Technical rows are deletable.

There are five new RBAC FKs. Role values and column names preserve registration's
existing SQL. Password hashes accept bcrypt $2a$/$2b$ cost 12–31; unset hashes are
nullable for privately provisioned initial setup. Setup digests are 64 lowercase
SHA-256 hex characters, paired with an expiry. No passwords, tokens, accounts,
permission assignments, or superadmin identities are seeded.

The requested 36 rights and prerequisite catalogue rows are included explicitly
in this task; later DBA-05 account provisioning remains excluded. Distribution:
Customer 3; Product 6; Human Resources 13; Sales 7; Reports 7. Full codes are listed
in the migration. The five modules are distinct from the User Management screen.

Soft deletion is UPDATE is_deleted=true; restore sets it false. Active views
filter this flag. Hard DELETE/TRUNCATE are rejected for the five business/RBAC
objects. Parent soft deletion is blocked while non-deleted dependent rows exist.
Assignment/restore rejects deleted parents and locks parent rows to serialize
against deletion. Revoked permissions retain their composite key for restoration.

A monotonic session_version trigger revokes prior credentials when account email,
role, status, blocked/deleted state, password or setup credentials change. An
explicit version increment is not doubled. Blocking followed by unblocking cannot
revive an older session. Endpoint authorization and last-superadmin protection
remain Developer tasks; no auth routes or account-management APIs are included.

## Issue #19 / Guide mapping and discrepancies

Issue #19 uses illustrative camelCase columns, title-case roles, a `rights` table,
and an Active registration default. The master task explicitly requires pending
registration and rights_catalogue; merged registration uses snake_case, lowercase
roles, names up to 100 characters and email up to 254. The safe integration choice
is to preserve those working contracts rather than narrow fields or auto-approve
new registrations. Mapping: userId→user_id, firstName/lastName→first_name/last_name,
passwordHash→password_hash, isBlocked→blocked, roleName→role_code,
moduleCode→module_code, rightCode→right_code; rights→rights_catalogue.
The employee FK matches the actual employee.empno varchar(5). A text stamp supports
full actors. Nullable password hashes support token-proven first setup; non-null
values must be bcrypt hashes. The issue's permission status example maps to the
baseline's independent is_deleted flag rather than overloading approval status.
These differences are explicit review items, not an assertion that the older
issue examples are already the implemented database schema.

## Audit/security dependencies

The merged DBA-02 deliberately omitted the reference audit infrastructure, so
this migration installs only the audit support required by the new RBAC objects.
It creates baseline-compatible audit_log if absent and audit_user() only if absent.
An installed audit_user() is preserved. action_by is text (widened if necessary)
so authenticated email actors are not truncated to the reference's 50 characters.
It does not install business-module audit triggers or replace DBA-06 actor logic.

RBAC mutations record ADD/EDIT/DELETE/RESTORE. Password/token material is excluded
from old/new audit payloads. Audit history is append-only. Stamps use audit_user()
and Asia/Manila timestamps. No fabricated application actor is set by the migration.

RLS is enabled on the five RBAC tables, sessions, and audit_log. PUBLIC and existing
Supabase anon/authenticated roles receive no access. Views use security_invoker.
Express must connect through a trusted backend database owner/BYPASSRLS role;
ordinary role grants without corresponding RLS policies are intentionally
insufficient. Browser accounts must not connect directly to these tables.
Existing operational tables and baseline SQL/migration files are unchanged.

## Local execution

Use a fresh local `hopedb`; do not overwrite a temporary prototype schema or an
already-provisioned shared Supabase database. Review existing migration history
before application. This is a once-only transactional migration; repeat execution
fails safely rather than silently accepting an incompatible existing schema.

```bash
psql -X -v ON_ERROR_STOP=1 -d hopedb -f supabase/migrations/20261114121000_dba02_base_tables.sql
psql -X -v ON_ERROR_STOP=1 -d hopedb -f supabase/migrations/20261116070000_dba03_rbac_schema.sql
psql -X -v ON_ERROR_STOP=1 -d hopedb -f database/tests/validate_dba03.sql
```

Supply PGHOST/PGPORT/PGUSER as appropriate. Validation uses a rolled-back fixture
transaction and a temporary NOLOGIN role, requiring a local database owner with
CREATEROLE. It never modifies a shared remote database. Restore a database backup
for rollback after application; no destructive down-migration is supplied.

Executed locally in an isolated Unix-socket-only PostgreSQL 16 cluster:
`PGHOST=/tmp/hope-schema-pg.aD55aI`, `PGPORT=55437`, `PGUSER=codespace`.
Database `hopedb` contains the actual migration chain, not a temporary CREATE TABLE
substitute. The Supabase migration ledger was not changed: local execution used
psql, not a remote Supabase push.

## Verification results

- PASS: clean local application of all repository migrations to hopedb.
- PASS: 3 roles, 5 modules, 36 rights (3/6/13/7/7), 5 RBAC foreign keys, zero seeded accounts.
- PASS: SQL validation of constraints, case-normalized uniqueness, hashed-password
  shape/cost, soft delete/restore, dependencies, session revocation, credential
  redaction, long actor identity, append-only audit, RLS and denied direct access.
- PASS: same migration/validator on a separate database loaded from the complete
  original HopeDB_audit.sql.txt (existing audit infrastructure compatibility).
  The validator accepts either the baseline's P0001 or new trigger's 23514 when
  audit protection rejects a mutation; neither implementation is overwritten.
- PASS: 69 combined Node tests in the detached main + DBA + Developer integration
  worktree, including migrated-database auth/registration and store persistence.
- NOT RUN: hosted Supabase deployment, peer review, and visual browser verification.

## Proposed PR

**Title:** [S1-DBA-03] Migration: app_user (role, blocked flag), role, module, rights catalogue, user_permission (with soft delete)

### Summary / Description

Add the independent S1-DBA-03 schema and its 36-right catalogue, preserving the
registration contract and supporting the existing authentication implementation.

### Changes

Add the five RBAC/account tables, five FKs, constraints, required catalogue rows,
soft-delete/restore support, dependency guards, redacted audit/stamps and session
version revocation. Include auth_session as the explicitly approved supporting
object. Restrict direct API access with RLS and privileges.

### Files Changed

- supabase/migrations/20261116070000_dba03_rbac_schema.sql
- database/tests/validate_dba03.sql
- docs/S1-DBA-03.md

### Database Dependencies

Merged DBA-02 employee table; PostgreSQL 15+. Compatible audit infrastructure is
created only as needed; existing audit_user() is preserved. No account seed secrets.

### Testing

Local hopedb migration and rollback-only SQL validator passed; full-reference
compatibility passed; 69 combined auth/registration tests passed against migrated
PostgreSQL. Remote deployment and visual browser verification remain pending.

### Scope Confirmation

Only S1-DBA-03 and the explicitly approved auth_session supporting table. No
Developer authentication code, emailed resets, account-management endpoints,
DBA-05 account seeds or unrelated operational-table changes.

### Notes & Linked Issues

Closes #19. Authentication issue #6 depends on this schema; this DBA PR must not
close #6. Keep separate from existing Developer PR #8.
