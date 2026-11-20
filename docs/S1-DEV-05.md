# S1-DEV-05 — User Management

## Task overview and Git metadata

Exact task/PR title:
`[S1-DEV-05] User Management screen: user list, Add User, Edit User, Block/Unblock; Admin manages Users only and Superadmin accounts are hidden`

- Branch: `feat/S1-DEV-05-user-management`.
- Implementation/test base: `feat/S1-DEV-04-reset-password`, tip `cd9c89e`.
- Official issue: [#43](https://github.com/drichagustin3/Push_n_Pull/issues/43).
- The issue audit and complete compliance matrix are in [S1-DEV-05-audit.md](S1-DEV-05-audit.md).
- On 2026-11-18, PR #8 is merged into main, and #42 is merged into the auth branch.
  `origin/main` at `273de86` still lacks DEV-04 commit `cd9c89e`; merging #42 into
  a feature branch did not put it into main. The DEV-05 implementation remains
  isolated on its original DEV-04 base. Do not present its main comparison as a
  clean DEV-05-only PR until that inherited dependency is integrated separately.
- No DEV-05 PR exists. All existing uncommitted work was preserved; this audit
  performs no commit, push, merge, issue closure, or PR creation.

## Repository findings and scope decisions

Reviewed the real merged DBA-03 schema, existing auth/session and registration
code, the database reference SQL, the repository `public/index.html` user-directory
prototype, and the [Student Guide](https://drive.google.com/file/d/1Se1YxqJ9RT1frhGuJz4zw34GlEwX8J6j/view)
§2.3, §2.4, and §3.8 through the connected Google Drive skill.

The real account identifier is `user_id`; email is its sign-in username. No
separate username column exists. Roles are lowercase text FKs; deletion is
`is_deleted`, approval/account availability is `status`, and access blocking is
`blocked`. These concepts stay distinct. `stamp` and audit rows are DB-owned.
The 36 existing rights cover business modules, not User Management, so access
uses the explicit authenticated Admin/Superadmin role rule without inventing a
37th right or changing permission assignments.

Guide §3.8 permits Admin rows to appear with no actions, while hiding Superadmins.
The implementation follows that rule: Admins see other Admin profiles in the
list as read-only, but direct-ID profile/mutation requests manage Users only.
The guide's general metadata rule permits both administrator roles to see deleted
rows and metadata; this task explicitly requires a narrower User Management rule,
so **only Superadmins** receive Status, Stamp, and deletion metadata or deleted
rows. Admin SQL projections omit those columns; the API does not merely hide them
with CSS.

New managed accounts are active and unblocked, unlike pending public signups.
Their supplied strong temporary password is bcrypt-hashed at cost 12 and
`must_change_password=true` forces the existing DEV-03 first-login flow. The
manager must privately provide the temporary password to the intended recipient;
the API never echoes or logs it. No setup-token generation/delivery was added.

Issue #43 explicitly assigns **creation** of Admin/Superadmin accounts to this
operation when the actor is a Superadmin. That overrides the initial assumption
that every managed creation was User-only. Admin actors still create Users only.
The requested role is allowlisted and parameterized; the actor's authority is
rechecked under transaction locks. Existing-account role changes and pending-user
approval remain DEV-06. Existing Superadmin profiles may be edited by a Superadmin,
but Superadmin block/unblock operations stay unavailable here, preserving the
existing boundary around DEV-06's last-Superadmin administration.

Deleted profiles are visible read-only to Superadmins. No delete, restore, rights
dialog, approval/status-change, role-change, password-edit, or dashboard/sidebar
features are introduced. The static prototype stays unchanged; the real screen
is `/users` and its HTML template lives outside `public`.

## Implementation plan and code changes

- `src/users/routes.js`: protected screen/API composition, role guard, exact-origin
  and JSON mutation checks, no-store/security headers, mutation limiter (60 per IP
  per 15 minutes per app instance), safe error responses.
- `src/users/validation.js`: allowlisted body/query fields, canonical email,
  bounded names/search/IDs/pages, employee-code and temporary-password validation.
- `src/users/controller.js`: request validation and HTTP responses.
- `src/users/service.js`: parameterized PostgreSQL projections/filters, hierarchy
  checks, account creation, profile editing, blocking, audit identity, transactions.
- `src/app.js`: mounts User Management using the existing session middleware/store.
- `views/users/index.html`: protected directory/search/filter/editor screen with
  role-appropriate server-rendered filter controls.
- `public/users.js` / `users.css`: safe text rendering, read-only rows, Add/Edit and
  Block/Unblock actions, pagination, duplicate-submission prevention, safe errors,
  and clearing submitted passwords.
- `test/users*.test.js`: unit, browser-handler, and live HTTP/PostgreSQL coverage.

## Routes and validation contract

| Method/path | Behavior |
| --- | --- |
| GET /users | Authenticated manager screen |
| GET /api/users | Search/filter/paginated directory |
| GET /api/users/:id | Profile; Admin may retrieve only a nondeleted User |
| POST /api/users | Add an active User with mandatory password change |
| PUT /api/users/:id | Replace name/email; optional employee-link update |
| PUT /api/users/:id/block | Issue #43 route: atomic toggle, or explicit isBlocked boolean |
| PATCH /api/users/:id/blocked | Preserved compatibility route: explicit blocked boolean |

Create JSON: `firstName`, `lastName`, `email`, `password`, `confirmPassword`, and
optional `empno` (existing employee code or null), `role` (user/admin/superadmin,
with elevated roles allowed only for a Superadmin actor; default user). Edit JSON
requires `firstName`, `lastName`, `email`; omitted `empno` preserves the link and
explicit null clears it. Fields such as role/status/blocked/is_deleted/password
cannot be modified through profile edits. Canonical PUT block accepts an empty
object/no body to toggle under row locks, or `{ "isBlocked": true/false }` for an
explicit state. The compatibility PATCH route accepts `{ "blocked": true/false }`.
The issue's isBlocked maps to the actual DB column blocked. Password policy reuses
the existing 12-character, uppercase/lowercase/digit, 72-UTF-8-byte maximum rule.

Query filters: `search` (name/email, up to 100 characters), `role`, `blocked`
(`all/true/false`), `page` (positive integer), and Superadmin-only `deleted`
(`all/true/false`). Admin role filters permit all/user/admin; the SQL always
excludes Superadmins and deleted accounts. Superadmin role filters also permit
superadmin. Results are stable by user_id, 50 rows/page, with hasMore from one
extra row rather than an unrestricted response or leaked total count. Search
escapes SQL wildcard characters and binds its values.

Missing authentication returns 401, standard Users receive 403, and hidden/missing
or noneditable target accounts return 404. Self-block attempts return 400.
Duplicate emails return a generic 409; invalid/FK data returns 400. Database
failures return a generic 500 without SQL, account details, or credentials.
Mutation requests require JSON (except the bodyless PUT toggle) and exact APP_ORIGIN, plus HTTPS under the existing
production configuration. Unknown fields are rejected, not silently accepted.

## Database dependencies and security

No SQL migration or new dependency is added. Uses existing DBA-03 `app_user`,
`role`, `auth_session`, the employee FK, audit_user(), and stamp/audit/session-version
triggers. DBA-04 remains inherited from DEV-04; this task does not query reset-token
rows or modify reset behavior.

Each mutation uses one checked-out client, locks actor/target rows in ID order,
revalidates the actor's active/unblocked/nondeleted role and session version and
the target hierarchy/deletion state, and sets transaction-local app.username to
the authenticated manager's verified email. This prevents stale permissions from
authorizing a write. Failed operations roll back and release the client. Profiles
never return password hashes, setup tokens, or session versions.

Blocking and target-session deletion commit together. The existing DB trigger
also changes session_version, and requireAuth rechecks the current account on
subsequent requests, including a session that raced with revocation. Other users'
sessions remain usable. Unblocking never revives an old cookie; a fresh login is
required. Blocking does not approve a pending account.

## Testing and verification

```bash
npm test
# Full local integration; supply your private local PG* settings first:
AUTH_INTEGRATION=1 AUTH_ALLOW_HOPEDB_TEST=1 AUTH_VERIFY_DBA04=1 \
RESET_INTEGRATION=1 RESET_ALLOW_HOPEDB_TEST=1 \
USERS_INTEGRATION=1 USERS_ALLOW_HOPEDB_TEST=1 npm test
```

Live tests require migrated `hopedb_auth_test`, or explicitly authorized local
`hopedb` via the flags above. They create unique `manage-*` synthetic fixtures,
clean up technical sessions/tokens, and soft-delete their accounts. Audit records
and soft-deleted fixtures remain as intended; real accounts are not altered.

The eight requested checks are covered: User-role denial; complete Superadmin
visibility; Admin isolation in HTML/JSON; direct-ID attacks; Admin User-only Add,
Superadmin privileged creation and first-login setup; Edit/duplicate conflicts; Block/Unblock/self-block/session
revocation; and Git hygiene. Additional coverage checks metadata projections,
profile XSS-safe rendering, pagination, literal wildcard/injection searches,
status/role/password injection, FK errors, audit identity/redaction, actor/target
revalidation, transactional rollback, origin/JSON guards, and safe actual database
failure handling.

Graphical browser and external/hosted deployment verification are NOT RUN. UI
handlers are exercised with automated DOM doubles; endpoint tests use actual
Express HTTP and PostgreSQL sessions. Existing authentication, registration, and
reset regressions run in the full suite.

Original implementation verification on 2026-11-17 against local PostgreSQL 16 `hopedb`: **111 PASS,
0 FAIL, 0 skipped**, including both the live auth/reset regressions and the
expanded User Management suite. Real reset email regression delivery uses a
loopback SMTP sink, not an external mailbox. The 2026-11-18 issue audit reran the
full suite: **116 PASS, zero failures/skips**; expanded live User Management checks
also passed (12 tests). See the audit report for current evidence.

| Required check | Actual result |
| --- | --- |
| Standard User denied list/Add/Edit/Block and screen access | PASS |
| Superadmin sees all roles and deleted fixtures | PASS |
| Admin receives no Superadmin accounts in JSON or HTML | PASS |
| Admin direct-ID GET/PUT/PATCH cannot manage Admins/Superadmins | PASS |
| Admin Add User succeeds; elevated-role creation fails | PASS; temporary-password first-login change also verified |
| Edit persists; duplicate email returns 409 | PASS; no separate username exists in this schema |
| Block/Unblock, self-block rejection, login/session revocation | PASS |
| Git hygiene | PASS; secrets/dependency/AI directories ignored, no migration changes or staged clutter |

Also PASS: `git diff --check`, unchanged auth/registration/reset/migration files,
zero runtime vulnerabilities from `npm audit --omit=dev`, and the existing
36-right catalogue still present. The audit leaves all work unstaged and unpublished.

## Ready-to-paste PR description

Use the issue-linked description in [S1-DEV-05-audit.md](S1-DEV-05-audit.md#ready-to-paste-pr-description),
which includes `Closes #43`, the compliance matrix, corrections, actual tests, and
current dependency/base limitation.

## Git commands after review and publication approval

```bash
git diff --check
git status --short
git add src/app.js src/users views/users public/users.js public/users.css \
  test/users.test.js test/users-form.test.js test/users-postgres.test.js \
  docs/S1-DEV-05.md docs/S1-DEV-05-audit.md README.md
git diff --cached --check
git diff --cached --stat
git commit -m "feat(S1-DEV-05): add role-isolated user management"
git push -u origin feat/S1-DEV-05-user-management
# Save the PR description above to /tmp/s1-dev-05-pr.md, then:
gh pr create --base feat/S1-DEV-04-reset-password \
  --head feat/S1-DEV-05-user-management \
  --title '[S1-DEV-05] User Management screen: user list, Add User, Edit User, Block/Unblock; Admin manages Users only and Superadmin accounts are hidden' \
  --body-file /tmp/s1-dev-05-pr.md
```
