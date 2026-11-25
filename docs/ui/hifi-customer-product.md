# High-Fidelity UI Specifications & Developer Handoff (`S2-UIX-03`)

- **Task ID:** S2-UIX-03
- **Assigned To:** @AshleyNicoleMarticio30 (UI/UX Designer)
- **References:** Hope, Inc. ERP Student Guide §3.3 (Figures 9–10), §3.4 (Figures 11–14) & Design System
- **Implemented Files:** `docs/ui/hifi-customer-product.md`, `public/customers.html`, `public/customers.css`, `public/customers.js`, `public/customer-editor.js`

---

## 1. CSS Design Tokens (`:root`)

```css
:root {
  /* Core Surfaces & Typography (Warm Sand & Espresso) */
  --bg-canvas: #FAF7F2;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F3EEE5;
  --text-primary: #2C1E19;
  --text-secondary: #5C4941;
  --border-default: #DDD5CE;
  --border-input: #7C7168;

  /* Brand & Interactive Accents */
  --accent-primary: #0F766E;
  --accent-primary-hover: #115E59;
  --focus-ring: rgba(15, 118, 110, 0.25);

  /* Status & Audit Badges */
  --badge-active-bg: #DCFCE7;
  --badge-active-text: #166534;
  --badge-inactive-bg: #FEE2E2;
  --badge-inactive-text: #991B1B;
  --badge-stamp-bg: #F3EEE5;
  --badge-stamp-text: #2C1E19;

  /* Shaded Soft-Deleted Row Styling */
  --row-inactive-bg: #F8FAFC;
  --row-inactive-tint: #FFF5F5;
  --row-inactive-border: #FECACA;

  /* Action Button & Validation Tokens */
  --btn-danger: #DC2626;
  --error-text: #991B1B;
  --error-bg: #FEF2F2;
}