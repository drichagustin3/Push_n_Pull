(() => {
  const nav = document.getElementById('workspaceNav');
  const status = document.getElementById('workspaceStatus');
  const tiles = document.getElementById('workspaceTiles');
  const metrics = document.getElementById('workspaceMetrics');
  const logout = document.getElementById('workspaceLogout');
  let generation = 0;
  const notify = (text) => { status.textContent = text; };
  async function read(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const data = await response.json();
    if ([401, 403].includes(response.status) && ['unauthenticated', 'account_blocked', 'account_pending', 'account_inactive'].includes(data.error)) window.location.assign('/login?terminated=1');
    if (!response.ok) throw new Error(data.message || 'Workspace access is unavailable.');
    return data;
  }
  function link(item) {
    const anchor = document.createElement('a'); anchor.href = item.href; anchor.textContent = item.label;
    if (window.location.pathname === item.href) anchor.setAttribute('aria-current', 'page');
    return anchor;
  }
  async function refresh() {
    const version = ++generation;
    notify('Loading workspace…'); nav.replaceChildren(); tiles?.replaceChildren(); metrics?.replaceChildren();
    document.getElementById('workspaceName').textContent = ''; document.getElementById('workspaceRole').textContent = '';
    try {
      const data = await read('/api/navigation'); if (version !== generation) return;
      document.getElementById('workspaceName').textContent = data.user.name || data.user.username;
      document.getElementById('workspaceRole').textContent = data.user.role;
      nav.append(link({ href: '/workspace', label: 'Main page' }));
      for (const item of data.items) { nav.append(link(item)); tiles?.append(link(item)); }
      notify(data.restricted ? 'No modules are assigned. Contact an administrator for access.' : 'Your authorized workspace is ready.');
      if (window.location.pathname.startsWith('/workspace/') && !data.items.some((item) => item.href === window.location.pathname)) notify('Access to this section is no longer available.');
      if (metrics) {
        try {
          const result = await read('/api/dashboard/metrics'); if (version !== generation) return;
          const labels = { customers: 'Active Customers', products: 'Active Products', sales: 'Active Sales', revenue: 'Gross Revenue' };
          for (const [key, value] of Object.entries(result.metrics)) {
            const card = document.createElement('article'); card.className = 'ws-kpi';
            const label = document.createElement('h2'); label.textContent = labels[key];
            const amount = document.createElement('strong'); amount.textContent = key === 'revenue' ? `₱${value}` : new Intl.NumberFormat().format(BigInt(value));
            card.append(label, amount); metrics.append(card);
          }
          if (!Object.keys(result.metrics).length) { const empty = document.createElement('p'); empty.textContent = 'No dashboard metrics are available for your assigned modules.'; metrics.append(empty); }
        } catch (error) { if (version === generation) { const text = document.createElement('p'); text.textContent = error instanceof TypeError ? 'Metrics could not be loaded. Try refreshing.' : error.message; metrics.append(text); } }
      }
    } catch (error) { if (version === generation) { nav.replaceChildren(); tiles?.replaceChildren(); notify(error instanceof TypeError ? 'Check your connection and refresh the workspace.' : error.message); } }
  }
  logout.addEventListener('click', async () => {
    if (logout.disabled) return; logout.disabled = true;
    try {
      const response = await fetch('/api/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('Sign out failed.');
      window.location.assign('/');
    } catch { notify('Unable to sign out. Try again.'); }
    finally { logout.disabled = false; }
  });
  window.addEventListener('focus', () => { void refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  void refresh();
})();
