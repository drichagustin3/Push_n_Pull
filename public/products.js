(() => {
  const search = document.getElementById('productSearch'), tabs = document.getElementById('productTabs');
  const table = document.getElementById('productTable'), head = document.getElementById('productHead'), rows = document.getElementById('productRows');
  const status = document.getElementById('productStatus'), retry = document.getElementById('productRetry'), add = document.getElementById('productAdd');
  let selected = 'active', generation = 0, timer;
  function text(tag, value) { const node = document.createElement(tag); node.textContent = value ?? '—'; return node; }
  function price(value) {
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return '—';
    const [whole, fraction = ''] = value.split('.');
    return '₱' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
  }
  function clear() { rows.replaceChildren(); head.replaceChildren(); tabs.replaceChildren(); tabs.hidden = true; add.hidden = true; table.hidden = true; retry.hidden = true; }
  function action(label) { const button = text('button', label + ' (coming soon)'); button.type = 'button'; button.disabled = true; button.title = 'This operation is assigned to a later task.'; return button; }
  function render(data) {
    selected = data.filter.status; const metadata = data.capabilities.metadata;
    add.hidden = !data.capabilities.add;
    if (metadata) {
      tabs.hidden = false;
      for (const key of ['active', 'inactive', 'all']) {
        const button = text('button', `${key[0].toUpperCase() + key.slice(1)} (${data.counts[key]})`); button.type = 'button'; button.setAttribute('aria-pressed', String(selected === key));
        button.addEventListener('click', () => { clearTimeout(timer); selected = key; void load(); }); tabs.append(button);
      }
    }
    const actions = data.capabilities.edit || data.capabilities.delete || data.capabilities.prices;
    const header = document.createElement('tr');
    for (const label of ['Prod Code', 'Description', 'Unit', 'Current Price', ...(metadata ? ['Status', 'Stamp'] : []), ...(actions ? ['Actions'] : [])]) { const cell = text('th', label); cell.setAttribute('scope', 'col'); header.append(cell); }
    head.append(header);
    for (const product of data.products) {
      const row = document.createElement('tr'); if (product.status === 'inactive') row.className = 'product-inactive';
      for (const field of ['prodcode', 'description', 'unit']) row.append(text('td', product[field]));
      const money = text('td', price(product.currentPrice)); money.className = 'product-price'; row.append(money);
      if (metadata) { const state = text('td', product.status === 'inactive' ? 'Inactive' : 'Active'); state.className = 'product-state'; row.append(state, text('td', product.stamp)); }
      if (actions) {
        const cell = document.createElement('td');
        if (data.capabilities.prices) cell.append(action('Prices'));
        if (product.status !== 'inactive' && data.capabilities.edit) {
          const edit = window.productEditor ? text('button', 'Edit') : action('Edit'); edit.type = 'button';
          if (window.productEditor) edit.addEventListener('click', () => window.productEditor.open(product));
          cell.append(edit);
        }
        if (data.capabilities.delete && (product.status !== 'inactive' || metadata)) cell.append(action(product.status === 'inactive' ? 'Restore' : 'Delete'));
        row.append(cell);
      }
      rows.append(row);
    }
    table.hidden = data.products.length === 0;
    status.textContent = data.products.length ? `${data.products.length} product${data.products.length === 1 ? '' : 's'} found.` : 'No products match your search and filter.';
  }
  async function load() {
    const version = ++generation; clear(); table.setAttribute('aria-busy', 'true'); status.textContent = 'Loading products…';
    try {
      const response = await fetch('/api/products?' + new URLSearchParams({ search: search.value.trim(), status: selected }), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json(); if (version !== generation) return;
      if (response.status === 401) { window.location.assign('/login?terminated=1'); return; }
      if (!response.ok) { status.textContent = response.status === 403 ? 'Product access is unavailable. Contact an administrator.' : response.status === 400 ? data.message : 'Products could not be loaded. Try again.'; retry.hidden = false; return; }
      render(data);
    } catch { if (version === generation) { clear(); status.textContent = 'Check your connection and try again.'; retry.hidden = false; } }
    finally { if (version === generation) table.setAttribute('aria-busy', 'false'); }
  }
  search.addEventListener('input', () => { clearTimeout(timer); ++generation; clear(); table.setAttribute('aria-busy', 'true'); status.textContent = 'Loading products…'; timer = setTimeout(() => { void load(); }, 250); });
  retry.addEventListener('click', () => { void load(); });
  window.addEventListener('focus', () => { clearTimeout(timer); void load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearTimeout(timer); void load(); } });
  document.addEventListener('products:changed', () => { clearTimeout(timer); void load(); });
  void load();
})();
