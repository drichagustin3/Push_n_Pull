# S1-DBA-04 — Password reset token schema

## Requirements and task metadata

Official task wording from the supplied Master Developer roadmap / revised Sprint
Task Plan: **Migration: password reset token table (hashed, expiry, used flag)**.
The repository's docs/ROADMAP.md describes the module schedule rather than listing
this individual DBA task. [Issue #35](https://github.com/drichagustin3/Push_n_Pull/issues/35)
supplies the detailed schema/index requirements and acceptance criteria: provision
the token table/FK/indexes and distinguish active, expired, and redeemed tokens.

- Branch: `feat/S1-DBA-04-password-reset-token`
- Base: fetched origin/main 5601e38.
- PR title: `[S1-DBA-04] Migration: password reset token table (hashed, expiry, used flag)`
- DBA-03 PR #39 was checked and is OPEN, not merged. Its existing b150ca9 migration
  supplies app_user. Do not merge/deploy DBA-04 before that dependency.
- No Git merges, remote push, or PR creation/update is authorized in this task.

The original authentication branch remains at 1ff3272, with its working tree
unchanged. DBA-04 work lives at /workspaces/hope-dba-04; isolated dependency testing
lives at /workspaces/hope-dba04-integration in detached HEAD at main. That test
worktree includes a copy of the unmerged DBA-03 migration; the DBA-04 branch does
not include that file or Developer authentication changes.

## Schema contract / mappings

Migration: `supabase/migrations/20261117070000_dba04_password_reset_token.sql`.
It is atomic, additive, and requires the real DBA-03 public.app_user schema. It
fails explicitly before creating objects if that dependency is missing. Reapplying
an already-installed migration fails rather than accepting an unknown schema.

| Issue field | PostgreSQL column | Contract |
| --- | --- | --- |
| id | id | bigint GENERATED ALWAYS AS IDENTITY primary key |
| userId | user_id | bigint NOT NULL, FK to app_user(user_id), ON DELETE CASCADE |
| tokenHash | token_hash | varchar(64) NOT NULL UNIQUE, exactly 64 lowercase SHA-256 hex digits |
| expiresAt | expires_at | timestamptz NOT NULL, default current timestamp + one hour |
| isUsed | is_used | boolean NOT NULL DEFAULT false |
| createdAt | created_at | timestamptz NOT NULL DEFAULT current timestamp |
| usedAt | used_at | nullable timestamptz; present exactly when is_used=true |

Snake_case and bigint follow the actual DBA-03 account contract. The issue's
varchar(255) digest example is narrowed to the exact SHA-256 hex representation;
timestamps retain timezone information for consistent expiry comparisons.
The unique digest constraint supplies the required lookup B-tree index, avoiding
a redundant second index. A composite (user_id, is_used, expires_at) index supports
per-user invalidation. No extension is required.

Expiry must follow creation; used_at cannot precede creation. Issuance metadata is
immutable after INSERT. Used/revoked tokens cannot return to unused state or have
their consumed timestamp rewritten. Expiration is checked at redemption time,
not in a time-varying CHECK constraint. Expired/used technical rows may be deleted
for cleanup; they are not soft-deleted business entities.

PostgreSQL enforces digest shape, not proof that an input was cryptographically
hashed. Future S1-DEV-04 must hash a fresh random token server-side before insertion
and privately email only the raw token. Never store or log the raw token. No token
or credential seeds are installed by this migration. Token rows are deliberately
excluded from business audit snapshots, which could otherwise copy token material.

RLS and revoked PUBLIC/anon/authenticated privileges keep tokens private. Use the
trusted backend DB owner/BYPASSRLS connection described in DBA-03. No direct browser
policy is provided. The existing app_user hard-delete protection remains unchanged:
the FK declares cascade semantics, but deleting an account still obeys that guard.
Soft-deleting an account is not a SQL DELETE and does not fire FK cascades.

## Application dependencies and scope

S1-DEV-03's initial-password proof fields stay on app_user. They are not replaced
by this table, which supports S1-DEV-04's future emailed reset workflow. This task
adds no authentication controllers, sessions, reset APIs, emails, approvals, or UI.
Existing credentials, accounts, RBAC, audit functions, and session behavior are
unchanged.

Future reset code must check account eligibility separately, consume one token
and update the password in the same transaction, and roll back consumption if the
password update fails. DBA-03's password-change trigger will invalidate prior
session versions when the future application updates password_hash.
A parameterized atomic consumer pattern (for a PostgreSQL driver, not psql) is:

```sql
UPDATE public.password_reset_token
SET is_used = true, used_at = clock_timestamp()
WHERE token_hash = $1 AND NOT is_used AND expires_at > clock_timestamp()
RETURNING user_id;
```

Require exactly one returned row. Sequential and concurrent replay return zero
rows. Checking the row first and consuming it in a later unprotected operation is
insufficient. New-request invalidation can atomically mark that user's currently
unused/unexpired rows used with used_at supplied, using the composite index.
Issuing a reset request alone must not sign users in or grant account approval.

## Local verification

Tests ran against the existing isolated Unix-socket PostgreSQL 16 cluster:
`PGHOST=/tmp/hope-schema-pg.aD55aI PGPORT=55437 PGUSER=codespace`.
The database `hopedb` already contained actual DBA-02/03 migrations; DBA-04 was
applied there. Existing data was not replaced. A separate fresh
`hopedb_dba04_verify` tested the full main + DBA-03 + DBA-04 chain and concurrency.
`hopedb_dba04_missing` verified the expected missing-dependency failure.
The Supabase remote project/migration ledger was not changed; execution used psql.

For a local database with DBA-03 already applied:

```bash
psql -X -v ON_ERROR_STOP=1 -d hopedb -f supabase/migrations/20261117070000_dba04_password_reset_token.sql
psql -X -v ON_ERROR_STOP=1 -d hopedb -f database/tests/validate_dba04.sql
```

The SQL validator rolls back fixtures and its test role; it requires a local owner
with CREATEROLE. For the concurrency test, provision a separate disposable
hopedb_dba04_verify using the real full migration chain, then run:

```bash
DBA04_LOCAL_TEST=1 PGDATABASE=hopedb_dba04_verify python database/tests/validate_dba04_concurrency.py
```

Pass PGHOST/PGPORT/PGUSER privately as appropriate. The Python test requires psql
and accepts only that disposable database name. It creates its own random fixture,
then deletes its technical token row and soft-deletes its account; audit history
is preserved. It never touches existing user fixtures. No live credentials are
printed or committed. No destructive rollback migration is provided.

## Executed results

| Result | Verification |
| --- | --- |
| PASS | Actual DBA-04 migration on local hopedb |
| PASS | Before/after fingerprints: rows, columns and constraints of all 17 pre-existing tables unchanged |
| PASS | Fresh complete migration chain using isolated unmerged DBA-03 dependency |
| PASS | SQL tests on hopedb and fresh database: defaults, types, constraints, FK/cascade metadata, indexes, expiry/used state, immutability, replay, invalidation, cleanup, privileges and RLS |
| PASS | Four simultaneous PostgreSQL consumers: one success, three empty/rejected claims |
| PASS | Expected missing-dependency failure and no partially created token table |
| PASS | Existing DBA-03 SQL validation after DBA-04 application |
| PASS | Whitespace/scope checks; Developer branch stays unchanged at 1ff3272 |
| FAIL | None outstanding |
| NOT RUN | Remote deployment, future emailed reset API, and S1-DEV-03 rework/final integration (intentionally deferred) |

## Ready-to-paste PR description

### Summary / Description

Implement S1-DBA-04: Migration: password reset token table (hashed, expiry, used flag).
Closes #35. Depends on DBA-03 PR #39, which is currently unmerged.

### Changes

Add password_reset_token with account FK, unique SHA-256-format digest, one-hour
expiry defaults, used/created timestamps and consistent used-state constraints.
Add composite invalidation index, immutable issuance/consumption guard, and private
access with RLS/revoked browser grants. No raw-token storage column or seeds.

### Database Dependencies

Requires DBA-03 app_user(user_id bigint); no copy of DBA-03 is added to this PR.
Issue camelCase fields map to the existing snake_case convention. SHA-256 hex is
64 characters; timezone-aware timestamps support expiry. FK ON DELETE CASCADE
preserves the existing account hard-delete guard; soft deletion does not cascade.
Backend hashing and transactional password updates belong to future S1-DEV-04.

### Files Changed

- supabase/migrations/20261117070000_dba04_password_reset_token.sql
- database/tests/validate_dba04.sql
- database/tests/validate_dba04_concurrency.py
- docs/S1-DBA-04.md

### Testing Results

PASS: local hopedb application, unchanged existing-table fingerprints, fresh-chain
application, SQL lifecycle/schema/security checks, four-way concurrent one-time
redemption, dependency failure/atomicity, and prior DBA-03 SQL regression.
NOT RUN: hosted deployment and future reset API/auth integration. See this document
for exact reproduction commands. No outstanding executed failures.

### Scope Confirmation

Only S1-DBA-04. No S1-DEV-03 files changed, no authentication branch update, no new
DBA-03 migration in this task diff, no email/reset application workflow, and no
unrelated schema/data changes. DBA-03 must merge before this migration is deployed.

### Notes & Linked Issues

Closes #35. Depends on #39. Publish and create this independent PR only after user
approval. Do not merge either PR or update existing Developer PR #8 automatically.
