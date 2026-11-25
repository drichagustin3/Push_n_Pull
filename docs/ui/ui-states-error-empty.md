# UI States, Error Handling & Confirmation Specifications (`S2-UIX-04`)

- **Task ID:** S2-UIX-04
- **Assigned To:** @AshleyNicoleMarticio30 (UI/UX Designer)
- **References:** Hope, Inc. ERP Student Guide §2.3, §3.3 (Figures 9–10), §3.4 (Figures 11–14) & Warm Sand & Espresso Design System
- **Implemented Files:** `docs/ui/ui-states-error-empty.md`, `public/products.html`, `public/products.css`, `public/products.js`

---

## 1. Empty States

### Empty Search / Filter State (Products & Customers)
- **Copy:** `"No customers/products found matching '[query]'. Clear search or add a new record."`
- **Behavior:** Shown in the status/empty-state region when `fetch()` returns zero rows for an active search or filter. Includes a quick **Clear search** action when a search term is present.

### Empty Price History State (`#price-history-modal`)
- **Copy:** `"No price records found for this product. Click '+ Add Price' to set an initial price."`
- **Behavior:** Displayed inside `#price-history-modal` when `PRICEHIST` has no matching records for the selected `prodCode` (or for the active admin status tab).

### Missing Active Price (`—`)
- **Behavior:** When a product has no active price effective as of today (such as `P-004`), render `—` in the `CURRENT PRICE` column rather than `$0.00` or blank.

---

## 2. Inline Form Validation Banners & Error States

Style inline alerts using `#FEF2F2` background, `#DC2626` / `#FECACA` border, and `#991B1B` text (`role="alert"`):

1. **Missing Required Fields:** Highlight invalid inputs (`.input-error`) and display `"Please complete all required product fields."`
2. **Non-Positive Unit Prices (`unitPrice <= 0`):** Reject zero or negative values and display `"Unit price must be greater than 0."`
3. **Duplicate Effective Dates:** On `PRICEHIST` insert/update conflict (`409` or duplicate date check), display `"A price record already exists for this effective date."`
4. **API / Network Failures:** Display a clear error message with a **Retry** button (`#productRetry`) when `GET` fails, and handle `401` session termination (`/login?terminated=1`) and `403` access restrictions cleanly.

---

## 3. Confirmation Dialog Copy (`Confirm Delete` & `Confirm Restore`)

Before executing a soft delete or restore action, open a `<dialog>` confirmation modal over a dimmed backdrop:

- **Confirm Delete (Soft Delete -> Inactive / `DELETED`):**
- **Title:** `"Confirm Delete"`
- **Body:** `"Mark [prodCode] — [description] as Inactive? This record will be shaded for administrators and hidden from standard user views."`
- **Primary Action:** `"Confirm Delete"` (`.btn-delete`) -> `DELETE /api/products/:prodCode`
- **Confirm Restore (Admin Only -> Active / `RESTORED`):**
- **Title:** `"Confirm Restore"`
- **Body:** `"Restore [prodCode] — [description] back to Active status?"`
- **Primary Action:** `"Confirm Restore"` (`.btn-restore`) -> `PUT /api/products/:prodCode/restore`

---

## 4. Role-Based & Modal Contract (`products.html` / `products.js`)

- **Admin View:** Shows `Active`, `Inactive`, and `All` tabs with live count badges, `+ Add Product`, `STATUS` badge column, `STAMP` audit column (`EDITED`, `DELETED`, `RESTORED`), shaded `.row-inactive` (`#FFF5F5` / `#F8FAFC`) rows, and `Prices`, `Edit`, and `Delete` / `Restore` actions.
- **Standard User View:** Shows active-only products; hides status tabs, `STATUS`, `STAMP`, and soft-deleted rows (removes deleted rows from DOM).
- **Price History Modal (`<dialog id="price-history-modal">`):**
- Header format: `Price History — [prodCode] ([description] · Unit: [unit])` with `[X]` close button.
- Dismissible via `[X]`, `Escape`, or backdrop click; sorts `effDate DESC`.
- Admin sees `Active` / `Inactive` / `All` tabs, `+ Add Price` (`effDate`, `unitPrice > 0`), `EFFECTIVE DATE`, `UNIT PRICE`, `STATUS`, `STAMP`, and `ACTIONS` (`Edit`, `Delete`).
- Standard User sees only `EFFECTIVE DATE` and `UNIT PRICE` (plus `ACTIONS` only if `price.edit` or `price.delete` is granted).
