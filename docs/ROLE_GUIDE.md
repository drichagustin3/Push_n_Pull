# Hope, Inc. ERP — Comprehensive Role Guide

This handbook defines the expectations, targets, and handoff touchpoints for each role across Sprints 1 through 4.

---

## 1. Scrum Master (@drichagusin3)
- **Target:** 5 planned PRs per sprint (20 total PRs across 4 sprints).
- **Core Duties:**
  - **Repository Governance:** Enforces branch protection rules, PR templates, and Git workflow standards across the codebase.
  - **Board Management:** Administers the GitHub Projects board (`Push_n_Pull #29`) while maintaining strict Work-in-Progress (WIP) column limits.
  - **Sprint Tracking & Blockers:** Runs Day 5 Mid-Sprint Check-ins to monitor progress and logs team impediments for quick resolution.
  - **Sprint Ceremonies:** Leads Day 10 Sprint Reviews and documents actionable Sprint Retrospective reports.
  - **Delivery Oversight:** Keeps all 6 Hope, Inc. ERP modules aligned with the 4-sprint, 8-week semester timeline.

---

## 2. UI/UX Designer (@AshleyNicoleMarticio30)
- **Target:** 5 planned PRs per sprint (20 total PRs across 4 sprints).
- **Core Duties:**
  - **Design System Ownership:** Defines the Hope ERP visual standard, including color tokens (brand blue `#1E3A8A`, dark header `#0F172A`), status badges, and layout grids.
  - **Authentication Wireframes:** Creates wireframes and user flows for public screens (Landing, Login, Register, and Forgot Password).
  - **Role-Based Dashboards:** Designs distinct, permission-aware dashboard layouts tailored for `Superadmin`, `Admin`, and `User` roles.
  - **36-Rights Permission Modal:** Architects the interactive rights matrix modal featuring module-level master toggles and All/None bulk shortcuts.
  - **Developer Handoff Specs:** Delivers high-fidelity mockups with clear UI state specifications (`Active`, `Inactive`, `Blocked`) for frontend implementation.
  - **Usability QA:** Conducts end-of-sprint UI/UX reviews to verify visual parity against the Student Guide reference screens.

---

## 3. Backend Developer (@rickysanglay)
- **Target:** 8 planned PRs per sprint (32 total PRs across 4 sprints).
- **Core Duties:**
  - **Core Architecture:** Builds the server skeleton, API routing structure, and database connection pooling.
  - **Authentication & Recovery:** Implements salted `bcrypt` password hashing, session management, and expiring password reset flows.
  - **Account Safeguards:** Enforces account blocking (`isBlocked`) alongside the **Last-Superadmin lockout safeguard**.
  - **User & Rights APIs:** Develops administrative User Management CRUD endpoints and the 36-rights permission assignment API.
  - **Server-Side RBAC:** Protects all routes with server-side authorization middleware (`requireRole`, `requireRight`).
  - **Dynamic Data Queries:** Computes derived values (such as counts and invoice totals) via live SQL queries (`COUNT`, `SUM`), avoiding redundant stored data.

---

## 4. DevSecOps ()
- **Target:** 6 planned PRs per sprint (24 total PRs across 4 sprints).
- **Core Duties:**
  - **Schema Architecture:** Designs relational schemas aligned with the Student Guide ERD (Figure 1) and Table Dictionary (§2.2).
  - **Migration Tooling:** Maintains the lightweight CLI migration runner under `scripts/migrate` (Docker-free workflow).
  - **Table Standards:** Ensures every table enforces soft-delete `status` (`Active`/`Inactive`) and `stamp` audit columns (§2.3).
  - **Initial Data Seeding:** Populates the 36 per-action rights catalog (§3.8) and initial `Superadmin` developer accounts.
  - **Database Audit Trail:** Implements automated activity tracking via the `audit_log` table and `audit_user()` session context.
  - **Referential Integrity:** Enforces delete constraints to block removing customers or products tied to active sales records.

---

## 5. Test Engineer ()
- **Target:** 6 planned PRs per sprint (24 total PRs across 4 sprints).
- **Core Duties:**
  - **Test Planning:** Formulates Master Test Plans and defines verifiable acceptance criteria for every sprint.
  - **Comprehensive Test Design:** Builds test suites covering positive workflows, negative input validations, and boundary edge cases.
  - **RBAC Security Verification:** Executes tests across the 36-rights permission matrix to validate both UI element hiding and HTTP `403` API denials.
  - **Automated Smoke Testing:** Develops automated smoke test scripts to verify critical authentication and navigation paths.
  - **Defect Management & Sign-Off:** Tracks bug triage, validates developer fixes, and issues formal end-of-sprint QA Sign-Off reports.