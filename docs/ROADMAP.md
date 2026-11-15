# Hope, Inc. ERP — 8-Week Module Roadmap & Sprint Architecture

This document establishes the sprint delivery plan for Hope, Inc. ERP. It distributes all six core modules across four 2-week sprints (an 8-week semester timeline) and sets the governance rules for our GitHub Project board.

---

## 1. Six Modules Architecture & Sprint Delivery Map

As outlined in the **Student Guide §1.1**, the ERP integrates six distinct business modules reading and writing to a unified database.

## Module-to-Sprint Delivery Roadmap

| Sprint & Timeline | Module | Core Purpose & Database Tables | Key Deliverables | Rights Scope |
| :--- | :--- | :--- | :--- | :---: |
| **Sprint 1**<br>*(Weeks 1–2)* | **User Management** | **Purpose:** Authentication, RBAC (`Superadmin`, `Admin`, `User`), account blocking (`isBlocked`), and granular permissions.<br>**Tables:** `app_user`, `role`, `module`, `rights`, `user_permission`, `audit_log` | • Seed complete 36-rights catalogue<br>• Implement salted `bcrypt` auth & expiring reset tokens<br>• Enforce last-Superadmin lockout safeguard<br>• Build role-differentiated dashboard views | **Base Auth**<br>*(Seeds all 36 rights)* |
| **Sprint 2**<br>*(Weeks 3–4)* | **Customers** | **Purpose:** Client registry, billing addresses, and payment terms (`Net 30`, `COD`, `Prepaid`).<br>**Tables:** `CUSTOMER` | • Full CRUD with search & typeahead filtering<br>• Soft delete (`status = 'Inactive'`) & restore<br>• Automated `stamp` audit column generation | **3 Rights**<br>(`customer.*`) |
| **Sprint 2**<br>*(Weeks 3–4)* | **Products & Pricing** | **Purpose:** Item catalogue and chronological effective price history.<br>**Tables:** `PRODUCT`, `PRICEHIST` | • Product CRUD with unit validation<br>• Chronological price effective-date lookup<br>• Live-queried current price derivation | **6 Rights**<br>(`product.*`, `price.*`) |
| **Sprint 3**<br>*(Weeks 5–6)* | **Human Resources** | **Purpose:** Personnel profiles, departments, job assignments, and salary history.<br>**Tables:** `EMPLOYEE`, `JOB`, `DEPARTMENT`, `JOBHISTORY` | • Department & Job lookup table CRUD<br>• Employee master profile & separation dates<br>• Promotion & salary timeline tracking<br>• Data Privacy Act (RA 10173) gating (`jobhistory.view`) | **13 Rights**<br>(`employee.*`, `job.*`, `dept.*`, `jobhistory.*`) |
| **Sprint 4**<br>*(Weeks 7–8)* | **Sales** | **Purpose:** Master-detail sales transactions and customer payment recording.<br>**Tables:** `SALES`, `SALESDETAIL`, `PAYMENT` | • Auto-numbered sales headers<br>• Line items with date-accurate auto-pricing<br>• Live derived totals (`quantity × unitPrice`)<br>• Payment recording & customer balance view | **7 Rights**<br>(`sales.*`, `payment.*`) |
| **Sprint 4**<br>*(Weeks 7–8)* | **Reports** | **Purpose:** Read-only business intelligence summaries with print and PDF export.<br>**Tables:** *Reads all ERP tables via SQL views* | • 7 System Reports *(Master Product List, Active/All Employees, Job History, Top Customers, Top Products, Top Sales)*<br>• Date-range and Top-N filtering<br>• Print & Save-as-PDF support | **7 Rights**<br>(`report.*`) |

---

## 2. Sprint Timeline & PR Quota Overview

The project adheres to strict team quotas (30 PRs per sprint × 4 sprints = 120 total PRs):

### Planned PR Targets by Role

| Team Member | Role | S1 Planned | S2 Planned | S3 Planned | S4 Planned | Total Planned PRs |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Aldrich Rodolf Agustin** | Scrum Master | 5 | 5 | 5 | 5 | **20** |
| **Ashley Nicole Marticio** | UI/UX Developer | 5 | 5 | 5 | 5 | **20** |
| **Ricky Joe Sanglay** | Backend Developer | 8 | 8 | 8 | 8 | **32** |
| **___** | DB Admin | 6 | 6 | 6 | 6 | **24** |
| **___** | Test Engineer | 6 | 6 | 6 | 6 | **24** |
| **Team Total** | | **30** | **30** | **30** | **30** | **120** |

---

## 3. GitHub Project Board Configuration (`AmbatuPull #3`)

The agile board enforces Work In Progress (WIP) constraints to maintain flow and avoid review bottlenecks:

| Column | WIP Limit | Entry Condition | Exit Condition |
| :--- | :---: | :--- | :--- |
| **Backlog** | Unlimited | Issue created and prioritized for sprint. | Developer assigns self and moves to Ready/In progress. |
| **Ready** | Unlimited | Dependencies satisfied; ready for immediate pickup. | Work begins. |
| **In progress** | **5 ** | Feature branch created (`feature/...`); active coding underway. | Code complete, locally verified without Docker. |
| **In review** | **5** | Pull request opened with linked issue (`Closes #...`). | Approved by ≥ 1 teammate; merged into `main`. |
| **Done** | Unlimited | PR merged into `main`; issue closed automatically. | Verified during Sprint Review / Retrospective. |

---

## 4. Development Workflow & Governance

* **Version Control:** All code changes are submitted via Pull Requests mapped directly to GitHub issues.
* **Definition of Done (DoD):** Tasks are only moved to `Done` once code is reviewed, meets the testable acceptance criteria, and passes local validation.
* **Roles & Responsibilities:** Team members operate across specialized roles including Scrum Master, Backend Developer, DB Admin, UI/UX Designer, and Tester.