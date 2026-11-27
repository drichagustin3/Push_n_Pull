(() => {
  const byId = (id) => document.getElementById(id);
  const base = '/api/hr/departments';
  const table = byId('departmentTable');
  const status = byId('departmentStatus');
  const feedback = byId('departmentFeedback');
  const dialog = byId('departmentDialog');
  const form = byId('departmentForm');
  const code = form.elements.deptCode;
  const name = form.elements.deptName;
  const save = byId('departmentSave');
  const cancel = byId('departmentCancel');
  const error = byId('departmentError');
  const add = byId('departmentAdd');
  const labels = { active: 'Active', inactive: 'Inactive', all: 'All' };
  let selection;
  let pendingList;

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: {
      Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'The request could not be completed.');
    return body;
  }

  function openEditor(operation, record) {
    selection = { operation, record };
    form.reset();
    error.textContent = '';
    const editing = operation === 'add' || operation === 'edit';
    const title = { add: 'Add department', edit: 'Edit department', delete: 'Delete department', restore: 'Restore department' }[operation];
    byId('departmentTitle').textContent = title;
    const confirmation = byId('departmentConfirmation');
    confirmation.hidden = editing;
    confirmation.textContent = editing ? '' : title + ' ' + record.deptcode + '?';
    byId('departmentFields').hidden = !editing;
    code.disabled = !editing;
    name.disabled = !editing;
    code.readOnly = operation === 'edit';
    code.value = record?.deptcode ?? '';
    name.value = record?.deptname ?? '';
    save.textContent = editing ? 'Save' : title;
    dialog.showModal();
    if (!editing) cancel.focus();
    else if (operation === 'edit') name.focus();
    else code.focus();
  }

  function render({ departments, capabilities, counts }) {
    add.hidden = !capabilities.add;
    byId('departmentStatusFilter').hidden = !capabilities.metadata;
    if (!capabilities.metadata) status.value = 'active';
    for (const option of status.options) {
      option.textContent = labels[option.value] + (counts ? ' (' + counts[option.value] + ')' : '');
    }
    const actions = capabilities.edit || capabilities.delete || capabilities.restore;
    const headings = ['Code', 'Department', ...(capabilities.metadata ? ['Status', 'Stamp'] : []), ...(actions ? ['Actions'] : [])];
    const head = document.createElement('tr');
    for (const heading of headings) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = heading;
      head.append(th);
    }
    table.tHead.replaceChildren(head);
    const rows = departments.map((record) => {
      const row = document.createElement('tr');
      const values = [record.deptcode, record.deptname];
      if (capabilities.metadata) values.push(labels[record.status], record.stamp);
      for (const value of values) row.insertCell().textContent = value ?? '';
      if (actions) {
        const cell = row.insertCell();
        const active = record.status !== 'inactive';
        for (const [operation, allowed] of [
          ['edit', active && capabilities.edit], ['delete', active && capabilities.delete],
          ['restore', !active && capabilities.restore],
        ]) {
          if (!allowed) continue;
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = operation[0].toUpperCase() + operation.slice(1);
          button.setAttribute('aria-label', button.textContent + ' department ' + record.deptcode);
          button.addEventListener('click', () => openEditor(operation, record));
          cell.append(button);
        }
      }
      return row;
    });
    table.tBodies[0].replaceChildren(...rows);
    table.hidden = rows.length === 0;
    feedback.textContent = rows.length ? '' : 'No departments match your filters.';
  }

  async function load() {
    pendingList?.abort();
    const controller = new AbortController();
    pendingList = controller;
    feedback.textContent = 'Loading departments…';
    try {
      const query = new URLSearchParams({ search: byId('departmentSearch').value, status: status.value });
      const result = await request(base + '?' + query, { signal: controller.signal });
      if (!controller.signal.aborted) render(result);
    } catch (failure) {
      if (controller.signal.aborted) return;
      add.hidden = true;
      table.hidden = true;
      feedback.textContent = failure.message;
    }
  }

  add.addEventListener('click', () => openEditor('add'));
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { if (save.disabled) event.preventDefault(); });
  byId('departmentFilters').addEventListener('submit', (event) => { event.preventDefault(); void load(); });
  status.addEventListener('change', load);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    const { operation, record } = selection;
    const method = { add: 'POST', edit: 'PUT', delete: 'DELETE', restore: 'POST' }[operation];
    const url = base + (record ? '/' + encodeURIComponent(record.deptcode) : '') + (operation === 'restore' ? '/restore' : '');
    const data = operation === 'add' ? { deptCode: code.value, deptName: name.value }
      : operation === 'edit' ? { deptName: name.value } : undefined;
    error.textContent = '';
    save.disabled = cancel.disabled = true;
    try {
      await request(url, { method, body: JSON.stringify(data) });
      dialog.close();
      await load();
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      save.disabled = cancel.disabled = false;
    }
  });
  void load();
})();
