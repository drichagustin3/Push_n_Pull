# Database Setup Guide – HOPE Inc. (Push_n_Pull)

## 1. Overview

This directory contains the database documentation and reference SQL script for the HOPE Inc. project.

The project uses **Supabase (PostgreSQL)** as its database platform and the **Supabase CLI** to manage database migrations.

## 2. Directory Structure

The database-related files are organized as follows:

```text
database/
├── README.md
└── reference/
    └── HopeDB_audit.sql.txt

supabase/
├── config.toml
└── migrations/
    └── <timestamp>_migration_name.sql
```

## 3. Prerequisites

Before working with the database, make sure the following tools are installed:

- [Node.js and npm](https://nodejs.org/)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Git](https://git-scm.com/)

## 4. Supabase Project Setup

Open the project repository in your terminal.

### 4.1 Authenticate with Supabase

Run the following command:

```bash
npx supabase login
```

Follow the prompts to authenticate your Supabase account.

### 4.2 Link the Repository to the Team's Supabase Project

Run:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with the project reference provided by the team.

## 5. Migration Workflow

### 5.1 Create a New Migration

Use the following command to create a migration file:

```bash
npx supabase migration new migration_name
```

Replace `migration_name` with a descriptive name for your database change.

### 5.2 Check Migration History

To compare local migration files with the remote migration history, run:

```bash
npx supabase migration list --remote
```

### 5.3 Apply Migrations

To apply pending migrations to the shared remote database, run:

```bash
npx supabase db push --remote
```

> **Important:** Always coordinate with the database administrator before applying migrations to the shared database. Review the SQL changes and confirm that they will not conflict with existing database objects.

## 6. Migration Guidelines

Follow these guidelines when working with database migrations:

- Use descriptive migration filenames.
- Keep each migration focused on a specific database change.
- Do not modify previously applied migrations.
- Review SQL scripts before applying them.
- Coordinate database changes with the team.
- Do not commit passwords, access tokens, or other secrets.
- Keep the original reference SQL script unchanged.

## 7. Reference Files

The `reference/` directory contains the original `HopeDB_audit.sql.txt` script.

This file serves as a reference during database development.

**The original script must be preserved and should not be directly modified.**

## 8. Local Development Note

Running the complete local Supabase development stack requires Docker or a compatible container runtime.

The team currently uses the linked remote Supabase project for database inspection and migration-history checks.

