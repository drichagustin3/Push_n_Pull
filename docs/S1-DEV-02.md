# S1-DEV-02 — Register user form and API (new users start as pending)

## References and schema discrepancy

Reviewed the [Student Guide](https://drive.google.com/file/d/1Se1YxqJ9RT1frhGuJz4zw34GlEwX8J6j/view),
§2.3, §2.4 and §3.1, the [prototype](https://drive.google.com/file/d/19WE_qxIUTIvznpMHJ0_iUDw1cRYmo0Ij/view),
and the [revised task plan](https://docs.google.com/spreadsheets/d/1a63nW6vmUmqPW7wvK7yIZzm2201JHhRo/edit).
The Guide explicitly proposes an adaptable `USERS` table, not final PostgreSQL DDL.
The roadmap specifies `app_user` and a blocked flag. The prototype registration
collects first name, last name, and email and stores a pending User in browser data.
This implementation preserves those fields/IDs and adds password and confirmation
as explicitly requested for this task. It uses a standalone registration page;
the full prototype includes unrelated demo authentication and business features.

## DB Dependency / Expected app_user Schema

**Proposed integration contract, not a claim about the unmerged DBA migration.**
Reconcile this contract with S1-DBA-03 before production merge. No official
migrations or baseline SQL changes are included. No migration is run at startup.

| PostgreSQL column | Expected type/constraint | Guide mapping |
| --- | --- | --- |
| `user_id` | bigint identity primary key | userId |
| `first_name` | varchar(100), not null | firstName |
| `last_name` | varchar(100), not null | lastName |
| `email` | varchar(254), not null, unique; canonical lowercase/trimmed | email |
| `password_hash` | varchar(60), not null; bcrypt hash | passwordHash |
| `role` | text, not null, default `user` | role, lowercase prototype values |
| `blocked` | boolean, not null, default false | isBlocked / roadmap blocked flag |
| `status` | text, not null, default `pending` | registration approval state |
| `stamp` | text, not null | stamp |

Email uniqueness must cover case variants; the local test contract requires
canonical lowercase emails plus a unique constraint. Do not add a partial unique
constraint allowing duplicate deleted-account emails without reviewing login/reset
semantics. If the DBA chooses a role FK or other column names, adapt only the
registration service after inspecting that migration; do not silently change it.
The service fixes role, blocked, and status in SQL and ignores no privileged inputs:
unknown JSON fields are rejected. Account approval status is distinct from soft
deletion; future `is_deleted` or equivalent fields belong to the DBA contract.

The insert generates a stamp from the actual PostgreSQL `session_user` and current
Asia/Manila timestamp. It does not impersonate an authenticated app user. A text
stamp accommodates database role names without truncation. Existing `audit_user()`
and `audit_log` remain unchanged. Full app-user audit triggers are a DBA dependency;
any trigger logging this table must redact `password_hash` from audit payloads.
The temporary local table only verifies registration storage and latest stamp,
not the future production audit integration.

## API and local checks

Configure `.env` as in the root README, create the temporary contract table in a
disposable local `hopedb` only, run `npm ci`, `npm run db:check`, and `npm start`.
Open `http://localhost:3000/register`. The temporary SQL is supplied separately
outside this repository, and must not be applied to a shared database. `IF NOT
EXISTS` does not repair an existing incompatible table: inspect its definition
and use a separate disposable database rather than overwriting teammate data.

`POST /api/register` accepts JSON with exactly `firstName`, `lastName`, `email`,
`password`, and `confirmPassword`. Success: HTTP 201 with `status: pending` and
an approval message. No account details, hash, session, or cookie are returned.
Validation: HTTP 400; duplicate email: 409; media type: 415; rate limit: 429;
unavailable pool: 503; unexpected hashing/database failure: safe 500.
Invalid JSON/oversized requests use the scaffold's safe 400/413 handlers.

Passwords require 12 or more characters, uppercase, lowercase, and a digit;
they may occupy at most 72 UTF-8 bytes and cannot contain NUL. They are not trimmed.
Async bcrypt uses cost 12. Names allow Unicode, apostrophes, and hyphens;
blank/control-character names and names over 100 characters are rejected.
Emails are trimmed and lowercased. A single parameterized insert is atomic;
unique violations resolve duplicate races without a pre-insert existence check.

The registration endpoint permits 20 requests per IP per 15 minutes, including
invalid requests. The default limiter store is process-local and resets on
restart. Multi-instance deployment requires a shared store. Express keeps its
default proxy trust setting; configure a verified proxy boundary before relying
on forwarded client IPs. Use HTTPS at the deployment boundary.

Manual acceptance checklist:

- Submit valid details: 201, pending user, blocked=false, bcrypt hash and stamp.
- Retry the same email with different capitalization/whitespace: 409, one row.
- Submit missing fields, malformed email, weak/mismatched or >72-byte password: 400.
- Submit SQL-looking name text: remains data; table and other rows are intact.
- Submit role/status/blocked/stamp/user_id: 400, no insert or privilege escalation.
- Submit concurrent registrations for one email: one 201, remaining responses 409.
- Disconnect PostgreSQL after startup: safe failure message without driver details.
- Try 21 requests: the last returns 429 with Retry-After.
- Check keyboard/mobile form, error announcements, disabled pending submit,
  password clearing, success message, and network-error recovery.
- Confirm no automatic login, cookies, local storage entries, or dashboard access.

## Ready-to-paste PR description

### Summary

Implement S1-DEV-02: Register user form and API (new users start as pending).

### Changes

- Serve a registration-only page based on the reference fields, with password and confirmation.
- Add modular route, validation, controller, and service using the scaffold's pool.
- Hash passwords with bcrypt cost 12; use parameterized SQL and fixed account defaults.
- Handle duplicate emails, invalid input, database failures, and request throttling safely.
- Add API/validation/form-handler tests and repository hygiene rules.

### Database Dependencies

Depends on unmerged S1-DBA-03. Expected `app_user` columns:
`user_id`, `first_name`, `last_name`, `email` (canonical unique), `password_hash`,
`role` (text), `blocked`, `status` (approval state), and `stamp`.
Types: identity bigint PK; first/last names varchar(100) not null;
email varchar(254) not null unique; password_hash varchar(60) not null;
role/status/stamp text not null; blocked boolean not null. Defaults:
role='user', blocked=false, status='pending'. Stamp uses the actual DB
session identity and current timestamp. The full contract, Guide mappings,
and audit expectations are in docs/S1-DEV-02.md.
No migration or temporary CREATE TABLE script is committed. Reconcile the
proposed contract with the DBA before production merge.

### Testing Notes

PASS: clean `npm ci` (audit reported zero vulnerabilities), all 37 tests, and
`git diff --check`. Automated tests verify validation, real bcrypt hashing, parameter binding,
fixed defaults, safe errors, throttling, and form behavior. Database calls in
registration tests use a pool double. Live PostgreSQL persistence/concurrency and
visual browser checks remain manual until the local contract is installed.

### Scope Confirmation

Only S1-DEV-02. This branch is based on `feat/S1-DEV-01-project-scaffold` at
5916a97; use that branch as the PR base until PR #3 merges into main.

### Related Tasks Deferred

Login/logout/sessions and first-login password setup (S1-DEV-03), reset (S1-DEV-04),
management/approval/rights/navigation (S1-DEV-05–08), and Sprint 2–4 modules.

### Issue

No issue number has been issued. Replace this template when one exists:
<!-- Closes #<issue_number> -->
