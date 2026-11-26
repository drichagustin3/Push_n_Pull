# [S1-SM-04] Sprint 1 Mid-Sprint Check Notes: Week 1

**Project:** HOPE, Inc. ERP | **Sprint:** 2 | **Coverage:** Week 2 (Days 1-5) | 

---

## 1. Sprint Statistics

| Metric | Value |
|---|---|
| Merged PRs | 15 of 30 (50%) |
| Sprint time elapsed | 5 of 10 days (50%) |
| Week 1 tasks merged | 15 of 15 due |
| Open impediments | 1 (High) |
| Overall status | **At risk** |

---

## 2. Week 1 Task Status

| Task ID | Task | Role | Due | Status | Notes |
|---|---|---|---|---|---|
| S2-SM-01 | Sprint 2 planning notes and board | Scrum Master | 1 | Merged | |
| S2-DEV-01 | Customer list with search and filter (permission-checked) | Developer | 2 | Merged | |
| S2-DBA-01 | Customer and product active views, indexes | DB Admin | 2 | Merged | |
| S2-UIX-01 | Wireframes: customer screens | UI/UX Designer | 2 | Merged | |
| S2-DEV-02 | Customer create and edit form | Developer | 3 | Merged | |
| S2-UIX-02 | Wireframes: product and price history screens | UI/UX Designer | 3 | Merged | |
| S2-SM-02 | Follow up Sprint 1 retro actions | Scrum Master | 3 | Merged | |
| S2-DEV-03 | Customer soft delete and restore | Developer | 4 | Merged | |
| S2-TST-01 | Test cases: customer module | Tester | 3 | Not started | Overdue; Customer CRUD is already merged |
| S2-DBA-02 | Query: current price as of a given date | DB Admin | 4 | Merged | |
| S2-DEV-04 | Product list with search and filter | Developer | 5 | Merged | |
| S2-DBA-03 | Validation constraints (payTerms, unit) | DB Admin | 5 | Merged | |
| S2-TST-02 | Test cases: product and price history | Tester | 5 | Not started | Overdue |
| S2-UIX-03 | Hi-fi mockups and handoff notes | UI/UX Designer | 5 | Merged ||
| S2-SM-03 | Mid-sprint check and impediment log | Scrum Master | 5 | In progress | This document |
| S2-DEV-05 | Product create and edit form *(Week 4)* | Developer | 6 | Merged | Completed ahead of schedule |
| S2-UIX-04 | Empty, error and confirm-delete states | UI/UX Designer | 5 | Merged | Completed ahead of schedule |
| S2-DEV-06 | Product soft delete and restore | Developer | 5 | Merged | Completed ahead of schedule |

---

## 3. Velocity Analysis

### Team velocity

| Measure | Value |
|---|---|
| Planned pace | 3.0 PRs/day (30 PRs over 10 days) |
| Actual pace, Week 1 | 3.0 PRs/day (15 PRs over 5 days) |
| Week 1 completion vs. plan | 50% (15 of 15 due) |
| PRs remaining | 15 |
| Pace needed to finish | 3.0 PRs/day |
| Projected total at current pace | 15 of 30 (50%) |

### Velocity by role

| Role | Planned | Merged | Remaining | Needed per day | Projected at current pace | Role minimum | Target |
|---|---|---|---|---|---|---|---|
| Developer | 8 | 6 | 2 | 1.2 | 6 | 5 | 8 |
| DB Admin | 6 | 3 | 3 | 0.8 | 3 | 3 | 6 |
| Tester | 6 | 0 | 6 | 1.0 | 0 | 4 | 6 |
| UI/UX Designer | 5 | 4 | 1 | 0.6 | 4 | 3 | 5 |
| Scrum Master | 5 | 2 | 3 | 0.8 | 2 | 3 | 5 |
| **Team** | **30** | **15** | **15** | **4.4** | **19** | | **30** |


### Observations
- **Pace is going according to the plan:** There are no late pr's this time, only the tester role.
- **Strongest pace:** All role besides tester, we need the tester to start now.

## 4. Additional Notes

### Went well

* The team works according to assigned tasks and time, any bugs that needed to be fixed is always done.
* The team maintains consistent use of the `[S1-ROLE-NN]` naming convention for pull requests.
* Every merged pull request includes peer approval, fulfilling the requirement for a valid PR.

### Needs Attention

* The Tester needs to start his work now to test the works of other team members.
* The correlation of Developer tasks and UI Designs need to work when the testing starts.

## 5. Impediment Log

| ID | Impediment | Category | Affected tasks | Impact | Severity | Mitigation / next action |
| ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| I-01 | **Tester role gap:** the team doesn't have a tester role resulting to be lack off on testing the design and making the teammates work overtime. | Testing / Usability of the project | Work connections and Tests 01 - 06 | Double work, duplicated effort, and late discovery of integration errors. | High | The role must be divided into three so that it will lessen the heavy load of work. Making the testing much easier because the whoever is assigned can personally test their work. |

## 6. Next Check-in

- **Daily sync:** every day from Day 6 to Day 10.
- **Impediment review:** Day 7 (re-check I-01; decide on carryover).
- **Sprint 1 review and retrospective:** Day 10 (S1-SM-05).