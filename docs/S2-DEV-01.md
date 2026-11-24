# S2-DEV-01 — Customer list with search and filter (permission-checked)

Issue: #72. Branch: `feat/S2-DEV-01-customer-list`. Base: `main` at `3157a99`.
The implementation assignment initially withheld publication. The user subsequently
authorized a commit, push and review PR; shared deployment and merge remain unauthorized.

## Contract and decisions

`GET /api/customers?search=...&status=active|inactive|all` requires the existing
session middleware and `requireModuleAccess('customer')`. There is no customer.view
right. Admin/Superadmin behavior remains the existing active-catalogue operational
privilege model; User module access requires an active Customer grant.

Search defaults to empty, trims whitespace, is case-insensitive and matches literal
substrings in custno, custname or address. `%`, `_` and backslash are literal,
not operator-controlled wildcards. A non-string, repeated, control-containing or
more-than-100-character search is rejected with 400. Status defaults to active;
invalid/repeated statuses and unknown query parameters receive 400. Valid inactive
or all requests by Users are ignored: SQL always filters `NOT is_deleted`.

Records sort by custno ascending. No pagination was specified; this task returns
all matching records. Large-directory pagination/index tuning remains a future
review, not an undocumented truncation. Counts for privileged roles reflect the
current search across all statuses; selecting a tab affects rows, not those counts.
The rows and counts come from one SQL statement/snapshot.

Response example (synthetic data only):

```json
{
  "customers": [{"custno":"T0001","custname":"Sample","address":"Sample City","payterm":"COD"}],
  "filter": {"search":"","status":"active"},
  "capabilities": {"metadata":false,"add":false,"edit":true,"delete":false}
}
```

User rows contain only custno, custname, address, payterm. No status, stamp,
is_deleted, inactive counts or raw account details are returned. Admin/Superadmin
rows additionally include status (active/inactive) and stamp, plus response counts
(active/inactive/all). No user-supplied role or permission parameter is accepted.
Unauthenticated requests get 401, unauthorized requests 403, and database failures
503 with a generic message. Responses use Cache-Control: no-store.

## UI and task boundaries

`/workspace/customer` now renders the customer directory within the existing
workspace shell. Live search is debounced 250 ms; stale responses cannot overwrite
newer input. Focus/visibility refresh rechecks access and clears old rows. Status
tabs and metadata columns are only rendered for privileged responses. Dynamic
content uses textContent, including names/addresses/stamps. Loading, empty,
forbidden, network-error and retry states are explicit.

Add/Edit/Delete/Restore controls are permission-gated, disabled and labelled as
coming soon. Restore uses the existing customer.delete capability as a visibility
placeholder; no new permission or mutation route is introduced. Inactive rows
show Restore instead of Delete; Edit is limited to active-row placeholders.

Excluded: create/edit forms and APIs (DEV-02), deletion/restoration (DEV-03), products,
pricing, exports, new database objects, roster changes and deployment configuration.

## Dependencies and discrepancies

The user verified shared Supabase public.customer: custno varchar(5) PK,
custname varchar(20), address varchar(50), payterm varchar(3), is_deleted boolean
(default false), stamp varchar(60). Active/inactive maps to the existing flag;
there is no status column. Repository schema snapshots agree. Pay terms remain
COD/30D/45D; wireframe example labels are not new stored values.

The original DBA-02 migration lacks customer is_deleted/stamp. The isolated runner
adds those fields ONLY to its new disposable test database to match the verified
shared contract. No official migration was edited or created. Deployments using
only the migration chain must have the DBA-owned business soft-delete setup applied
before this list can run; a missing field fails safely with 503. The live shared
schema was provided by the user, not independently queried during this task.

Issue #72 overrides the older planning draft that incorrectly bundles full Sprint 2
CRUD under DEV-01. Its metadata table also contains a stray S1-DEV-01 label; its
heading, endpoint requirements and acceptance criteria identify this task. The
wireframe's additional pay-term search is excluded to follow the issue's three
search fields. Its CRUD controls are placeholders only.

The existing customer schema snapshot grants anon/authenticated table/view access.
This does not establish current live grants/RLS. Direct Supabase API exposure needs
DBA security verification: Express module guards cannot protect a separately exposed
Data API. No grants, policies or shared database data were changed in this task.

## Tests and evidence

Run source/unit/form tests in PowerShell (Node 24+, dependencies installed):

```powershell
npm.cmd ci
node --test test/customers.test.js test/customers-form.test.js test/workspace.test.js test/workspace-form.test.js
npm.cmd start
```

The existing .env must point to your approved database and contain valid auth
configuration. No fixtures are inserted by starting the application.

Unauthenticated probe in a second PowerShell terminal:

