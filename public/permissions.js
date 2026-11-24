(() => {
  let rights = null, role = 'user';
  const privileged = () => ['admin','superadmin'].includes(role);
  function needed(target) {
    if (target.closest('#customerForm')) return 'customer.' + (document.getElementById('customerNumber')?.disabled ? 'edit' : 'add');
    if (target.closest('#productForm')) return 'product.' + (document.getElementById('productCode')?.disabled ? 'edit' : 'add');
    if (target.closest('#priceForm')) return document.getElementById('priceForm')?.dataset?.requiredRight ?? 'price.' + (document.getElementById('priceDate')?.disabled ? 'edit' : 'add');
    if (target.id === 'customerAdd') return 'customer.add';
    if (target.id === 'productAdd') return 'product.add';
    const area = target.closest('#customerRows,#productRows,#priceRows');
    if (!area) return null;
    const module = {customerRows:'customer',productRows:'product',priceRows:'price'}[area.id];
    const label = target.textContent.trim();
    if (label.startsWith('Restore')) return privileged() ? null : false;
    if (label.startsWith('Edit')) return module+'.edit';
    if (label.startsWith('Delete')) return module+'.delete';
    if (label.startsWith('Prices')) return ['price.add','price.edit','price.delete'].some(code => rights?.has(code)) ? null : false;
    return null;
  }
  function allowed(node) { const right = needed(node); return right === false ? false : !right || (rights && rights.has(right)); }
  function clearEditor(id) {
    const dialog = document.getElementById(id);
    if (!dialog?.open) return;
    dialog.close();dialog.querySelector('form')?.reset();dialog.querySelector('tbody')?.replaceChildren();
  }
  function prune() {
    if (!rights) return;
    for (const node of document.querySelectorAll('#customerAdd,#productAdd,#customerRows button,#productRows button,#priceRows button')) {
      if (!allowed(node)) { if(!node.hidden)node.hidden=true;if(!node.disabled)node.disabled=true; }
    }
    for (const [formId,dialogId] of [['customerForm','customerEditor'],['productForm','productEditor'],['priceForm','priceHistory']]) {
      const form=document.getElementById(formId);
      if (form && !form.hidden && !allowed(form)) clearEditor(dialogId);
    }
  }
  window.hopePermissions = { sync(data) {
    const previous = role; role = data.user?.role ?? 'user';rights = new Set(Array.isArray(data.rightCodes) ? data.rightCodes : []);
    if ((['admin','superadmin'].includes(previous) && !privileged()) || !['price.add','price.edit','price.delete'].some(code=>rights.has(code))) clearEditor('priceHistory');
    prune();
  } };
  // Capture phase rejects stale controls before inherited form/action handlers run.
  function guard(event) {
    const target = event.type === 'submit' ? event.target : event.target.closest('button');
    if (!target || rights === null || allowed(target)) return;
    event.preventDefault();event.stopImmediatePropagation();prune();
    const status=document.getElementById('workspaceStatus');if(status)status.textContent='Action access has changed. Refresh your permissions or contact an administrator.';
    document.dispatchEvent(new Event('permissions:refresh'));
  }
  document.addEventListener('click',guard,true);document.addEventListener('submit',guard,true);
  new MutationObserver(prune).observe(document.body,{childList:true,subtree:true});
})();
