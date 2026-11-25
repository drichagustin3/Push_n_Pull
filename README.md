# Push_n_Pull | SoftEngProj | HOPE Inc.

A database-driven Enterprise Resource Planning (ERP) system for **Hope, Inc.** It centralizes customers, products, employees, and sales with strict role-based access control (RBAC) and Row Level Security (RLS).

---

## 1. About the Project

An **ERP (Enterprise Resource Planning)** system replaces separate spreadsheets per department with one shared, centralized database. Every screen in the application is a dynamic view of rows from that database, and what a user sees or can modify depends strictly on their assigned role and permissions.

---

## 2. System Modules

| Module | What It Manages | Main Tables |
| :--- | :--- | :--- |
| **Customers** | Who we sell to (name, address, payment terms) | `customer` |
| **Products** | Product catalogue and historical pricing | `product`, `pricehist` |
| **Human Resources** | Employees, jobs, departments, and job/salary history | `employee`, `job`, `department`, `jobhistory` |
| **Sales** | Sale headers, line item details, and payments | `sales`, `salesdetail`, `payment` |
| **Reports** | 7 read-only operational reports (Print / Save as PDF) | *Reads all of the above* |
| **User Management** | User accounts, blocking, and per-action rights | `app_user`, `role`, `module`, `rights`, `user_permission`, `password_reset_token` |

---

## 3. User Roles & Access Control

| Role | Capabilities & Restrictions |
| :--- | :--- |
| **Superadmin** | Full system access, including approving new users, designating Admins, and assigning any role. |
| **Admin** | Manages standard Users and their per-action rights; cannot view or modify Superadmin accounts. |
| **User** | Access is restricted strictly to the specific modules and actions granted by an Admin (up to 36 per-action rights). |

> [!NOTE]
> **Account Registration & Seeding:** New user registrations always default to the **User** role with a `Pending` status until approved. During development, team members are seeded as **Superadmin**.

---

## 4. Key Design Rules

* **Soft Delete:** Deleting a record sets `status = 'Inactive'` rather than permanently removing it, allowing rows to be restored later. Standard Users only see `Active` rows, while Admins can view all records.
* **Audit Stamp:** Every database row automatically records the latest action performed, who executed it, and when it occurred.
* **No Stored Derived Data:** Calculated values—such as invoice totals and current item prices—are computed dynamically from `salesdetail` and `pricehist` rather than stored statically.
* **Server-Side Security & RLS:** Hiding UI buttons is not sufficient. The backend server validates user rights on every incoming request, backed by **Row Level Security (RLS)** enabled across all database tables.

### 👥 Group 6 — 3 BSCS 1

| Team Member | Role |
| :--- | :--- |
| **Aldrich Rodolf Agustin** | 🥇 `Scrum Master` |
| **Ashley Nicole Marticio** | 🎨 `UI/UX Developer` |
| **_** | ⚙️ `Backend Developer` |
| `Shared Role` | 🗄️ `DB Admin` |
| `Shared Role` | 🔍 `Tester` |

## Local Development Setup

### Prerequisites

Install Git, Node.js 24 or newer, and npm. Use a running PostgreSQL server and
install the PostgreSQL client tools if you need to create a database. VS Code is
optional. Express can connect directly to an existing PostgreSQL server without
Docker. The full local Supabase stack requires Docker or a compatible container
runtime.

### Clone and install

```bash
git clone https://github.com/drichagustin3/Push_n_Pull.git
cd Push_n_Pull
git branch --show-current
npm ci
```

In Windows PowerShell, use `npm.cmd ci` to avoid the execution-policy restriction
on `npm.ps1`. If you already have a checkout, start in its repository root.
Some Sprint 2 features are available only on unmerged branches. Check the
feature's pull request and your current branch before troubleshooting a missing
screen or endpoint.

### Configure your local environment

If you do not already have a repository-root `.env`, copy the example.

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS or Linux**

```bash
cp .env.example .env
```

- Replace the example `SESSION_SECRET` with a private random value of at least
  32 bytes. Run the following command in your terminal and paste the result into
  `.env`. Keep the secret and database credentials out of Git.
- Set `APP_ORIGIN` to the exact origin you will open in your browser, such as
  `http://localhost:3000`, with no trailing slash or path. Set `APP_URL` to the
  same value for password-reset links. If you change `PORT`, update both URLs.
- Set `PGHOST`, `PGPORT`, and `PGDATABASE` for your local server. Replace the
  `PGUSER` and `PGPASSWORD` placeholders with your local PostgreSQL credentials.
  Use `PGSSLMODE=disable` for a local server without TLS.
- For local password-reset email delivery, set `MAIL_FROM`, `SMTP_HOST`, and
  `SMTP_PORT`. If the server requires authentication, set `SMTP_USER` and
  `SMTP_PASS` together. With `NODE_ENV=development` and no `SMTP_HOST`, the app
  prints private reset links in the server console. Outside development, SMTP
  and a valid sender address are required.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### Prepare PostgreSQL

If the local `hopedb` database does not exist, create it with a PostgreSQL role
that can create databases. Replace `YOUR_POSTGRES_USER` with that role. Run
`createdb` from the PostgreSQL installation's `bin` directory if it is missing
from your `PATH`.

```bash
createdb -h 127.0.0.1 -p 5432 -U YOUR_POSTGRES_USER -W hopedb
```

An empty database can pass a connectivity check. Application startup also needs
the expected columns in `app_user` and `auth_session` from DBA-03 and in
`password_reset_token` from DBA-04. Authentication requires an approved local
account that can sign in. Business screens can have further schema requirements,
including operational soft-delete columns.

