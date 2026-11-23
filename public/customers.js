(() => {
  const search = document.getElementById('customerSearch');
  const tabs = document.getElementById('customerTabs');
  const table = document.getElementById('customerTable');
  const head = document.getElementById('customerHead');
  const rows = document.getElementById('customerRows');
  const status = document.getElementById('customerStatus');
  const retry = document.getElementById('customerRetry');
  const add = document.getElementById('customerAdd');
  let selected = 'active', generation = 0, timer;
  function text(tag, value) {
    const node = document.createElement(tag); node.textContent = value ?? '—'; return node;
  }
  function clear() {
    rows.replaceChildren(); head.replaceChildren(); tabs.replaceChildren(); tabs.hidden = true;
    add.hidden = true; table.hidden = true; retry.hidden = true;
  }
  function action(label) {
    const button = text('button', label + ' (coming soon)'); button.type = 'button'; button.disabled = true;
    button.title = 'Customer changes are outside this list task.'; return button;
  }
  function render(data) {
    const metadata = data.capabilities.metadata;
    selected = data.filter.status;
    add.hidden = !data.capabilities.add;
    if (metadata) {
      tabs.hidden = false;
      for (const key of ['active', 'inactive', 'all']) {
        const button = text('button', `${key[0].toUpperCase() + key.slice(1)} (${data.counts[key]})`);
        button.type = 'button'; button.setAttribute('aria-pressed', String(selected === key));
        button.addEventListener('click', () => { clearTimeout(timer); selected = key; void load(); }); tabs.append(button);
      }
    }
    const actions = data.capabilities.edit || data.capabilities.delete;
    const header = document.createElement('tr');
    for (const label of ['Cust No', 'Customer Name', 'Address', 'Pay Terms', ...(metadata ? ['Status', 'Stamp'] : []), ...(actions ? ['Actions'] : [])]) {
      const cell = text('th', label); cell.setAttribute('scope', 'col'); header.append(cell);
    }
    head.append(header);
    for (const customer of data.customers) {
      const row = document.createElement('tr');
      if (customer.status === 'inactive') row.className = 'customer-inactive';
      for (const field of ['custno', 'custname', 'address', 'payterm']) row.append(text('td', customer[field]));
      if (metadata) row.append(text('td', customer.status === 'inactive' ? 'Inactive' : 'Active'), text('td', customer.stamp));
      if (actions) {
        const cell = document.createElement('td');
        if (customer.status !== 'inactive' && data.capabilities.edit) cell.append(action('Edit'));
        if (data.capabilities.delete) cell.append(action(customer.status === 'inactive' ? 'Restore' : 'Delete'));
        row.append(cell);
      }
      rows.append(row);
    }
    table.hidden = data.customers.length === 0;
    status.textContent = data.customers.length ? `${data.customers.length} customer${data.customers.length === 1 ? '' : 's'} found.` : 'No customers match your search and filter.';
  }
  async function load() {
    const version = ++generation;
    clear(); table.setAttribute('aria-busy', 'true'); status.textContent = 'Loading customers…';
    try {
      const query = new URLSearchParams({ search: search.value.trim(), status: selected });
      const response = await fetch('/api/customers?' + query, { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const data = await response.json();
      if (version !== generation) return;
      if (response.status === 401) { window.location.assign('/login?terminated=1'); return; }
      if (!response.ok) {
        status.textContent = response.status === 403 ? 'Customer access is unavailable. Contact an administrator.' : (response.status === 400 ? data.message : 'Customers could not be loaded. Try again.');
        retry.hidden = false; return;
      }
      render(data);
    } catch { if (version === generation) { clear(); status.textContent = 'Check your connection and try again.'; retry.hidden = false; } }
    finally { if (version === generation) table.setAttribute('aria-busy', 'false'); }
  }
  search.addEventListener('input', () => {
    clearTimeout(timer); ++generation; clear(); status.textContent = 'Loading customers…';
    timer = setTimeout(() => { void load(); }, 250);
  });
  retry.addEventListener('click', () => { void load(); });
  window.addEventListener('focus', () => { clearTimeout(timer); void load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { clearTimeout(timer); void load(); } });
  void load();
})();
