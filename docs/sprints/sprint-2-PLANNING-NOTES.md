# Sprint 2 Planning Notes 
**Sprint:** Sprint 2 (Weeks 3 - 4)
**Module:** Module 2 (Customer Management) and Module 3 (Product Management & Price History)

## 1. Sprint Goals
- Build customer directory list views with search filtering, complete CRUD functionality, and soft-delete/restore capabilities.
- Develop product catalog list views alongside creation and management forms.
- Implement effective-date price history tracking (supporting adding, editing, and deleting price entries) with active current-price resolution and granular permission checks enforced across both modules.

## 2. Role Responsibilities & Core Focuses
| **Role** | **Sprint 2 Focus Areas** |
| --- | --- |
| Scrum Master | - Set up Sprint 2 planning notes and organize the board with user stories and testable acceptance criteria.<br>- Track progress on action items carried over from the Sprint 1 retrospective.<br>- Run mid-sprint check-ins, track blockers, refresh velocity and burndown charts, and lead the Sprint 2 review and retrospective. |
| UI/UX Designer | - Create wireframes for Customer workflows (list, search/filter, create/edit) as well as Product and Price History views.<br>- Deliver high-fidelity mockups along with clear developer handoff specifications.<br>- Design empty, error, and delete-confirmation states, and review implemented screens for usability. |
| Backend Developer | - Implement Customer CRUD endpoints, search/filter logic, and soft-delete/restore flows.<br>- Build Product catalog CRUD operations, search/filter support, and soft-delete/restore handling.<br>- Add effective-date price history management (create, update, delete), active current-price calculation, and action-level permission guards across both modules. |
| DB Admin | - Build active database views for customers and products that filter out soft-deleted rows.<br>- Add targeted indexes and tune search queries for better performance.<br>- Load seed data for customers, products, and price tiers, and block deletion when active dependent records exist. |
| Tester | - Draft and run test cases covering Customer Management, Product Catalog, and Effective-Date Price History.<br>- Validate soft-delete/restore behavior (including active child-record delete restrictions) and granular permission enforcement.<br>- Perform Sprint 2 regression testing, file defects, and confirm resolved issues. |

# Sprint 2 GitHub Issue Drafts

---

## Issue 1: [S2-SM-01] Sprint 2 Planning, Board Governance & Retrospective Ceremonies
**Role:** Scrum Master  
**Reference:** Hope, Inc. ERP Student Guide §3.1–§3.8, §4.2–§4.3 (`GitHub Projects / Issues`)

### 🎯 Description & Objectives
- **Configure the Sprint 2 project board, follow up on Sprint 1 retrospective improvements, and maintain sprint execution cadence through mid-sprint tracking, impediment resolution, and sprint ceremonies.**

### 🛠️ Detailed Requirements
- **Set up Sprint 2 planning notes and populate the board (`To Do`, `In Progress`, `Review`, `Done`) with user stories and testable acceptance criteria.**
- **Review and track action items carried over from the Sprint 1 retrospective.**
- **Conduct mid-sprint check-ins, maintain the impediment log, update velocity and burndown metrics, and facilitate the Sprint 2 review and retrospective.**

### ✅ Acceptance Criteria
- [ ] **Board & Backlog Ready:** Sprint 2 project board is populated with scoped user stories, assignees, labels, and acceptance criteria.
- [ ] **Retrospective Follow-Up:** Sprint 1 action items are documented and tracked to completion.
- [ ] **Metrics & Ceremonies:** Impediment log, velocity/burndown charts, and Sprint 2 review/retrospective notes are completed and archived.

---

## Issue 2: [S2-UIX-01] Customer, Product & Price History Wireframes, Mockups & Usability Review
**Role:** UI/UX Designer  
**Reference:** Hope, Inc. ERP Student Guide §3.3 (Figures 9–10), §3.4 (Figures 11–14) (`docs/ui/`)

### 🎯 Description & Objectives
- **Design wireframes, high-fidelity mockups, and UI interaction states for Customer, Product, and Price History screens, providing developer handoff notes and conducting a usability review of built views.**

### 🛠️ Detailed Requirements
- **Create wireframes for Customer screens (list, search/filter, create/edit) and Product & Price History screens across Admin and User roles.**
- **Produce high-fidelity mockups with layout tokens, spacing rules, and developer handoff specifications.**
- **Design empty, error, and confirm-delete UI states, and perform a usability review against implemented frontend screens.**

