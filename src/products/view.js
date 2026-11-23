const { decorate } = require('../workspace/view');
function productPage() {
  return decorate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Products — HOPE ERP</title><link rel="stylesheet" href="/products.css"><script src="/products.js" defer></script></head><body><main id="productList">
    <header class="product-heading"><div><h1>Products</h1><p>Browse the product catalog and current effective prices.</p></div><button id="productAdd" type="button" hidden disabled title="Product creation is scheduled for a later task">Add Product (coming soon)</button></header>
    <div class="product-filters"><div id="productTabs" role="group" aria-label="Product status" hidden></div><label for="productSearch">Search products<input id="productSearch" type="search" maxlength="100" placeholder="Product code or description" autocomplete="off"></label></div>
    <p id="productStatus" role="status" aria-live="polite">Loading products…</p><button id="productRetry" type="button" hidden>Try again</button>
    <div class="product-scroll" tabindex="0" role="region" aria-label="Scrollable product catalog"><table id="productTable" aria-busy="true" hidden><caption>Product catalog</caption><thead id="productHead"></thead><tbody id="productRows"></tbody></table></div>
    <p class="product-note">Prices use the latest active effective date through today. Unavailable prices appear as —. Product changes and price-history management are scheduled for later tasks.</p>
  </main></body></html>`);
}
module.exports = { productPage };
