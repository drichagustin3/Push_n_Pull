(() => {
  const dialog = document.getElementById('customerEditor');
  if (!dialog) return;
  const form = document.getElementById('customerForm');
  const number = document.getElementById('customerNumber');
  const name = document.getElementById('customerName');
  const address = document.getElementById('customerAddress');
  const terms = document.getElementById('customerTerms');
  const error = document.getElementById('customerFormError');
  const save = document.getElementById('customerSave');
  const cancel = document.getElementById('customerCancel');
  let current = null, busy = false, trigger;
  function close() { dialog.close(); form.reset(); current = null; error.textContent = ''; trigger?.focus(); }
  window.customerEditor = {
    open(customer = null) {
      if (busy || dialog.open) return;
      trigger = document.activeElement; current = customer?.custno ?? null; form.reset(); error.textContent = '';
      document.getElementById('customerEditorTitle').textContent = current ? 'Edit customer' : 'Add customer';
      number.value = current ?? ''; number.disabled = current !== null;
      name.value = customer?.custname ?? ''; address.value = customer?.address ?? '';
      terms.value = { COD: 'COD', '15D': 'Net 15', '30D': 'Net 30', '45D': 'Net 45', PRE: 'Prepaid' }[customer?.payterm] ?? '';
      dialog.showModal(); (current ? name : number).focus();
    },
  };
  const add = document.getElementById('customerAdd');
  add.disabled = false; add.addEventListener('click', () => window.customerEditor.open());
  cancel.addEventListener('click', () => { if (!busy) close(); });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); if (!busy) close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    busy = true; save.disabled = true; cancel.disabled = true; form.setAttribute('aria-busy', 'true'); error.textContent = '';
    const editing = current !== null;
    const body = { custName: name.value, address: address.value, payTerms: terms.value, ...(!editing ? { custNo: number.value } : {}) };
    try {
      const response = await fetch('/api/customers' + (editing ? '/' + encodeURIComponent(current) : ''), {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) { close(); window.location.assign('/login?terminated=1'); return; }
        if (response.status === 403) { close(); document.dispatchEvent(new Event('customers:changed')); return; }
        error.textContent = [400, 404, 409].includes(response.status) ? data.message : 'Customer changes could not be saved. Try again later.';
        error.focus(); return;
      }
      close(); document.dispatchEvent(new Event('customers:changed'));
    } catch { error.textContent = 'The save could not be confirmed. Check your connection; a retry may report a duplicate if creation succeeded.'; error.focus(); }
    finally { busy = false; save.disabled = false; cancel.disabled = false; form.removeAttribute('aria-busy'); }
  });
})();