### ✅ Acceptance Criteria
- [ ] **Wireframes & Mockups Committed:** Wireframes and high-fidelity mockups for Customer, Product, and Price History flows are committed under `docs/ui/`.
- [ ] **Edge States Designed:** Empty, error, and delete-confirmation states are specified in the handoff notes.
- [ ] **Usability Review Completed:** Built frontend screens are reviewed against approved mockups with UI feedback logged.

---

## Issue 3: [S2-DEV-01] Customer & Product CRUD, Effective-Date Price History & RBAC Guards
**Role:** Backend Developer  
**Reference:** Hope, Inc. ERP Student Guide §1.2, §2.3, §3.3, §3.4, §4.2 (`POST/GET/PUT/DELETE /api/customers`, `/api/products`)

### 🎯 Description & Objectives
- **Implement backend endpoints and business logic for Customer and Product CRUD, search/filtering, soft delete/restore, and effective-date price history tracking with granular permission enforcement.**

### 🛠️ Detailed Requirements
- **Build Customer CRUD endpoints, live search/status filtering, soft-delete/restore workflows, and `audit_log` / `STAMP` tracking.**
- **Build Product catalog CRUD operations, search/filter support, and soft-delete/restore handling.**
- **Implement effective-date price history tracking (add/edit/delete tiers), active `CURRENT PRICE` resolution (`PRICEHIST`), and action-level permission checks (`requireRight(...)`) across both modules.**

### ✅ Acceptance Criteria
- [ ] **Customer & Product APIs:** Full CRUD, search/filter, and soft-delete/restore endpoints are operational with proper `STAMP` and `audit_log` entries.
- [ ] **Effective-Date Pricing:** Price history add/edit/delete endpoints and current-price lookup logic resolve active prices accurately by date.
- [ ] **Permission Enforcement:** Server-side role visibility rules and per-action permission guards block unauthorized requests (`HTTP 403`).

---

## Issue 4: [S2-DBA-01] Active Record Views, Query Indexes, Seed Data & Referential Delete Guards
**Role:** DB Admin  
**Reference:** Hope, Inc. ERP Student Guide §2.3, §3.3, §3.4, §4.2 (`db/migrations/`, `db/seeds/`)

### 🎯 Description & Objectives
- **Optimize database performance and data integrity by creating active-record views, strategic search indexes, realistic demo seed data, and delete restrictions for records with active child dependencies.**

### 🛠️ Detailed Requirements
- **Create database views for active customers and active products (`WHERE status = 'Active'`) to filter out soft-deleted records.**
- **Configure strategic indexes on frequently queried lookup, status, and search columns in Customer, Product, and `PRICEHIST` tables.**
- **Populate seed data for customers, products, and price history tiers, and enforce delete blocks when active child records exist.**

### ✅ Acceptance Criteria
- [ ] **Active Views & Indexes:** Active customer/product views and search/filter indexes are deployed and verified via test queries.
- [ ] **Seed Data Loaded:** Representative demo records for customers, products, and multi-tier price histories are populated cleanly.
- [ ] **Referential Delete Protection:** Database constraints or checks prevent deleting parent records when active child records exist.

---

## Issue 5: [S2-TST-01] Sprint 2 Functional, Soft-Delete, Permission & Regression Test Suite
**Role:** Tester  
**Reference:** Hope, Inc. ERP Student Guide §2.3, §3.3, §3.4, §4.2–§4.3 (`tests/`, `docs/qa/`)

### 🎯 Description & Objectives
- **Author and execute comprehensive QA test suites covering Customer Management, Product Catalog, Effective-Date Price History, soft delete/restore rules, and granular RBAC permissions.**

### 🛠️ Detailed Requirements
- **Write and run functional test cases for Customer CRUD/search, Product CRUD/search, and Effective-Date Price History resolution.**
- **Verify soft-delete/restore behavior (including delete blocks when active child records exist) and test per-right permission guards across `Superadmin`, `Admin`, and `User` roles.**
- **Execute Sprint 2 regression suites, file reproducible bug reports, and verify resolved defects prior to sprint sign-off.**

### ✅ Acceptance Criteria
- [ ] **Test Execution Completed:** All test cases for Customer, Product, Price History, soft delete/restore, and RBAC rights are executed and documented.
- [ ] **Security & Integrity Verified:** Unauthorized API actions return `HTTP 403` and soft-deleted records remain hidden from standard `User` views.
- [ ] **Regression & Defect Closure:** Sprint 2 regression tests pass and all logged defects are verified closed.