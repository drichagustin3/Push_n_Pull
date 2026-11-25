(() => {
  const byId = (id) => document.getElementById(id);
  const base = '/api/hr/jobs';
  const table = byId('jobTable');
  const search = byId('jobSearch');
  const statusFilter = byId('jobStatusFilter');
  const feedback = byId('jobFeedback');
  const dialog = byId('jobDialog');
  const form = byId('jobForm');
  const code = form.elements.jobCode;
  const name = form.elements.jobDesc;
  const save = byId('jobSave');
  const cancel = byId('jobCancel');
  const error = byId('jobError');
  const add = byId('jobAdd');
  const labels = { active: 'Active', inactive: 'Inactive', all: 'All' };
  let selection;
  let pendingList;
  let searchTimer;
  let status = 'active';

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
    const title = { add: 'Add job', edit: 'Edit job', delete: 'Delete job', restore: 'Restore job' }[operation];
    byId('jobTitle').textContent = title;
    const confirmation = byId('jobConfirmation');
    confirmation.hidden = editing;
    confirmation.textContent = editing ? '' : title + ' ' + record.jobcode + '?';
    byId('jobFields').hidden = !editing;
    code.disabled = !editing;
    name.disabled = !editing;
    code.readOnly = operation === 'edit';
    code.value = record?.jobcode ?? '';
    name.value = record?.jobdesc ?? '';
    save.textContent = editing ? 'Save' : title;
    dialog.showModal();
    if (!editing) cancel.focus();
    else if (operation === 'edit') name.focus();
    else code.focus();
  }

  function render({ jobs, capabilities, counts, filter }, notice) {
    add.hidden = !capabilities.add;
    statusFilter.hidden = !capabilities.metadata;
    status = filter.status;
    for (const button of statusFilter.querySelectorAll('button')) {
      button.textContent = labels[button.value] + (counts ? ' (' + counts[button.value] + ')' : '');
      button.setAttribute('aria-pressed', String(button.value === status));
    }
    const actions = capabilities.edit || capabilities.delete || capabilities.restore;
    const headings = ['Job Code', 'Job Description', ...(capabilities.metadata ? ['Status', 'Stamp'] : []), ...(actions ? ['Actions'] : [])];
    const head = document.createElement('tr');
    for (const heading of headings) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = heading;
      head.append(th);
    }
    table.tHead.replaceChildren(head);
    const rows = jobs.map((record) => {
      const row = document.createElement('tr');
      const values = [record.jobcode, record.jobdesc];
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
          button.setAttribute('aria-label', button.textContent + ' job ' + record.jobcode);
          button.addEventListener('click', () => openEditor(operation, record));
          cell.append(button);
        }
      }
      return row;
    });
    table.tBodies[0].replaceChildren(...rows);
    table.hidden = rows.length === 0;
    feedback.textContent = [notice, rows.length ? '' : 'No jobs match your filters.'].filter(Boolean).join(' ');
  }

  async function load(notice = '') {
    clearTimeout(searchTimer);
    pendingList?.abort();
    const controller = new AbortController();
    pendingList = controller;
    feedback.textContent = 'Loading jobs…';
    try {
      const query = new URLSearchParams({ search: search.value, status });
      const result = await request(base + '?' + query, { signal: controller.signal });
      if (!controller.signal.aborted) render(result, notice);
    } catch (failure) {
      if (controller.signal.aborted) return;
      add.hidden = true;
      table.hidden = true;
      statusFilter.hidden = true;
      feedback.textContent = [notice, failure.message].filter(Boolean).join(' ');
    }
  }

  add.addEventListener('click', () => openEditor('add'));
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { if (save.disabled) event.preventDefault(); });
  byId('jobFilters').addEventListener('submit', (event) => { event.preventDefault(); void load(); });
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    pendingList?.abort();
    searchTimer = setTimeout(load, 250);
  });
  for (const button of statusFilter.querySelectorAll('button')) {
    button.addEventListener('click', () => { status = button.value; void load(); });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    const { operation, record } = selection;
    const method = { add: 'POST', edit: 'PUT', delete: 'DELETE', restore: 'POST' }[operation];
    const url = base + (record ? '/' + encodeURIComponent(record.jobcode) : '') + (operation === 'restore' ? '/restore' : '');
    const data = operation === 'add' ? { jobCode: code.value, jobDesc: name.value }
      : operation === 'edit' ? { jobDesc: name.value } : undefined;
    error.textContent = '';
    save.disabled = cancel.disabled = true;
    try {
      await request(url, { method, body: JSON.stringify(data) });
      dialog.close();
      const notice = { add: 'Job added.', edit: 'Job updated.', delete: 'Job deleted.', restore: 'Job restored.' }[operation];
      await load(notice);
    } catch (failure) {
      error.textContent = failure.message;
    } finally {
      save.disabled = cancel.disabled = false;
    }
  });
  void load();
})();
