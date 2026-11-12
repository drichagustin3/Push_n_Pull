Database Setup Guide – HOPE Inc. (Push_n_Pull)

1. Overview

This directory contains the database documentation and reference SQL script for the HOPE Inc. project.

The project uses Supabase (PostgreSQL) as its database platform and the Supabase CLI to manage database migrations.

2. Directory Structure

database/
├── README.md
└── reference/
    └── HopeDB_audit.sql.txt

supabase/
├── config.toml
└── migrations/
    └── <timestamp>_migration_name.sql

3. Prerequisites

Before working with the database, install:

Node.js and npm

Supabase CLI

Git

4. Supabase Project Setup

Open the project repository in your terminal.

Authenticate with Supabase:

npx supabase login

Link the repository to the team's Supabase project:

npx supabase link --project-ref YOUR_PROJECT_REF

Replace YOUR_PROJECT_REF with the project reference provided by the team.

5. Migration Workflow

Create a migration

npx supabase migration new migration_name

Check migration history

npx supabase migration list --remote

Apply migrations

npx supabase db push --remote

Important: Coordinate with the database administrator before applying migrations to the shared database. Review the SQL changes and confirm that they will not conflict with existing database objects.

6. Migration Guidelines

Use descriptive migration filenames.

Keep each migration focused on a specific database change.

Do not modify previously applied migrations.

Review SQL scripts before applying them.

Coordinate database changes with the team.

Do not commit passwords, access tokens, or other secrets.

Keep the original reference SQL script unchanged.

7. Reference Files

The reference/ directory contains the original HopeDB_audit.sql.txt script for reference during database development.

The original script should be preserved and should not be directly modified.

8. Local Development Note

Running the complete local Supabase stack requires Docker or a compatible container runtime. The team currently uses the linked remote Supabase project for database inspection and migration-history checks.