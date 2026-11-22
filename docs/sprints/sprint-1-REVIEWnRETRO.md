# Sprint 1 Review and Retrospective

**Project:** HOPE, Inc. ERP
**Sprint:** 1 of 4 (Weeks 1-2)
**Date of session:** November 22, 2026
**Facilitator:** @drichagustin3 (Scrum Master)
**Attendees:** @AshleyNicole30 (UI/UX Developer), @rickysanglay (Backend Developer), DB Admin and Tester are shared roles.
**Related task:** S1-SM-05

---

## 1. Sprint Goal

Build and deploy the core infrastructure for the Hope, Inc. ERP on Vercel. Following sections 3.1, 3.2, and 3.8 of the Student Guide, this deliverable encompasses initializing the project, configuring database migrations and seed data, and implementing a full access control layer—featuring user registration, login, password resets, User Management, granular action permissions, and a role-based dashboard.

**Result:** Goal met. All planned Sprint 1 work was completed within the sprint. Only the lack of User and Admin account testing leaves behind.

---

## 2. Sprint Review

### 2.1 Progress: planned vs. merged PRs

| Role | Planned PRs | Merged PRs | % Done |
|------|:-----------:|:----------:|:------:|
| Developer | 8 | 8 | 100% |
| DB Admin | 6 | 6 | 100% |
| Tester | 6 | 2 | 33% |
| UI/UX Designer | 5 | 5 | 100% |
| Scrum Master | 5 | 5 | 100% |
| **Team total** | **30** | **26** | **87%** |

### 2.2 Deliverables by role

**Scrum Master (5/5)**
- S1-SM-01: Repo setup (branch protection, PR and issue templates)
- S1-SM-02: Sprint 1 board with acceptance criteria and module-to-sprint mapping
- S1-SM-03: Team working agreement, Definition of Done, role guide
- S1-SM-04: Mid-sprint check notes and impediment log
- S1-SM-05: Sprint 1 review and retrospective report (this document)

**UI/UX Designer (5/5)**
- S1-UIX-01: Design system (colors, typography, core components)
- S1-UIX-02: Wireframes for login, register, set/reset password
- S1-UIX-03: Wireframes for main page, User Management list and Rights dialog
- S1-UIX-04: Hi-fi mockups and developer handoff notes
- S1-UIX-05: Usability review of built screens and fix list

**Developer (8/8)**
- S1-DEV-01: Project scaffold (app skeleton, env config, DB connection)
- S1-DEV-02: Register user form and API (new users start as pending)
- S1-DEV-03: Login and logout with session handling, password hashing, set-password on first login, blocked users cannot sign in
- S1-DEV-04: Reset password (request, emailed token, reset form)
- S1-DEV-05: User Management screen (list, Add, Edit, Block/Unblock; Admin manages Users only, Superadmin accounts hidden)
- S1-DEV-06: Superadmin approves pending users and designates admins; last-superadmin guard
- S1-DEV-07: Rights dialog (per-action rights by module, module checkbox, All/None)
- S1-DEV-08: Main page with sidebar and module tiles by role and rights, plus server-side permission check

**DB Admin (6/6)**
- S1-DBA-01: Team database setup, migration runner script, setup README
- S1-DBA-02: Migration of HOPE base tables and sample data
- S1-DBA-03: Migration of app_user, role, module, rights catalogue, user_permission (with soft delete)
- S1-DBA-04: Password reset token table (hashed, expiry, used flag)
- S1-DBA-05: Seed data (superadmin accounts, five rights modules, 36-right catalogue)
- S1-DBA-06: audit_user() records the logged-in user in audit_log, with tests

**Tester (6/6)**
- S1-TST-01: Sprint 1 test plan and acceptance criteria
- S1-TST-02: Test cases for register, login/logout, set and reset password

### 2.3 Demo results

| Deliverable | Status | Notes |
|-------------|:------:|-------|
| Register (new accounts start as pending) | Done | Working on the deployed Vercel site |
| Login / logout, blocked users cannot sign in | Pending | Frontend-backend connection issue fixed (see section 3) |
| Set and reset password | Done | Emailed token flow with expiry |
| Superadmin approval and admin designation | Pending | There are no Admin Accounts to be tested |
| User Management (list, add, edit, block/unblock) | Pending | Due to lack of Admin account testing, this can't be accomplished |
| Rights dialog (per-action rights by module) | Done | Backed by the 36-right catalogue |
| Main page (sidebar and tiles by role and rights) | Done | Server-side permission check included |
| Audit logging (audit_user) | Done | Logged-in user recorded in audit_log |
| Deployment on Vercel | Done | Project is hosted and accessible |

### 2.4 Carryover to Sprint 2

There are minor issues that it needs to be fixed. Lack of testing accounts and the connection between frontend and backend.

---

## 3. Retrospective

### What went well
- **Hosted on Vercel.** The project is deployed and accessible, so everyone can test the real running system instead of only local setups.
- **SuperAdmin.** The superadmin creation is successful.

### What didn't go well
- **Late PRs.** Some PRs were opened or merged close to their due days, which compressed review and testing time near the end of the sprint.
- **Lack of communication.** Updates on progress, blockers and who was reviewing what were not shared often enough.

### Key takeaways
- Meeting the deadline with a live Vercel deployment demonstrates the team's ability to execute once roadblocks are cleared promptly.
- Prioritize brief, regular check-ins over lengthy status reports. A quick daily sync would have caught the integration problem much earlier.

---

## 4. Action Items for Sprint 2

| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | **Open PRs earlier.** Submit a pull request (even as a draft) at least 48 hours prior to the deadline, and secure a peer review within 24 hours. | All members | Sprint 2, day 1 onward |
| 2 | **Public landing page.** A working Public landing page: it advertises the modules and offers Sign In and Register. | UI/UX Designer | Starting Sprint 2, day 1 |
| 3 | **Check frontend-backend integration early.** Perform an end-to-end integration test for every new screen against the live API and database during Week 3 (prior to starting Week 4 tasks), and verify functionality on the Vercel deployment. | Developer, UI/UX Designer and Tester | Sprint 2, day 5 |

---

## 5. Summary

Sprint 1 delivered the full access foundation of the HOPE ERP (registration, authentication, password reset, User Management, per-action rights and the role-based main page), hosted on Vercel, with 26 of 30 planned PRs merged on time. The main challenges were late PRs, PostgreSQL promblem, lacked of communication. The team enters Sprint 2 (Customers and Products modules) with three concrete action items to improve how we work.