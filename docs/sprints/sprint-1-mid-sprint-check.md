# [S1-SM-04] Sprint 1 Mid-Sprint Check Notes: Week 1

**Project:** HOPE, Inc. ERP | **Sprint:** 1 | **Coverage:** Week 1 (Days 1-5) | 

---

## 1. Sprint Statistics

| Metric | Value |
|---|---|
| Merged PRs | 13 of 30 (43%) |
| Sprint time elapsed | 5 of 10 days (50%) |
| Week 1 tasks merged | 13 of 15 due |
| Open impediments | 2 (both High) |
| Overall status | **At risk** |

---

## 2. Week 1 Task Status

| Task ID | Task | Role | Due | PR | Status | Notes |
|---|---|---|---|---|---|---|
| S1-SM-01 | Repo setup: branch protection, PR and issue templates | Scrum Master | 1 | #28 | Merged | |
| S1-SM-02 | Sprint 1 board and acceptance criteria | Scrum Master | 1 | #29 | Merged | |
| S1-SM-03 | Working agreement, Definition of Done, role guide | Scrum Master | 2 | #30 | Merged | |
| S1-DEV-01 | Project scaffold: app skeleton, env config, DB connection | Developer | 2 | #3 | Merged | |
| S1-DBA-01 | Team database setup, migration runner, setup README | DB Admin | 2 | #1 | Merged | |
| S1-UIX-01 | Design system | UI/UX Designer | 2 | #27 | Merged | |
| S1-DBA-02 | Migration: HOPE base tables and sample data | DB Admin | 3 | #10 | Merged | |
| S1-DEV-02 | Register user form and API | Developer | 4 | #4 | Merged | |
| S1-UIX-02 | Wireframes: login, register, set/reset password | UI/UX Designer | 3 | #38 | Merged | |
| S1-DEV-03| Login and logout with session handling; password hashing and set-password on first login; blocked users cannot sign in | Developer | 4 | #8 | Merged | |
| S1-DBA-03 | Migration: app_user, roles, rights catalogue, user_permission | DB Admin | 4 | #39 | Merged | |
| S1-UIX-03 | Wireframes: main page, User Management, Rights dialog | UI/UX Designer | 4 | #32 | Merged | |
| S1-DBA-04 | Migration: password reset token table | DB Admin | 5 | #40 | Merged | |
| S1-SM-04 | Mid-sprint check notes and impediment log | Scrum Master | 5 | - | In progress | This document |

---

## 3. Velocity Analysis

### Team velocity

| Measure | Value |
|---|---|
| Planned pace | 3.0 PRs/day (30 PRs over 10 days) |
| Actual pace, Week 1 | 2.8 PRs/day (13 PRs over 5 days) |
| Week 1 completion vs. plan | 53% (14 of 15 due) |
| PRs remaining | 17 |
| Pace needed to finish | 3.0 PRs/day |
| Projected total at current pace | 17 of 30 (56%) |

### Velocity by role

| Role | Planned | Merged | Remaining | Needed per day | Projected at current pace | Role minimum | Target |
|---|---|---|---|---|---|---|---|
| Developer | 8 | 3 | 5 | 1.2 | 4 | 5 | 8 |
| DB Admin | 6 | 4 | 2 | 0.8 | 4 | 4 | 6 |
| Tester | 6 | 0 | 6 | 1.0 | 2 | 4 | 6 |
| UI/UX Designer | 5 | 3 | 2 | 0.6 | 4 | 3 | 5 |
| Scrum Master | 5 | 3 | 2 | 0.8 | 2 | 3 | 5 |
| **Team** | **30** | **13** | **17** | **4.4** | **16** | | **30** |


### Observations
- **Back-loaded plan:** Week 2 has 15 tasks due, with 10 of them on Days 8-9 (4 on Day 8, 6 on Day 9). Any slip on Day 6-7 pushes work past the sprint end.
- **Dependency chain:** DBA-03/04/05 to DEV-03 to DEV-05/06/07/08 to TST-04/05. Developer, Tester and DB Admin velocity all depend on the same blockers. But the tester is not yet moving.
- **Below minimum at current pace:** Developer (4 vs. 5), Tester (1 vs. 3) and Scrum Master (3 vs. 4). DB Admin is exactly at the minimum.
- **Strongest pace:** UI/UX, DB Admin and Developer, but we need the tester to start now.

## 4. Additional Notes

### Went well

* The core foundations have been successfully established: repository setup and templates, project scaffold, team database setup featuring a migration runner, HOPE base tables and sample data, along with the design system, have all been merged.
* The user registration form and API (`DEV-02`) have been officially approved and merged.
* The team maintains consistent use of the `[S1-ROLE-NN]` naming convention for pull requests.
* Every merged pull request includes peer approval, fulfilling the requirement for a valid PR.

### Needs Attention

* The Tester needs to start his work now to test the works of other team members.
* The correlation of Developer tasks and UI Designs need to work when the testing starts.

## 5. Impediment Log

| ID | Impediment | Category | Affected tasks | Impact | Severity | Mitigation / next action |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| I-01 | Frontend and backend APIs for user, admin, and superadmin logins failed to connect properly. | Technical / integration | S1-DEV-03, DEV-04, DEV-05, DEV-06, DEV-07, DEV-08, TST-02, TST-04, TST-05, UIX-05 | Prevents end-to-end login for all roles, halting the authentication flow, main dashboard, permissions, permission testing, and system smoke tests. | High | Hold a collaborative troubleshooting session to check base URLs, environment configurations, endpoint routes, payloads, and CORS settings. Validate seeded accounts across all user types and update the README with the verified setup. |
| I-02 | **Tester role gap:** the team doesn't have a tester role resulting to be lack off on testing the design and making the teammates work overtime. (Root cause of I-01.) | Testing / Usability of the project | Work connections and Tests 01 - 05 | Double work, duplicated effort, and late discovery of integration errors. | High | The role must be divided into three so that it will lessen the heavy load of work. Making the testing much easier because the whoever is assigned can personally test their work. |

## 6. Next Check-in

- **Daily sync:** every day from Day 6 to Day 10.
- **Impediment review:** Day 7 (re-check I-01 and I-02; decide on carryover).
- **Sprint 1 review and retrospective:** Day 10 (S1-SM-05).