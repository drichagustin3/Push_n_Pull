const filters = document.getElementById('filters');
const editor = document.getElementById('editor');
const message = document.getElementById('message');
const tbody = document.getElementById('directoryBody');
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const directoryState = document.getElementById('directoryState');
let page = 1, loading = false, saving = false;
function notify(text) { message.textContent = text; message.focus(); }
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? 'Your session ended. Sign in again.' : result.error || 'Request failed.');
  return result;
}
function cell(row, text, tag = 'td') { const element = document.createElement(tag); element.textContent = text ?? '—'; row.append(element); return element; }
function newUser() {
  editor.reset(); editor.elements.id.value = '';
  document.getElementById('passwordFields').hidden = false;
  document.getElementById('passwordFields').disabled = false;
  document.getElementById('editorTitle').textContent = 'Add User';
  document.getElementById('saveUser').textContent = 'Add User';
}
function edit(user) {
  editor.reset();
  for (const [field, value] of Object.entries({ id: user.user_id, firstName: user.first_name, lastName: user.last_name, email: user.email, empno: user.empno ?? '' })) editor.elements[field].value = value;
  document.getElementById('passwordFields').hidden = true;
  document.getElementById('passwordFields').disabled = true;
  document.getElementById('editorTitle').textContent = 'Edit User';
  document.getElementById('saveUser').textContent = 'Save User';
  editor.elements.firstName.focus();
}
async function load() {
  if (loading) return;
  loading = true; previous.disabled = true; next.disabled = true;
  directoryState.textContent = 'Loading accounts…';
  try {
    const query = new URLSearchParams(new FormData(filters)); query.set('page', page);
    const data = await api('/api/users?' + query);
    const head = document.createElement('tr');
    const headings = ['Name', 'Email', 'Role', 'Access', 'Employee', ...(data.viewer.showMetadata ? ['Status', 'Stamp', 'Deleted'] : []), 'Actions'];
    for (const heading of headings) cell(head, heading, 'th').scope = 'col';
    document.getElementById('directoryHead').replaceChildren(head); tbody.replaceChildren();
    for (const user of data.users) {
      const row = document.createElement('tr'); if (user.is_deleted) row.className = 'deleted';
      for (const value of [user.first_name + ' ' + user.last_name, user.email, user.role, user.blocked ? 'Blocked' : 'Unblocked', user.empno,
        ...(data.viewer.showMetadata ? [user.status, user.stamp, user.is_deleted ? 'Yes' : 'No'] : [])]) cell(row, value);
      const actions = cell(row, '');
      if (user.can_edit) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Edit'; button.addEventListener('click', () => { if (!saving) edit(user); }); actions.append(button);
      }
      if (user.can_block) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = user.blocked ? 'Unblock' : 'Block';
        button.addEventListener('click', async () => {
          if (saving || loading) return; saving = true; button.disabled = true;
          try { await api(`/api/users/${user.user_id}/block`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isBlocked: !user.blocked }) }); notify('Account access updated.'); await load(); }
          catch (error) { notify(error instanceof TypeError ? 'Check your connection and try again.' : error.message); }
          finally { saving = false; button.disabled = false; }
        }); actions.append(button);
      }
      if (!actions.childNodes.length) actions.textContent = '—'; tbody.append(row);
    }
    document.getElementById('page').textContent = `Page ${data.page}`; previous.disabled = page <= 1; next.disabled = !data.hasMore;
    directoryState.textContent = data.users.length ? `${data.users.length} accounts shown.` : 'No accounts match these filters.';
  } catch (error) { tbody.replaceChildren(); directoryState.textContent = 'Accounts could not be loaded.'; notify(error instanceof TypeError ? 'Check your connection and try again.' : error.message); }
  finally { loading = false; }
}
filters.addEventListener('submit', (event) => { event.preventDefault(); if (!loading) { page = 1; void load(); } });
previous.addEventListener('click', () => { if (!loading && page > 1) { page -= 1; void load(); } });
next.addEventListener('click', () => { if (!loading) { page += 1; void load(); } });
document.getElementById('cancelEdit').addEventListener('click', () => { if (!saving) newUser(); });
editor.addEventListener('submit', async (event) => {
  event.preventDefault(); if (saving || loading) return; saving = true;
  const button = document.getElementById('saveUser'); button.disabled = true;
  const data = Object.fromEntries(new FormData(editor)); const id = data.id; delete data.id; data.empno ||= null;
  try {
    await api(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    newUser(); notify(id ? 'User updated.' : 'User added. Provide their temporary password privately.'); await load();
  } catch (error) { notify(error instanceof TypeError ? 'Check your connection and try again.' : error.message); }
  finally { editor.querySelectorAll('input[type="password"]').forEach((input) => { input.value = ''; }); saving = false; button.disabled = false; }
});
void load();
