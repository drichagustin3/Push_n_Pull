(() => {
  const search = document.getElementById('productSearch');
  const clearSearchBtn = document.getElementById('clearProductSearch');
  const tabs = document.getElementById('productTabs');
  const table = document.getElementById('productTable');
  const head = document.getElementById('productHead');
  const rows = document.getElementById('productRows');
  const status = document.getElementById('productStatus');
  const retry = document.getElementById('productRetry');
  const addBtn = document.getElementById('productAdd');

  // Add / Edit Product modal
  const editorDialog = document.getElementById('productEditor');
  const editorTitle = document.getElementById('productEditorTitle');
  const editorClose = document.getElementById('productEditorClose');
  const productForm = document.getElementById('productForm');
  const codeInput = document.getElementById('productCode');
  const descInput = document.getElementById('productDescription');
  const unitInput = document.getElementById('productUnit');
  const formError = document.getElementById('productFormError');
  const cancelEditBtn = document.getElementById('productCancel');

  // Confirm Delete / Restore modal
  const confirmDialog = document.getElementById('confirmActionDialog');
  const confirmTitle = document.getElementById('confirmDialogTitle');
  const confirmClose = document.getElementById('confirmDialogClose');
  const confirmMessage = document.getElementById('confirmDialogMessage');
  const confirmError = document.getElementById('confirmDialogError');
  const confirmProceedBtn = document.getElementById('confirmProceedBtn');
  const confirmCancelBtn = document.getElementById('confirmCancelBtn');

  // Price History modal
  const priceDialog = document.getElementById('price-history-modal');
  const priceTitle = document.getElementById('priceHistoryTitle');
  const priceClose = document.getElementById('priceHistoryClose');
  const priceTabs = document.getElementById('priceHistoryTabs');
  const addPriceBtn = document.getElementById('addPriceBtn');
  const priceForm = document.getElementById('priceEntryForm');
  const priceHeading = document.getElementById('priceEntryHeading');
  const effDateInput = document.getElementById('priceEffDate');
  const unitPriceInput = document.getElementById('priceUnitValue');
  const priceFormError = document.getElementById('priceFormError');
  const priceCancelBtn = document.getElementById('priceCancelBtn');
  const priceStatus = document.getElementById('priceHistoryStatus');
  const priceTable = document.getElementById('priceHistoryTable');
  const priceHead = document.getElementById('priceHistoryHead');
  const priceRows = document.getElementById('priceHistoryRows');

  let selected = 'active';
  let generation = 0;
  let timer;
  let currentCapabilities = { add: false, edit: false, delete: false, prices: false, metadata: false };
  let editingProdCode = null;
  let pendingConfirmAction = null;
  let activePriceProduct = null;
  let activePriceTab = 'active';
  let editingPriceId = null;

  function text(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value ?? '—';
    return node;
  }

  function price(value) {
    if (value === null || value === undefined || value === '') return '—';
    const normalized =
      typeof value === 'number'
        ? (Number.isFinite(value) && value >= 0 ? String(value) : null)
        : (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim()) ? value.trim() : null);
    if (!normalized) return '—';
    const [whole, fraction = ''] = normalized.split('.');
    return '₱' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
  }

  function setInlineError(el, message) {
    if (!el) return;
    if (!message) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    el.textContent = message;
    el.hidden = false;
    el.focus?.();
  }

  function clearFieldErrors(fields) {
    for (const field of fields) field?.classList.remove('input-error');
  }

  function updateClearSearchButton() {
    if (!clearSearchBtn || !search) return;
    clearSearchBtn.hidden = search.value.trim().length === 0;
  }

  function clear() {
    rows?.replaceChildren();
    head?.replaceChildren();
    tabs?.replaceChildren();
    if (tabs) tabs.hidden = true;
    if (addBtn) addBtn.hidden = true;
    if (table) table.hidden = true;
    if (retry) retry.hidden = true;
  }

  async function parseJsonSafe(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  function handleAuthError(response) {
    if (response.status === 401) {
      window.location.assign('/login?terminated=1');
      return true;
    }
    return false;
  }

  function openProductEditor(product = null) {
    editingProdCode = product ? (product.prodcode ?? product.prodCode) : null;
    clearFieldErrors([codeInput, descInput, unitInput]);
    setInlineError(formError, '');

    if (product) {
      if (editorTitle) editorTitle.textContent = `Edit product — ${editingProdCode}`;
      if (codeInput) {
        codeInput.value = editingProdCode ?? '';
        codeInput.disabled = true;
      }
      if (descInput) descInput.value = product.description ?? '';
      if (unitInput) unitInput.value = product.unit ?? '';
    } else {
      if (editorTitle) editorTitle.textContent = 'Add product';
      productForm?.reset();
      if (codeInput) codeInput.disabled = false;
    }

    if (editorDialog) {
      if (typeof editorDialog.showModal === 'function') editorDialog.showModal();
      else editorDialog.setAttribute('open', '');
    }
    (product ? descInput : codeInput)?.focus();
  }

  function closeProductEditor() {
    if (!editorDialog) return;
    if (typeof editorDialog.close === 'function' && editorDialog.open) editorDialog.close();
    else editorDialog.removeAttribute('open');
  }

  productForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors([codeInput, descInput, unitInput]);
    setInlineError(formError, '');

    const prodCode = codeInput?.value.trim() ?? '';
    const description = descInput?.value.trim() ?? '';
    const unit = unitInput?.value.trim() ?? '';

    const invalid = [];
    if (!editingProdCode && !prodCode && codeInput) invalid.push(codeInput);
    if (!description && descInput) invalid.push(descInput);
    if (!unit && unitInput) invalid.push(unitInput);

    if (invalid.length > 0) {
      for (const el of invalid) el.classList.add('input-error');
      setInlineError(formError, 'Please complete all required product fields.');
      invalid[0].focus();
      return;
    }

    const isEdit = Boolean(editingProdCode);
    const url = isEdit
      ? `/api/products/${encodeURIComponent(editingProdCode)}`
      : '/api/products';
    const method = isEdit ? 'PUT' : 'POST';
    const payload = isEdit ? { description, unit } : { prodCode, description, unit };

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonSafe(response);
      if (handleAuthError(response)) return;
      if (!response.ok) {
        setInlineError(formError, data.message || 'Could not save product. Please check your input.');
        return;
      }
      closeProductEditor();
      void load();
    } catch {
      setInlineError(formError, 'Network error while saving product. Please try again.');
    }
  });

  function openConfirmModal({ title, message, proceedLabel, proceedClass, onConfirm }) {
    pendingConfirmAction = onConfirm;
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmMessage) confirmMessage.textContent = message;
    if (confirmProceedBtn) {
      confirmProceedBtn.textContent = proceedLabel;
      confirmProceedBtn.className = proceedClass;
    }
    setInlineError(confirmError, '');

    if (confirmDialog) {
      if (typeof confirmDialog.showModal === 'function') confirmDialog.showModal();
      else confirmDialog.setAttribute('open', '');
    }
    confirmProceedBtn?.focus();
  }

  function closeConfirmModal() {
    pendingConfirmAction = null;
    if (!confirmDialog) return;
    if (typeof confirmDialog.close === 'function' && confirmDialog.open) confirmDialog.close();
    else confirmDialog.removeAttribute('open');
  }

  function requestDeleteProduct(product) {
    const code = product.prodcode ?? product.prodCode;
    openConfirmModal({
      title: 'Confirm Delete',
      message: `Mark ${code} — ${product.description} as Inactive? This record will be shaded for administrators and hidden from standard user views.`,
      proceedLabel: 'Confirm Delete',
      proceedClass: 'btn-delete',
      onConfirm: async () => {
        const response = await fetch(`/api/products/${encodeURIComponent(code)}`, {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        });
        const data = await parseJsonSafe(response);
        if (handleAuthError(response)) return;
        if (!response.ok) {
          throw new Error(data.message || 'Failed to mark product as inactive.');
        }
      },
    });
  }

  function requestRestoreProduct(product) {
    const code = product.prodcode ?? product.prodCode;
    openConfirmModal({
      title: 'Confirm Restore',
      message: `Restore ${code} — ${product.description} back to Active status?`,
      proceedLabel: 'Confirm Restore',
      proceedClass: 'btn-restore',
      onConfirm: async () => {
        const response = await fetch(`/api/products/${encodeURIComponent(code)}/restore`, {
          method: 'PUT',
          headers: { Accept: 'application/json' },
        });
        const data = await parseJsonSafe(response);
        if (handleAuthError(response)) return;
        if (!response.ok) {
          throw new Error(data.message || 'Failed to restore product.');
        }
      },
    });
  }

  confirmProceedBtn?.addEventListener('click', async () => {
    if (!pendingConfirmAction) return;
    setInlineError(confirmError, '');
    confirmProceedBtn.disabled = true;
    try {
      await pendingConfirmAction();
      closeConfirmModal();
      void load();
    } catch (err) {
      setInlineError(confirmError, err?.message || 'Action failed. Please try again.');
    } finally {
      confirmProceedBtn.disabled = false;
    }
  });

  function resetPriceForm(entry = null) {
    editingPriceId = entry ? (entry.id ?? entry.priceId ?? entry.effDate) : null;
    clearFieldErrors([effDateInput, unitPriceInput]);
    setInlineError(priceFormError, '');
    if (entry) {
      if (priceHeading) priceHeading.textContent = 'Edit Price Entry';
      if (effDateInput) effDateInput.value = (entry.effDate ?? entry.effdate ?? '').slice(0, 10);
      if (unitPriceInput) unitPriceInput.value = entry.unitPrice ?? entry.unitprice ?? '';
      if (priceForm) priceForm.hidden = false;
      effDateInput?.focus();
    } else {
      if (priceHeading) priceHeading.textContent = 'Add Price Entry';
      priceForm?.reset();
      if (priceForm) priceForm.hidden = true;
    }
  }

  async function loadPriceHistory() {
    if (!activePriceProduct) return;
    const code = activePriceProduct.prodcode ?? activePriceProduct.prodCode;
    if (priceTitle) {
      priceTitle.textContent = `Price History — ${code} (${activePriceProduct.description} · Unit: ${activePriceProduct.unit})`;
    }
    if (priceStatus) priceStatus.textContent = 'Loading price history…';
    if (priceTable) priceTable.hidden = true;
    priceRows?.replaceChildren();
    priceHead?.replaceChildren();

    const isAdmin = Boolean(currentCapabilities.metadata);
    const canManagePrice = isAdmin || Boolean(currentCapabilities.priceEdit || currentCapabilities.priceDelete);

    if (priceTabs) priceTabs.hidden = !isAdmin;
    if (addPriceBtn) addPriceBtn.hidden = !isAdmin;

    if (isAdmin && priceTabs) {
      priceTabs.replaceChildren();
      for (const key of ['active', 'inactive', 'all']) {
        const btn = text('button', key[0].toUpperCase() + key.slice(1));
        btn.type = 'button';
        btn.setAttribute('aria-pressed', String(activePriceTab === key));
        btn.addEventListener('click', () => {
          activePriceTab = key;
          void loadPriceHistory();
        });
        priceTabs.append(btn);
      }
    }

    try {
      const params = new URLSearchParams(isAdmin ? { status: activePriceTab } : { status: 'active' });
      const response = await fetch(`/api/products/${encodeURIComponent(code)}/prices?${params}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await parseJsonSafe(response);
      if (handleAuthError(response)) return;
      if (!response.ok) {
        if (priceStatus) priceStatus.textContent = data.message || 'Unable to load price history.';
        return;
      }

      const rawList = Array.isArray(data) ? data : (data.prices ?? data.history ?? []);
      const list = rawList
        .filter((item) => isAdmin || (item.status ?? 'active') !== 'inactive')
        .sort((a, b) => String(b.effDate ?? b.effdate ?? '').localeCompare(String(a.effDate ?? a.effdate ?? '')));

      if (list.length === 0) {
        if (priceStatus) {
          priceStatus.textContent = "No price records found for this product. Click '+ Add Price' to set an initial price.";
        }
        return;
      }

      const cols = isAdmin
        ? ['EFFECTIVE DATE', 'UNIT PRICE', 'STATUS', 'STAMP', 'ACTIONS']
        : ['EFFECTIVE DATE', 'UNIT PRICE', ...(canManagePrice ? ['ACTIONS'] : [])];

      const headerRow = document.createElement('tr');
      for (const col of cols) {
        const th = text('th', col);
        th.setAttribute('scope', 'col');
        headerRow.append(th);
      }
      priceHead?.append(headerRow);

      for (const item of list) {
        const tr = document.createElement('tr');
        const effDate = String(item.effDate ?? item.effdate ?? '').slice(0, 10);
        const unitVal = item.unitPrice ?? item.unitprice;
        const itemStatus = (item.status ?? 'active').toLowerCase();

        if (isAdmin && itemStatus === 'inactive') tr.className = 'row-inactive';

        tr.append(text('td', effDate), text('td', price(unitVal)));

        if (isAdmin) {
          const stCell = document.createElement('td');
          const badge = document.createElement('span');
          badge.className = `badge ${itemStatus === 'inactive' ? 'badge-inactive' : 'badge-active'}`;
          badge.textContent = itemStatus === 'inactive' ? 'Inactive' : 'Active';
          stCell.append(badge);
          tr.append(stCell, text('td', item.stamp ?? '—'));
        }

        if (isAdmin || canManagePrice) {
          const actCell = document.createElement('td');
          const editBtn = text('button', 'Edit');
          editBtn.type = 'button';
          editBtn.addEventListener('click', () => resetPriceForm(item));

          const delBtn = text('button', 'Delete');
          delBtn.type = 'button';
          delBtn.className = 'btn-delete';
          delBtn.addEventListener('click', async () => {
            const priceId = item.id ?? item.priceId ?? encodeURIComponent(effDate);
            const delRes = await fetch(`/api/products/${encodeURIComponent(code)}/prices/${priceId}`, {
              method: 'DELETE',
              headers: { Accept: 'application/json' },
            });
            if (handleAuthError(delRes)) return;
            const delData = await parseJsonSafe(delRes);
            if (!delRes.ok) {
              setInlineError(priceFormError, delData.message || 'Could not delete price record.');
              return;
            }
            void loadPriceHistory();
            void load();
          });

          actCell.append(editBtn, delBtn);
          tr.append(actCell);
        }

        priceRows?.append(tr);
      }

      if (priceStatus) {
        priceStatus.textContent = `${list.length} price record${list.length === 1 ? '' : 's'} (sorted by effective date, newest first).`;
      }
      if (priceTable) priceTable.hidden = false;
    } catch {
      if (priceStatus) priceStatus.textContent = 'Check your connection and try again.';
    }
  }

  function openPriceModal(product) {
    activePriceProduct = product;
    activePriceTab = 'active';
    resetPriceForm(null);
    if (priceDialog) {
      if (typeof priceDialog.showModal === 'function') priceDialog.showModal();
      else priceDialog.setAttribute('open', '');
    }
    void loadPriceHistory();
  }

  function closePriceModal() {
    activePriceProduct = null;
    resetPriceForm(null);
    if (!priceDialog) return;
    if (typeof priceDialog.close === 'function' && priceDialog.open) priceDialog.close();
    else priceDialog.removeAttribute('open');
  }

  addPriceBtn?.addEventListener('click', () => {
    resetPriceForm(null);
    if (priceForm) priceForm.hidden = false;
    effDateInput?.focus();
  });

  priceCancelBtn?.addEventListener('click', () => resetPriceForm(null));

  priceForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!activePriceProduct) return;
    clearFieldErrors([effDateInput, unitPriceInput]);
    setInlineError(priceFormError, '');

    const effDate = effDateInput?.value.trim() ?? '';
    const rawPrice = unitPriceInput?.value.trim() ?? '';
    const numericPrice = Number(rawPrice);

    if (!effDate || !rawPrice) {
      if (!effDate) effDateInput?.classList.add('input-error');
      if (!rawPrice) unitPriceInput?.classList.add('input-error');
      setInlineError(priceFormError, 'Please complete all required product fields.');
      return;
    }

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      unitPriceInput?.classList.add('input-error');
      setInlineError(priceFormError, 'Unit price must be greater than 0.');
      unitPriceInput?.focus();
      return;
    }

    const code = activePriceProduct.prodcode ?? activePriceProduct.prodCode;
    const url = editingPriceId
      ? `/api/products/${encodeURIComponent(code)}/prices/${encodeURIComponent(editingPriceId)}`
      : `/api/products/${encodeURIComponent(code)}/prices`;
    const method = editingPriceId ? 'PUT' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ effDate, unitPrice: numericPrice }),
      });
      const data = await parseJsonSafe(response);
      if (handleAuthError(response)) return;
      if (response.status === 409) {
        effDateInput?.classList.add('input-error');
        setInlineError(priceFormError, 'A price record already exists for this effective date.');
        return;
      }
      if (!response.ok) {
        setInlineError(priceFormError, data.message || 'Could not save price record.');
        return;
      }
      resetPriceForm(null);
      void loadPriceHistory();
      void load();
    } catch {
      setInlineError(priceFormError, 'Network error while saving price.');
    }
  });

  function render(data) {
    selected = data.filter?.status ?? 'active';
    const metadata = Boolean(data.capabilities?.metadata);
    currentCapabilities = { ...currentCapabilities, ...(data.capabilities ?? {}) };
    updateClearSearchButton();

    if (addBtn) addBtn.hidden = !data.capabilities?.add;
    if (metadata && tabs) {
      tabs.hidden = false;
      for (const key of ['active', 'inactive', 'all']) {
        const button = text('button', `${key[0].toUpperCase() + key.slice(1)} (${data.counts?.[key] ?? 0})`);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(selected === key));
        button.addEventListener('click', () => {
          clearTimeout(timer);
          selected = key;
          void load();
        });
        tabs.append(button);
      }
    }

    const actions = Boolean(data.capabilities?.edit || data.capabilities?.delete || data.capabilities?.prices);
    const header = document.createElement('tr');
    for (const label of ['Prod Code', 'Description', 'Unit', 'Current Price', ...(metadata ? ['Status', 'Stamp'] : []), ...(actions ? ['Actions'] : [])]) {
      const cell = text('th', label);
      cell.setAttribute('scope', 'col');
      header.append(cell);
    }
    head?.append(header);

    const productList = Array.isArray(data.products) ? data.products : [];
    const visibleProducts = metadata
      ? productList
      : productList.filter((item) => (item.status ?? 'active') !== 'inactive');

    for (const product of visibleProducts) {
      const isInactive = (product.status ?? 'active') === 'inactive';
      const row = document.createElement('tr');
      if (isInactive) row.className = 'row-inactive product-inactive';

      for (const field of ['prodcode', 'description', 'unit']) {
        row.append(text('td', product[field] ?? product.prodCode));
      }

      const money = text('td', price(product.currentPrice));
      money.className = 'product-price';
      row.append(money);

      if (metadata) {
        const stateCell = document.createElement('td');
        stateCell.className = 'product-state';
        const badge = document.createElement('span');
        badge.className = `badge ${isInactive ? 'badge-inactive' : 'badge-active'}`;
        badge.textContent = isInactive ? 'Inactive' : 'Active';
        stateCell.append(badge);
        row.append(stateCell, text('td', product.stamp));
      }

      if (actions) {
        const cell = document.createElement('td');
        if (data.capabilities?.prices) {
          const pricesBtn = text('button', 'Prices');
          pricesBtn.type = 'button';
          pricesBtn.addEventListener('click', () => openPriceModal(product));
          cell.append(pricesBtn);
        }
        if (!isInactive && data.capabilities?.edit) {
          const editBtn = text('button', 'Edit');
          editBtn.type = 'button';
          editBtn.addEventListener('click', () => openProductEditor(product));
          cell.append(editBtn);
        }
        if (data.capabilities?.delete && (!isInactive || metadata)) {
          const toggleBtn = text('button', isInactive ? 'Restore' : 'Delete');
          toggleBtn.type = 'button';
          toggleBtn.className = isInactive ? 'btn-restore' : 'btn-delete';
          toggleBtn.addEventListener('click', () => {
            if (isInactive) requestRestoreProduct(product);
            else requestDeleteProduct(product);
          });
          cell.append(toggleBtn);
        }
        row.append(cell);
      }

      rows?.append(row);
    }

    if (table) table.hidden = visibleProducts.length === 0;
    const query = search?.value.trim() ?? '';
    if (status) {
      if (visibleProducts.length > 0) {
        status.textContent = `${visibleProducts.length} product${visibleProducts.length === 1 ? '' : 's'} found.`;
      } else if (query) {
        status.textContent = `No products found matching '${query}'. Clear search or add a new record.`;
      } else {
        status.textContent = 'No products match your search and filter.';
      }
    }
  }

  async function load() {
    const version = ++generation;
    clear();
    updateClearSearchButton();
    table?.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Loading products…';
    try {
      const response = await fetch('/api/products?' + new URLSearchParams({ search: search?.value.trim() ?? '', status: selected }), {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await parseJsonSafe(response);
      if (version !== generation) return;
      if (handleAuthError(response)) return;
      if (!response.ok) {
        if (status) {
          status.textContent = response.status === 403
            ? 'Product access is unavailable. Contact an administrator.'
            : response.status === 400
              ? (data.message || 'Invalid filter request.')
              : 'Products could not be loaded. Try again.';
        }
        if (retry) retry.hidden = false;
        return;
      }
      render(data);
    } catch {
      if (version === generation) {
        clear();
        if (status) status.textContent = 'Check your connection and try again.';
        if (retry) retry.hidden = false;
      }
    } finally {
      if (version === generation) table?.setAttribute('aria-busy', 'false');
    }
  }

  addBtn?.addEventListener('click', () => openProductEditor(null));
  editorClose?.addEventListener('click', closeProductEditor);
  cancelEditBtn?.addEventListener('click', closeProductEditor);
  editorDialog?.addEventListener('click', (e) => {
    if (e.target === editorDialog) closeProductEditor();
  });

  confirmClose?.addEventListener('click', closeConfirmModal);
  confirmCancelBtn?.addEventListener('click', closeConfirmModal);
  confirmDialog?.addEventListener('click', (e) => {
    if (e.target === confirmDialog) closeConfirmModal();
  });

  priceClose?.addEventListener('click', closePriceModal);
  priceDialog?.addEventListener('click', (e) => {
    if (e.target === priceDialog) closePriceModal();
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (search) {
      search.value = '';
      search.focus();
    }
    updateClearSearchButton();
    clearTimeout(timer);
    void load();
  });

  search?.addEventListener('input', () => {
    updateClearSearchButton();
    clearTimeout(timer);
    ++generation;
    clear();
    table?.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Loading products…';
    timer = setTimeout(() => { void load(); }, 250);
  });

  retry?.addEventListener('click', () => { void load(); });
  window.addEventListener('focus', () => { clearTimeout(timer); void load(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearTimeout(timer);
      void load();
    }
  });

  void load();
})();