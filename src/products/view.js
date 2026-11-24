const { PRODUCT_UNITS } = require('./validation');
const { decorate } = require('../workspace/view');
function productPage() {
  return decorate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Products — HOPE ERP</title><link rel="stylesheet" href="/products.css"><script src="/product-editor.js" defer></script><script src="/product-state.js" defer></script><script src="/price-history.js" defer></script><script src="/products.js" defer></script></head><body><main id="productList">
    <header class="product-heading"><div><h1>Products</h1><p>Browse the product catalog and current effective prices.</p></div><button id="productAdd" type="button" hidden disabled>Add Product</button></header>
    <div class="product-filters"><div id="productTabs" role="group" aria-label="Product status" hidden></div><label for="productSearch">Search products<input id="productSearch" type="search" maxlength="100" placeholder="Product code or description" autocomplete="off"></label></div>
    <p id="productNotice" role="status" aria-live="polite"></p><p id="productStatus" role="status" aria-live="polite">Loading products…</p><button id="productRetry" type="button" hidden>Try again</button>
    <div class="product-scroll" tabindex="0" role="region" aria-label="Scrollable product catalog"><table id="productTable" aria-busy="true" hidden><caption>Product catalog</caption><thead id="productHead"></thead><tbody id="productRows"></tbody></table></div>
    <p class="product-note">Prices use the latest active effective date through today. Unavailable prices appear as —. Manage effective-date prices using the Prices action.</p>
    <dialog id="productEditor" aria-labelledby="productEditorTitle"><form id="productForm">
      <h2 id="productEditorTitle">Add product</h2>
      <label>Product code (required)<input id="productCode" name="prodCode" required maxlength="6" pattern="[A-Za-z0-9][A-Za-z0-9\\-]{0,5}" autocomplete="off"></label>
      <label>Description (required)<input id="productDescription" name="description" required maxlength="100"></label>
      <label>Packaging unit (required)<select id="productUnit" name="unit" required><option value="">Select unit</option>${PRODUCT_UNITS.map(unit => `<option value="${unit}">${unit}</option>`).join('')}</select></label>
      <p id="productFormError" role="alert" tabindex="-1"></p><button id="productSave" type="submit">Save product</button><button id="productCancel" type="button">Cancel</button>
    </form></dialog>
    <dialog id="priceHistory" aria-labelledby="priceTitle"><h2 id="priceTitle">Price history</h2>
      <button id="priceClose" type="button">Close price history</button>
      <label id="priceFilterLabel" hidden>Price status<select id="priceFilter" aria-label="Price status" hidden><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></label>
      <p id="priceStatus" role="status" aria-live="polite"></p><button id="priceRetry" type="button">Refresh prices</button>
      <div class="product-scroll"><table><caption>Effective-date price history</caption><thead id="priceHead"></thead><tbody id="priceRows"></tbody></table></div>
      <p id="priceNotice" role="status" aria-live="polite"></p>
      <form id="priceForm" hidden><label>Effective date (required)<input id="priceDate" type="date" required min="0001-01-01" max="9999-12-31"></label>
        <label>Unit price (required)<input id="priceAmount" type="text" inputmode="decimal" required maxlength="11" pattern="(?=.*[1-9])(0|[1-9][0-9]{0,7})(\\.[0-9]{1,2})?" aria-describedby="priceAmountHelp"></label>
        <p id="priceAmountHelp">Positive amount, up to 99999999.99, with at most two decimals.</p>
        <button id="priceSave" type="submit">Add price</button><button id="priceReset" type="button">New price / cancel edit</button>
      </form>
    </dialog>
  </main></body></html>`);
}
module.exports = { productPage };
