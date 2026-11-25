(() => {
  const dialog = document.getElementById('productEditor');
  if (!dialog) return;
  const form = document.getElementById('productForm');
  const code = document.getElementById('productCode');
  const description = document.getElementById('productDescription');
  const unit = document.getElementById('productUnit');
  const error = document.getElementById('productFormError');
  const save = document.getElementById('productSave');
  const cancel = document.getElementById('productCancel');
  let current = null, busy = false, trigger;
  function close() { dialog.close(); form.reset(); current = null; error.textContent = ''; trigger?.focus(); }
  window.productEditor = {
    open(product = null) {
      if (busy || dialog.open) return;
      trigger = document.activeElement; current = product?.prodcode ?? null; form.reset(); error.textContent = '';
      document.getElementById('productEditorTitle').textContent = current ? 'Edit product' : 'Add product';
      code.value = current ?? ''; code.disabled = current !== null;
      description.value = product?.description ?? '';
      unit.value = product?.unit ?? '';
      dialog.showModal(); (current ? description : code).focus();
    },
  };
  const add = document.getElementById('productAdd');
  add.disabled = false; add.addEventListener('click', () => window.productEditor.open());
  cancel.addEventListener('click', () => { if (!busy) close(); });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); if (!busy) close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (busy || !form.reportValidity()) return;
    busy = true; save.disabled = true; cancel.disabled = true; form.setAttribute('aria-busy', 'true'); error.textContent = '';
    const editing = current !== null;
    const body = { description: description.value, unit: unit.value, ...(!editing ? { prodCode: code.value } : {}) };
    try {
      const response = await fetch('/api/products' + (editing ? '/' + encodeURIComponent(current) : ''), {
        method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) { close(); window.location.assign('/login?terminated=1'); return; }
        if (response.status === 403) { close(); document.getElementById('productNotice').textContent = 'Product access has changed. Check your available actions or contact an administrator.'; document.dispatchEvent(new Event('products:changed')); return; }
        error.textContent = [400, 404, 409].includes(response.status) ? data.message : 'Product changes could not be saved. Try again later.';
        error.focus(); return;
      }
      close(); document.getElementById('productNotice').textContent = editing ? 'Product updated.' : 'Product created.'; document.dispatchEvent(new Event('products:changed'));
    } catch { error.textContent = 'The save could not be confirmed. Check your connection; a retry may report a duplicate if creation succeeded.'; error.focus(); }
    finally { busy = false; save.disabled = false; cancel.disabled = false; form.removeAttribute('aria-busy'); }
  });
})();
