(() => {
  let busy = false;
  window.productState = async (product, restore) => {
    if (busy) return;
    if (!window.confirm(`${restore ? 'Restore' : 'Deactivate'} product ${product.prodcode}?`)) return;
    busy = true;
    const notice = document.getElementById('productNotice');
    notice.textContent = restore ? 'Restoring product…' : 'Deactivating product…';
    const buttons = [...document.querySelectorAll('#productRows button')];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch('/api/products/' + encodeURIComponent(product.prodcode) + (restore ? '/restore' : ''), {
        method: restore ? 'PUT' : 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
      });
      const data = await response.json();
      if (response.status === 401) { window.location.assign('/login?terminated=1'); return; }
      notice.textContent = response.ok ? (restore ? 'Product restored.' : 'Product deactivated.')
        : response.status === 403 ? 'Product access has changed. Contact an administrator.'
          : [400, 404, 409].includes(response.status) ? data.message : 'Product status could not be saved. Try again later.';
    } catch { notice.textContent = 'The status change could not be confirmed. Refresh before retrying.'; }
    finally { busy = false; document.dispatchEvent(new Event('products:changed')); }
  };
})();
