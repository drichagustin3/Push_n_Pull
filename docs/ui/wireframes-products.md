# Wireframe Specifications: Product & Price History Screens (`S2-UIX-02`)

- **Task ID:** S2-UIX-02
- **Assigned To:** @AshleyNicoleMarticio30 (UI/UX Designer)
- **References:** Hope, Inc. ERP Student Guide §3.4 (Figures 11, 12, 13, 14)
- **Design System Tokens:**
  - Background Canvas: `#FAF7F2` (Warm Sand)
  - Card / Row Surface: `#FFFFFF` | Soft Panel / Shaded Inactive Row: `#F3EEE5`
  - Primary Text & Borders: `#2C1E19` (Deep Espresso)
  - Primary Action Accent: `#0F766E` (Deep Teal, hover `#115E59`)

---

## 1. Admin Product Management View (Figure 11)

### Purpose & Governance Rules
Provides Admins and Superadmins full catalog visibility, including active and soft-deleted products, current effective pricing, audit timestamps (`STAMP`), and restoration controls.

### Controls & Filter Bar
- **Status Tabs (with dynamic count badges):**
  - `Active (4)` — Default selected tab
  - `Inactive (1)` — Filters to soft-deleted product records only
  - `All (5)` — Displays both active and soft-deleted products
- **Live Search Input:** `Search products...` (filters in real time across `PROD CODE`, `DESCRIPTION`, and `UNIT`).
- **Primary Action Button:** `+ Add Product` (`#0F766E` Deep Teal fill, `#FFFFFF` text).

### Wireframe Layout (`All` Tab Selected)
```text
+----------------------------------------------------------------------------------------------------------+
| Products                                                                                [+ Add Product]  |
| Manage product catalog items, units of measure, and effective-date pricing.                              |
+----------------------------------------------------------------------------------------------------------+
| [ Active (4) ]  [ Inactive (1) ]  [ All (5) ]                       [ Search products...               ] |
+----------------------------------------------------------------------------------------------------------+
| PROD CODE | DESCRIPTION          | UNIT | CURRENT PRICE | STATUS   | STAMP      | ACTIONS                |
|-----------|----------------------|------|---------------|----------|------------|------------------------|
| P-001     | Industrial Solvent   | drum | ₱4,850.00     | [Active] | 2026-11-10 | Prices | Edit | Delete |
|           |                      |      |               |          | by Admin   |                        |
|-----------|----------------------|------|---------------|----------|------------|------------------------|
| P-002     | Hydraulic Hose 1/2"  | mtr  | ₱320.00       | [Active] | 2026-11-12 | Prices | Edit | Delete |
|           |                      |      |               |          | by Admin   |                        |
|-----------|----------------------|------|---------------|----------|------------|------------------------|
| P-003     | Lubricant Oil 5L     | can  | ₱1,250.00     | [Active] | 2026-11-14 | Prices | Edit | Delete |
|           |                      |      |               |          | by Super   |                        |
|-----------|----------------------|------|---------------|----------|------------|------------------------|
| P-004     | Legacy Gasket Kit    | set  | —             | [Deleted]| 2026-11-18 | Prices | Edit | Restore|
| (shaded)  |                      |      |               |          | by Admin   |                        |
|-----------|----------------------|------|---------------|----------|------------|------------------------|
| P-005     | Heavy-Duty Bearing   | pcs  | ₱780.00       | [Active] | 2026-11-20 | Prices | Edit | Delete |
|           |                      |      |               |          | by Admin   |                        |
+----------------------------------------------------------------------------------------------------------+