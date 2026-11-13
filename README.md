# Push_n_Pull | SoftEngProj | HOPE Inc.

### 👥 Group 6 — 3 BSCS 1

| Team Member | Role |
| :--- | :--- |
| **Aldrich Rodolf Agustin** | 🥇 `Scrum Master` |
| **_** | 🎨 `UI/UX Developer` |
| **_** | ⚙️ `Backend Developer` |
| 🗄️ `DB Admin` |
| 🔍 `Tester` |

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

`GET /health` is a liveness endpoint. It does not query the database on each
request. Other routes return JSON 404 responses. There are no user, authentication,
permissions, or business-module endpoints yet.

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