```powershell
curl.exe -i http://localhost:3000/api/customers
```

Expected: 401. For authorized checks, sign in with an existing approved test
account in the browser and open /workspace/customer; use DevTools Network to
inspect /api/customers responses. PowerShell does not share browser cookies.
If using PowerShell sessions, authenticate separately without logging passwords:

```powershell
$origin = 'http://localhost:3000'
$credential = Get-Credential -Message 'Existing approved test account email/password'
$body = @{email=$credential.UserName;password=$credential.GetNetworkCredential().Password} | ConvertTo-Json
try {
  Invoke-RestMethod -Uri "$origin/login" -Method Post -ContentType 'application/json' -Headers @{Origin=$origin} -Body $body -SessionVariable hopeSession | Out-Null
} finally { Remove-Variable body,credential -ErrorAction SilentlyContinue }
# For an unrestricted account with Customer access:
Invoke-RestMethod -Uri "$origin/api/customers?search=Sample&status=all" -WebSession $hopeSession
Invoke-RestMethod -Uri "$origin/logout" -Method Post -ContentType 'application/json' -Headers @{Origin=$origin} -Body '{}' -WebSession $hopeSession | Out-Null
Remove-Variable hopeSession
```

A first-login/restricted account must finish the existing setup flow in the browser;
these commands do not bypass password setup. Empty shared data correctly returns
empty rows, with zero counts for Admin/Superadmin. Do not insert demo customers
into shared Supabase without approval. Avoid recording actual customer responses.

For full SQL-backed tests, run in Codespaces/Linux:

```bash
python3 database/tests/run_customers.py
```

This creates its own private disposable PostgreSQL cluster, disables TCP, restores
base-schema definitions without demo records, applies existing DBA-03/04/06, matches
the verified customer field contract, and runs test/customers-postgres.test.js.
Only synthetic users/customers in that new cluster are written. It never uses
existing PG connection credentials or resets an existing database. Cluster shutdown
runs in finally; logs stay in the printed private temporary directory. Never enable
CUSTOMERS_INTEGRATION against shared Supabase; the test requires a Unix socket,
the exact disposable database name and empty account/customer tables.

Recommended redacted evidence names:
- S2-DEV-01-tests.txt (test output only)
- S2-DEV-01-admin-filters.png (synthetic fixtures, counts and metadata)
- S2-DEV-01-user-list.png (active only; no metadata)
- S2-DEV-01-forbidden.png (403 with no cookies/tokens)
- S2-DEV-01-empty.png (empty shared directory or synthetic no-match)

Do not include session headers, passwords, secrets or real customer PII in evidence.
Headless Chromium screenshots and ten browser scenarios were subsequently executed
on isolated PostgreSQL during the focused audit. Windows/Edge and Vercel/shared
smoke checks remain unexecuted; they are not implied by Linux browser testing.

## Executed results and Git preparation

- PASS: 9 customer unit/HTTP-double/DOM tests.
- PASS: complete non-PostgreSQL suite, 128 tests (includes those 9), zero failures/skips.
- PASS: disposable live HTTP/PostgreSQL suite, 8 reported tests (parent plus 7
  subtests), zero failures/skips. Latest logs:
  /tmp/hope-customer-list-test-4xf5zezo/customers-live.log. Cluster stopped.
- PASS: git diff whitespace and scope review; no database migration/roster changes.
- PASS: 10 actual headless Chromium browser scenarios with synthetic accounts/data,
  zero uncaught JavaScript errors. Admin/User/status/search/empty/forbidden/loading/
  error screenshots were captured outside Git; see focused audit artifacts.
- RESOLVED: visual inspection found unreadable narrow-screen word wrapping; a
  table minimum width and nonwrapping headers now use the existing horizontal
  scroll container. Browser verification was repeated after the CSS correction.
- NOT RUN: Windows/Edge, Vercel/shared Supabase checks.

Task branch was created from fetched origin/main at 3157a99 using
`git switch -c feat/S2-DEV-01-customer-list origin/main`; local working tree was clean.
The implementation was initially left uncommitted and unstaged. Publication was
subsequently authorized; before publication, review:

```powershell
git status --short --branch
git diff --check
git diff main...HEAD
git diff
```

Untracked new task files are also part of review; they do not appear in plain
`git diff` until staged. Recommended future commit message:
`feat: implement permission-checked customer list with search and filter [S2-DEV-01]`.
PR title: `[S2-DEV-01] Customer list with search and filter (permission-checked)`.
Ready-to-paste body: docs/S2-DEV-01-PR-description.md. Do not commit/push/open a PR
without explicit user authorization; the later publication request supplies that
authorization, but does not authorize merge or deployment.
