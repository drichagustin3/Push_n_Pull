const { decorate } = require('../workspace/view');
function customerPage() {
  return decorate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Customers — HOPE ERP</title><link rel="stylesheet" href="/customers.css"><script src="/customers.js" defer></script></head><body><main id="customerList">
  <header class="customer-heading"><div><h1>Customers</h1><p>Find customer records and payment terms.</p></div><button id="customerAdd" type="button" hidden disabled title="Customer creation is scheduled for S2-DEV-02">Add Customer (coming soon)</button></header>
  <div class="customer-filters"><div id="customerTabs" role="group" aria-label="Customer status" hidden></div><label for="customerSearch">Search customers<input id="customerSearch" type="search" maxlength="100" placeholder="Customer number, name, or address" autocomplete="off"></label></div>
  <p id="customerStatus" role="status" aria-live="polite">Loading customers…</p><button id="customerRetry" type="button" hidden>Try again</button>
  <div class="customer-scroll"><table id="customerTable" aria-busy="true" hidden><caption>Customer directory</caption><thead id="customerHead"></thead><tbody id="customerRows"></tbody></table></div>
  <p class="customer-note">Customer changes will be available in later tasks. Displayed action controls are disabled.</p>
  </main></body></html>`);
}
module.exports = { customerPage };
