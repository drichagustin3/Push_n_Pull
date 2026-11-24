const { PRODUCT_UNITS } = require('./validation');
const { decorate } = require('../workspace/view');
function productPage() {
  return decorate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Products — HOPE ERP</title><link rel="stylesheet" href="/products.css"><script src="/product-editor.js" defer></script><script src="/products.js" defer></script></head><body><main id="productList">
    <header class="product-heading"><div><h1>Products</h1><p>Browse the product catalog and current effective prices.</p></div><button id="productAdd" type="button" hidden disabled>Add Product</button></header>
    <div class="product-filters"><div id="productTabs" role="group" aria-label="Product status" hidden></div><label for="productSearch">Search products<input id="productSearch" type="search" maxlength="100" placeholder="Product code or description" autocomplete="off"></label></div>
    <p id="productNotice" role="status" aria-live="polite"></p><p id="productStatus" role="status" aria-live="polite">Loading products…</p><button id="productRetry" type="button" hidden>Try again</button>
    <div class="product-scroll" tabindex="0" role="region" aria-label="Scrollable product catalog"><table id="productTable" aria-busy="true" hidden><caption>Product catalog</caption><thead id="productHead"></thead><tbody id="productRows"></tbody></table></div>
    <p class="product-note">Prices use the latest active effective date through today. Unavailable prices appear as —. Price-history management, deletion and restoration are scheduled for later tasks.</p>
    <dialog id="productEditor" aria-labelledby="productEditorTitle"><form id="productForm">
      <h2 id="productEditorTitle">Add product</h2>
      <label>Product code (required)<input id="productCode" name="prodCode" required maxlength="6" pattern="[A-Za-z0-9][A-Za-z0-9\\-]{0,5}" autocomplete="off"></label>
      <label>Description (required)<input id="productDescription" name="description" required maxlength="100"></label>
      <label>Packaging unit (required)<select id="productUnit" name="unit" required><option value="">Select unit</option>${PRODUCT_UNITS.map(unit => `<option value="${unit}">${unit}</option>`).join('')}</select></label>
      <p id="productFormError" role="alert" tabindex="-1"></p><button id="productSave" type="submit">Save product</button><button id="productCancel" type="button">Cancel</button>
    </form></dialog>
  </main></body></html>`);
}
module.exports = { productPage };
