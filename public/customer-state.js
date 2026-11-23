(() => {
  const message = document.getElementById('customerActionMessage');
  if (!message) return;
  const pending = new Set();
  const refresh = () => document.dispatchEvent(new Event('customers:changed'));
  window.customerState = {
    async change(customer, restore, button) {
      const id = customer.custno;
      if (pending.has(id)) return;
      if (!window.confirm(restore ? `Restore customer ${id} to Active?` : `Make customer ${id} inactive? Its history will be preserved.`)) return;
      pending.add(id); button.disabled = true;
      message.textContent = restore ? 'Restoring customer…' : 'Deleting customer…';
      try {
        const response = await fetch('/api/customers/' + encodeURIComponent(id) + (restore ? '/restore' : ''), {
          method: restore ? 'PUT' : 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
        });
        const data = await response.json();
        if (response.status === 401) { window.location.assign('/login?terminated=1'); return; }
        if (!response.ok) {
          message.textContent = response.status === 403 ? 'Customer action is no longer permitted.'
            : [400, 404, 409].includes(response.status) ? data.message : 'Customer state could not be changed. Try again later.';
          if ([400, 403, 404].includes(response.status)) refresh();
        } else { message.textContent = `Customer ${id} was ${restore ? 'restored' : 'made inactive'}.`; refresh(); }
      } catch { message.textContent = 'The change could not be confirmed. Refresh the list before retrying.'; }
      finally { pending.delete(id); button.disabled = false; message.focus(); }
    },
  };
})();
