(() => {
  const dialog = document.getElementById('rightsDialog');
  const groups = document.getElementById('rightsModules');
  const status = document.getElementById('rightsStatus');
  const counter = document.getElementById('rightsCount');
  const save = document.getElementById('rightsSave');
  const cancel = document.getElementById('rightsCancel');
  const all = document.getElementById('rightsAll');
  const none = document.getElementById('rightsNone');
  let target, trigger, generation = 0, saving = false, inputs = [], modules = [];
  function synchronize() {
    for (const { header, rights } of modules) {
      const selected = rights.filter((input) => input.checked).length;
      header.checked = selected === rights.length;
      header.indeterminate = selected > 0 && selected < rights.length;
    }
    counter.textContent = `${inputs.filter((input) => input.checked).length} / ${inputs.length}`;
  }
  function busy(value) {
    save.disabled = value; all.disabled = value; none.disabled = value;
    for (const input of [...inputs, ...modules.map((module) => module.header)]) input.disabled = value;
    cancel.disabled = saving;
  }
  function render(data) {
    groups.replaceChildren(); inputs = []; modules = [];
    for (const module of data.modules) {
      const fieldset = document.createElement('fieldset');
      const legend = document.createElement('legend'); const label = document.createElement('label');
      label.textContent = module.description;
      const header = document.createElement('input'); header.type = 'checkbox'; header.dataset.module = module.code;
      label.append(header); legend.append(label); fieldset.append(legend);
      const rights = [];
      for (const right of module.rights) {
        const item = document.createElement('label'); item.textContent = right.description;
        const box = document.createElement('input'); box.type = 'checkbox'; box.value = right.rightCode; box.checked = right.granted;
        box.addEventListener('change', synchronize); item.append(box); fieldset.append(item); rights.push(box); inputs.push(box);
      }
      header.addEventListener('change', () => { rights.forEach((input) => { input.checked = header.checked; }); synchronize(); });
      modules.push({ header, rights }); groups.append(fieldset);
    }
    synchronize(); all.textContent = `All (${inputs.length})`;
  }
  function close() {
    if (saving) return;
    generation += 1; target = undefined; groups.replaceChildren(); inputs = []; modules = [];
    dialog.close(); trigger?.focus();
  }
  async function request(url, options) {
    const response = await fetch(url, options); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Rights could not be loaded or saved.');
    return data;
  }
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  all.addEventListener('click', () => { if (all.disabled) return; inputs.forEach((input) => { input.checked = true; }); synchronize(); });
  none.addEventListener('click', () => { if (none.disabled) return; inputs.forEach((input) => { input.checked = false; }); synchronize(); });
  save.addEventListener('click', async () => {
    if (saving || save.disabled || !target) return;
    saving = true; busy(true); status.textContent = 'Saving rights…';
    try {
      const data = await request(`/api/users/${target}/rights`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rightCodes: inputs.filter((input) => input.checked).map((input) => input.value) }) });
      render(data); status.textContent = 'Rights saved.';
    } catch (error) { status.textContent = error instanceof TypeError ? 'Check your connection and try again.' : error.message; }
    finally { saving = false; busy(false); status.focus(); }
  });
  window.HopeRights = {
    async open(user, opener) {
      if (dialog.open) return;
      target = user.user_id; trigger = opener; const version = ++generation;
      document.getElementById('rightsTarget').textContent = `Target User: ${user.first_name} ${user.last_name}`;
      status.textContent = 'Loading rights…'; counter.textContent = '0 / 0'; groups.replaceChildren(); busy(true); dialog.showModal();
      try {
        const data = await request(`/api/users/${target}/rights`);
        if (generation !== version) return;
        render(data); busy(false);
        status.textContent = 'Select the actions this account may use.';
      } catch (error) {
        if (generation !== version) return;
        status.textContent = error instanceof TypeError ? 'Check your connection and try again.' : error.message;
      }
    },
  };
})();
