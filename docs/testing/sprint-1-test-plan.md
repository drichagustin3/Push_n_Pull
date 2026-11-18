# Sprint 1 Master Test Plan & Acceptance Criteria: Task [S1-TST-01]
**Project:** HOPE, Inc. ERP Web Application (`hope_inc_ui`)  
**Module:** Module 1 — Authentication & User Management  
**Reference:** Hope, Inc. ERP Student Guide §4.3 (Test Every Role)  
**Author:** QA & UI/UX Engineering  
**Date:** November 18, 2026  

---

## 1. Test Scope & Execution Strategy

### 1.1 Functional Coverage Matrix
This test plan validates end-to-end functionality, security boundaries, and database state transitions across Module 1 workflows[cite: 3]:
1. **Public Account Registration:** New signups default automatically to `Pending` status and block login access until approved by an administrator[cite: 6, 17].
2. **User Authentication:** Credential verification, session management, and immediate login rejection for `Pending` or `Blocked` accounts[cite: 6, 16, 17].
3. **Password Recovery & Reset:** Secure token generation and password updates[cite: 6].
4. **User Management (CRUD):** Account creation, listing, status modifications, and permission assignments[cite: 17].
5. **Role Hierarchy Enforcement:** Strict boundaries ensuring Admins cannot view Superadmin accounts or edit peer Admin records[cite: 3, 17].
6. **36-Rights Granular Matrix:** Module-level permission toggling across Customer, Product, HR, Sales, and Reports modules[cite: 6, 17].

### 1.2 Test Environments & Guidelines
* **Local Development Environment:** Node.js / Express (`http://localhost:3000`) connected to a local PostgreSQL database[cite: 3].
* **Execution Standard:** Adheres strictly to **Student Guide §4.3** test protocols[cite: 18].

---

## 2. Predefined Test Fixtures & Seed Accounts
All test cases execute against standardized seed accounts provisioned via `scripts/seed-test-users.sql`:

| Account ID | Full Name | Email Address | Plaintext Password | Assigned Role | Account Status | Expected Access Level & Visibility |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `USR-001` | Ashley Superadmin | `superadmin@hope-erp.com` | `HopeSuper#2026` | `Superadmin` | `Active` | Full system access (36/36 rights); sees all rows (including deleted/inactive), Status, and Stamp columns[cite: 3, 18]. |
| `USR-002` | Aldrich Admin | `admin@hope-erp.com` | `HopeAdmin#2026` | `Admin` | `Active` | Manages `User` accounts; sees all rows/stamps; Superadmin hidden; peer Admins read-only[cite: 3, 17, 18]. |
| `USR-003` | Peer Admin Two | `admin2@hope-erp.com` | `HopeAdmin2#2026` | `Admin` | `Active` | Peer Admin account used to test edit restrictions for `USR-002`[cite: 17, 18]. |
| `USR-004` | Active Staff User | `staff@hope-erp.com` | `HopeStaff#2026` | `User` | `Active` | Restricted to explicitly granted rights; active rows only; Status/Stamp hidden[cite: 3, 18]. |
| `USR-005` | Pending Applicant | `pending@hope-erp.com` | `HopePending#2026` | `User` | `Pending` | New registration awaiting admin approval; login blocked[cite: 6, 17]. |
| `USR-006` | Blocked Staff | `blocked@hope-erp.com` | `HopeBlocked#2026` | `User` | `Blocked` | Immediate login rejection due to administrative suspension[cite: 16, 17]. |
| `USR-007` | Archived Former Staff | `deleted@hope-erp.com` | `HopeDeleted#2026` | `User` | `Inactive` (`Deleted`) | Soft-deleted record (`status = 'Inactive'`); visible to Admin/Superadmin only[cite: 3, 5]. |

---

## 3. Role Testing Checklists (Student Guide §4.3)

### 3.1 Superadmin / Admin Role Checklist (§4.3)
- [ ] **Visibility & Audit Columns:** Confirmed that soft-deleted rows are visible (shaded) and that `Status` and `Stamp` metadata columns render properly on data tables[cite: 5, 18].
- [ ] **Soft-Delete Restoration:** Verified that clicking **Restore** successfully brings an inactive/deleted record back to `Active` status with its history intact[cite: 5].
- [ ] **Audit Trail Updates:** Verified that system stamps correctly record actions (`CREATED`, `EDITED`, `DELETED`), actor identity, and timestamps[cite: 5].
- [ ] **Admin Boundary Rules:** Verified that Admins can manage standard Users, but Superadmin accounts remain completely hidden and peer Admin accounts show `-` under Actions[cite: 17, 18].

### 3.2 User Role Checklist (§4.3)
- [ ] **Restricted Data Views:** Verified that standard Users see active rows only (`status = 'Active'`) and that internal `Status` and `Stamp` columns are hidden[cite: 3, 5].
- [ ] **Granular Rights Enforcement:** Verified that navigation menus and action buttons (e.g., Add, Edit, Delete) adapt dynamically based on explicitly assigned module rights[cite: 7, 17].
- [ ] **Blocked User Rejection:** Verified that blocked users are denied authentication when attempting to sign in[cite: 16, 17].

---

## 4. Detailed Functional Test Cases

| Test ID | Scenario / Title | Preconditions | Execution Steps | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | **Public Registration Defaults to Pending** | Unauthenticated visitor on `/register`. | 1. Enter valid details with unique email.<br>2. Submit registration. | 1. New account is created with `role = 'User'` and default `status = 'Pending'`[cite: 6, 17].<br>2. Login access is restricted. |
| **TC-02** | **Login Blocked for Pending Account** | Account `USR-005` exists with `status = 'Pending'`. | 1. Attempt login using `pending@hope-erp.com`. | Authentication is rejected with a pending approval notice[cite: 6, 17]. |
| **TC-03** | **Login Blocked for Suspended Account** | Account `USR-006` exists with `status = 'Blocked'`. | 1. Attempt login using `blocked@hope-erp.com`. | Authentication is rejected due to active account blocking[cite: 16, 17]. |
| **TC-04** | **Admin Directory Isolation & Restrictions** | Logged in as `USR-002` (`Admin`). | 1. Open User Management directory.<br>2. Search for Superadmin and peer Admin (`USR-003`). | 1. Superadmin rows are hidden[cite: 17, 18].<br>2. Peer Admin actions display `-` (read-only)[cite: 17, 18]. |
| **TC-05** | **Soft-Delete & Restore Cycle** | Logged in as Admin/Superadmin. | 1. Delete a test customer/record.<br>2. Filter by Inactive.<br>3. Click Restore. | 1. Record marks as `Inactive` with `DELETED` stamp[cite: 5].<br>2. Restore successfully returns record to `Active` state[cite: 5]. |