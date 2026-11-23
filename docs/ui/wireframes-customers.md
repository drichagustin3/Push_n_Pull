# Wireframe Specifications: Public Entry & Customer Screens (`S2-UIX-01`)

- **Task ID:** S2-UIX-01
- **Assigned To:** @AshleyNicoleMarticio30 (UI/UX Designer)
- **References:** Hope, Inc. ERP Student Guide §3.1, §3.3 (Figures 2, 9, 10)
- **Design Tokens:**
  - Canvas: `#FAF7F2` (Warm Sand)
  - Card Surface: `#FFFFFF` | Soft Panel / Shaded Row: `#F3EEE5`
  - Primary Text & Borders: `#2C1E19` (Deep Espresso)
  - Primary Accent: `#0F766E` (Deep Teal, hover `#115E59`)

---

## 1. Public Landing Page (Figure 2 — Implemented & Merged)
- **Status:** Completed and merged into the main repository (`public/index.html`).
- **Role in Flow:** Serves as the starting entry screen for Hope, Inc. ERP, showcasing available ERP modules (`Customers`, `Suppliers`, `Items`, etc.) and providing **Sign In** and **Register** modals that route authenticated users into the Customer workspace.

---

## 2. Admin Customer View (Figure 9)

### Controls & Filter Bar
- **Status Tabs (with dynamic count badges):**
  - `Active (4)` — Default selected tab
  - `Inactive (1)` — Filters to soft-deleted records only
  - `All (5)` — Shows all active and soft-deleted records
- **Live Search Input:** `Search customers...` (filters in real time across `CUST NO`, `CUSTOMER NAME`, `ADDRESS`, and `PAY TERMS`).
- **Primary Action Button:** `+ Add Customer` (`#0F766E` Deep Teal fill, `#FFFFFF` text).

### Wireframe Layout (`All` Tab View)
```text
+---------------------------------------------------------------------------------------------------+
| Customers                                                                      [+ Add Customer]   |
| Manage customer records, payment terms, and soft-delete recovery.                                 |
+---------------------------------------------------------------------------------------------------+
| [ Active (4) ]  [ Inactive (1) ]  [ All (5) ]                 [ Search customers...           ]   |
+---------------------------------------------------------------------------------------------------+
| CUST NO | CUSTOMER NAME     | ADDRESS               | PAY TERMS | STATUS   | STAMP      | ACTIONS |
|---------|-------------------|-----------------------|-----------|----------|------------|---------|
| C-001   | Acme Trading Co.  | 120 Ayala Ave, Makati | Net 30    | [Active] | 2026-11-10 | Edit    |
|         |                   |                       |           |          | by Admin   | Delete  |
|---------|-------------------|-----------------------|-----------|----------|------------|---------|
| C-002   | Beacon Retail     | 45 Ortigas Ctr, Pasig | Net 15    | [Active] | 2026-11-12 | Edit    |
|         |                   |                       |           |          | by Admin   | Delete  |
|---------|-------------------|-----------------------|-----------|----------|------------|---------|
| C-003   | Crestline Foods   | 88 BGC High St, Taguig| COD       | [Active] | 2026-11-14 | Edit    |
|         |                   |                       |           |          | by Super   | Delete  |
|---------|-------------------|-----------------------|-----------|----------|------------|---------|
| C-004   | Umbrella Corp     | 990 Shaw Blvd, Mand.  | Net 30    | [Deleted]| 2026-11-18 | Edit    |
| (shaded)|                   |                       |           |          | by Admin   | Restore |
|---------|-------------------|-----------------------|-----------|----------|------------|---------|
| C-005   | Vertex Logistics  | 14 Port Area, Manila  | Net 45    | [Active] | 2026-11-20 | Edit    |
|         |                   |                       |           |          | by Admin   | Delete  |
+---------------------------------------------------------------------------------------------------+