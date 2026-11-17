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

## Backend setup (S1-DEV-01)

Use Node.js 24 or later (`nvm use` if available), npm, and a running PostgreSQL
server. Docker is not required. This branch contains only the Express scaffold,
environment configuration, and reusable PostgreSQL pool.

```bash
npm ci
cp .env.example .env
```

Edit `.env` with your local PostgreSQL username and password. Create an empty
`hopedb` database if necessary, using an existing PostgreSQL role with permission
to create databases:

```bash
createdb -h 127.0.0.1 -p 5432 -U YOUR_POSTGRES_USER -W hopedb
npm run db:check
npm start
```

`createdb` is a PostgreSQL client utility, installed separately from npm. Database
creation is a local setup step; the application never creates tables, runs
migrations, or loads the reference seed. An existing empty `hopedb` is sufficient
for this task. Successful startup prints `HOPE ERP listening on port 3000.`

```bash
curl http://localhost:3000/health
# {"status":"ok"}
npm run dev  # restart on source changes
npm test
```

`GET /health` and its alias `GET /api/health` return `{"status":"ok"}` as liveness
endpoints. The shared handler does not query the database on each
request. Registration is available at `/register`; see the
[S1-DEV-02 integration notes](docs/S1-DEV-02.md). Unimplemented routes return JSON 404 responses.

Authentication is available at `/login`; see the [S1-DEV-03 setup and database
contract](docs/S1-DEV-03.md). Before starting the server, configure a private
`SESSION_SECRET` and exact `APP_ORIGIN`, and install the expected auth schema.
`npm run db:check` verifies connectivity only; server startup also checks auth columns.

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
