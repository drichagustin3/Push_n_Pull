# HR Module Wireframe Specifications (`S3-UIX-01` & `S3-UIX-02`)

**Project:** Hope, Inc. ERP  
**Role:** UI/UX Designer (`@AshleyNicoleMarticio30`)  
**Scope:** Frontend UI layout, fields, states, and role gating for `public/hr.html`, `public/hr.css`, and `public/hr.js` (zero changes to database schema or `src/hr/` backend routes)

---

## 1. `[S3-UIX-01]` Wireframe: Departments & Jobs Screens

### Layout Structure
* **Left Sidebar (`ws-sidebar`):** Brand header (`HOPE, INC. ERP`), grouped navigation links (`Main page`, `Customers`, `Products`, `Human Resources` with `aria-current="page"`, `Sales`, `Reports`, `User Management`, `System Settings`, `Audit Log`), and `Sign out` button.
* **Top Workspace Header (`ws-header`):** Module title (`Human Resources`), active user name, role badge (`Superadmin`, `Admin`, or `User`), and role preview selector.
* **Module Tab Bar:** Tabs for `Employees`, `Jobs`, and `Departments` plus primary action button (`+ Add Job` or `+ Add Department` for `Admin` / `Superadmin`).
* **Filter & Search Row:**
  * **Admin / Superadmin:** Status filter pills (`Active`, `Inactive`, `All`) with live record counts.
  * **Standard `User`:** Status filter pills hidden; active records only.
  * **Search & Department Filter:** Live/debounced search input plus department filter dropdown when viewing `Jobs`.

### Table & Modal Wireframes

| Screen / View | Table Columns | Modals & Controls | Role Behavior |
| :--- | :--- | :--- | :--- |
| **Departments (`S3-UIX-01`)** | `DEPT CODE`, `DEPARTMENT NAME`, plus `STATUS`, `STAMP`, and `ACTIONS` (`Edit`, `Delete` / `Restore`) for privileged roles | **Add / Edit Modal:** `deptCode` (text, required), `deptName` (text, required)<br>**Confirm Modal:** Soft-delete (`Inactive`) or restore (`Active`) | **Admin / Superadmin:** Full CRUD + status pills + `STATUS` & `STAMP`<br>**User:** Active records only, no `STATUS`/`STAMP` or edit/delete actions |
| **Jobs (`S3-UIX-01`)** | `JOB CODE`, `DESCRIPTION`, plus `STATUS`, `STAMP`, and `ACTIONS` (`Edit`, `Delete` / `Restore`) for privileged roles | **Add / Edit Modal:** `jobCode` (text, required), `jobDesc` (text, required)<br>**Department Filter:** Filter jobs by department<br>**Confirm Modal:** Soft-delete (`Inactive`) or restore (`Active`) | **Admin / Superadmin:** Full CRUD + status pills + `STATUS` & `STAMP`<br>**User:** Active records only, no `STATUS`/`STAMP` or edit/delete actions |

---

## 2. `[S3-UIX-02]` Wireframe: Employee Directory & Profile Screens

### Layout Structure
* **Employee Directory View:** Uses the same `ws-sidebar` and `ws-header` shell, `Employees` tab, status filter pills (`Active`, `Inactive`, `All` with live counts for `Admin` / `Superadmin`), `+ Add Employee` button, and debounced search by employee ID (`empNo`), first name (`firstName`), or last name (`lastName`).
* **Master-Detail Split:** Directory table on the left/main area; **Employee Profile Panel** opens alongside/beside the table when an employee's `Profile` action is selected.

### Employee Directory Columns
* **Core Columns:** `empNo`, `lastName`, `firstName`, `gender`, `birthDate`, `hireDate`, `sepDate`
* **Privileged Columns (`Admin` / `Superadmin`):** `STATUS` (`.badge`, `.badge-active`, `.badge-inactive` with `white-space: nowrap;`) and `STAMP`
* **Row Actions:** `Profile` (opens profile panel) for all roles; `Edit` and `Delete` / `Restore` for `Admin` / `Superadmin`

### Employee Profile Panel Wireframe
* **Header & Badges:** Full name, job title & department subtitle, status badge (`.badge-active` or `.badge-inactive` with `white-space: nowrap;`), and linked account role badge.
* **Demographic & Employment Fields:** `Employee No.` (`empNo`), `Gender` (`gender`), `Birth Date` (`birthDate`), `Hire Date` (`hireDate`), `Separation Date` (`sepDate`), `Department`, and `Job Title`.
* **Account & Audit Context:** Linked user account and account role; `STAMP` and `Edit Profile` / `Delete` / `Restore` actions shown for `Admin` and `Superadmin`.
* **Add / Edit Employee Modal:** `empNo`, `firstName`, `lastName`, `gender`, `birthDate`, `hireDate`, `sepDate`, department selector, job selector, linked user account, and account role.

---

## 3. Shared States & API Wiring (`public/hr.js` ↔ `/api/hr/*`)
* **Endpoints:** Reads and writes against `/api/hr/employees`, `/api/hr/jobs`, and `/api/hr/departments`, refreshing the table/profile view and showing a toast notification after updates.
* **Feedback & Error States:** Displays loading status, empty-filter messages, inline form/confirm validation errors, `403` permission messages, and `401` session handling.