Use the team's schema baseline for your branch. The files in
[`supabase/migrations/`](supabase/migrations/) are ordered migration scripts.
[`HopeDB_audit.sql.txt`](database/reference/HopeDB_audit.sql.txt) is reference SQL
that includes its own table creation and sample data. Follow the
[database setup guide](database/README.md) and confirm the required baseline with
the DBA if your local schema is missing objects. The app applies no migrations or
seed data on startup. Obtain authorization before applying changes to shared
Supabase.

### Run and verify the app

| Action | macOS or Linux | Windows PowerShell |
| :--- | :--- | :--- |
| Check PostgreSQL connectivity | `npm run db:check` | `npm.cmd run db:check` |
| Start the application | `npm start` | `npm.cmd start` |
| Restart automatically when source files change | `npm run dev` | `npm.cmd run dev` |
| Run the default automated tests | `npm test` | `npm.cmd test` |

Run the connectivity check first, then choose either start command. The
connectivity check runs `SELECT 1`. Startup also validates the session and reset
configuration and checks the authentication and reset-token schema before
listening. With the default port, successful startup prints
`HOPE ERP listening on port 3000.`

Open the following paths at the configured origin, for example
`http://localhost:3000`.

| Path | What to verify |
| :--- | :--- |
| `/health` or `/api/health` | Returns `{"status":"ok"}` as a liveness check. |
| `/register`, `/login`, `/forgot-password` | Public registration, sign-in, and password recovery pages. |
| `/account`, `/workspace` | Available after sign-in and any required initial password setup. Workspace modules depend on your effective permissions. |
| `/users` | User Management for Admins and Superadmins. |

The default test suite runs with installed dependencies and can open loopback
HTTP ports. It does not require a configured PostgreSQL database. PostgreSQL
integration suites are opt-in and require an authorized local test database.
Some Customer and Product runners require a disposable Unix-socket PostgreSQL
cluster. See the relevant feature notes for prerequisites.

### Common setup problems

| Symptom | What to check |
| :--- | :--- |
| PowerShell blocks `npm.ps1` | Use the corresponding `npm.cmd` command. |
| Database connection fails | Confirm PostgreSQL is running, check the host, port, database, role, and password, then rerun the connectivity check. |
| Connectivity passes and startup reports a schema error | Confirm the configured database has the DBA-03 and DBA-04 schema before starting the server. |
| Session or reset configuration is rejected | Replace the example secret and check that `APP_ORIGIN` and `APP_URL` match the exact browser origin. |
| The HTTP port is in use | Stop the process using that port or set a free `PORT` and update both application URLs. |
| A feature is missing | Check `git branch --show-current` and verify the feature's PR and merge status. |

### Sprint 1 implementation notes

- [Registration](docs/S1-DEV-02.md), [authentication and sessions](docs/S1-DEV-03.md),
  and [password reset and SMTP](docs/S1-DEV-04.md).
- [User Management](docs/S1-DEV-05.md), [Superadmin controls](docs/S1-DEV-06.md),
  and [per-action rights](docs/S1-DEV-07.md).
- [Workspace navigation, RBAC, and database dependencies](docs/S1-DEV-08.md).

### Configuration

The application loads the repository-root `.env`; existing process environment
variables take precedence. `.env` and its variants are ignored by Git; only the
placeholder `.env.example` is tracked. Never commit actual credentials.

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | `development`, `test`, or `production` |
| `PORT` | `3000` | HTTP port, integer 1–65535 |
| `PGHOST` | `127.0.0.1` | PostgreSQL host |
| `PGPORT` | `5432` | PostgreSQL port, integer 1–65535 |
| `PGDATABASE` | `hopedb` | PostgreSQL database name |
| `PGUSER` | Required | PostgreSQL role |
| `PGPASSWORD` | Required | Nonempty PostgreSQL password |
| `PGSSLMODE` | `disable` | `disable` or `verify-full` |

For a hosted PostgreSQL connection, use the database administrator's connection
settings and `PGSSLMODE=verify-full` for certificate-verified TLS. A private CA can
be trusted using Node's `NODE_EXTRA_CA_CERTS` environment variable at launch.
The existing [database guide](database/README.md) describes the team's Supabase
migration workflow; those files are preserved. No hosted connection or applied
migration history is assumed by this scaffold.

### Structure and lifecycle

- `src/app.js`: Express app factory, JSON parsing, liveness and terminal handlers.
- `src/config/env.js`: environment loading and validation, with safe error messages.
- `src/db/pool.js`: pool factory and read-only `SELECT 1` connectivity check.
- `src/server.js`: one pool per process, database verification before listening,
  startup cleanup, and SIGINT/SIGTERM shutdown (10-second deadline).
- `scripts/check-db.js`: standalone connectivity check with pool cleanup.
- `test/`: Node test runner tests for configuration, HTTP behavior, and lifecycle.

Reuse the process's pool for future database operations. Use parameterized queries
for input values (`pool.query('... WHERE id = $1', [id])`); transactions must use
one checked-out client with `release()` in `finally`.
Do not create a pool per request. Pool capacity is 10; acquisition and query
timeouts are 5 seconds, and idle connections expire after 30 seconds.

Invalid configuration, unavailable PostgreSQL, and an occupied HTTP port produce
exit code 1. Messages omit driver details and credentials. Check PostgreSQL's
availability, your private `.env` settings, and whether the HTTP port is free.

`npm test` requires no configured database: successful lifecycle tests use a pool
double, while connection-refusal tests use the actual `pg` driver. A successful
`npm run db:check` and application startup against your configured PostgreSQL
instance are separate integration checks.
