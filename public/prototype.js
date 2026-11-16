// ==================== 36 GRANULAR RIGHTS ACROSS 5 MODULES ====================
const RIGHTS_MODULES = [
  {
    name: '1. User & Access Governance (8 Rights)',
    rights: [
      'users.view', 'users.create', 'users.edit', 'users.block',
      'users.unblock', 'users.soft_delete', 'users.restore', 'users.assign_rights'
    ]
  },
  {
    name: '2. Customer Relationship Management (7 Rights)',
    rights: [
      'customers.view', 'customers.create', 'customers.edit', 'customers.archive',
      'customers.export', 'customers.credit_limit', 'customers.notes'
    ]
  },
  {
    name: '3. Inventory & Warehouse Control (7 Rights)',
    rights: [
      'inventory.view', 'inventory.add_item', 'inventory.edit_item', 'inventory.stock_adjust',
      'inventory.transfer', 'inventory.low_stock_alert', 'inventory.audit_log'
    ]
  },
  {
    name: '4. Sales & Point of Sale (7 Rights)',
    rights: [
      'sales.view', 'sales.create_order', 'sales.approve_invoice', 'sales.apply_discount',
      'sales.void_transaction', 'sales.refund', 'sales.pos_terminal'
    ]
  },
  {
    name: '5. Financial & Executive Reporting (7 Rights)',
    rights: [
      'reports.sales_summary', 'reports.inventory_valuation', 'reports.revenue_kpi',
      'reports.tax_ledger', 'reports.export_csv', 'reports.export_pdf', 'reports.system_audit'
    ]
  }
];

const ALL_RIGHT_KEYS = RIGHTS_MODULES.flatMap((m) => m.rights);

// ==================== MOCK DIRECTORY & ROLE CONFIG ====================
const state = {
  currentUser: {
    name: 'Ashley Nicole Marticio',
    email: 'superadmin@hope-erp.com',
    role: 'Superadmin'
  },
  activeTab: 'dashboard',
  editingUserId: null,
  users: [
    {
      id: 1,
      name: 'Ashley Nicole Marticio',
      email: 'superadmin@hope-erp.com',
      role: 'Superadmin',
      status: 'Active',
      rights: [...ALL_RIGHT_KEYS]
    },
    {
      id: 2,
      name: 'Ricky Sanglay',
      email: 'admin@hope-erp.com',
      role: 'Admin',
      status: 'Active',
      rights: ALL_RIGHT_KEYS.slice(0, 24)
    },
    {
      id: 3,
      name: 'Drich Agustin',
      email: 'ops.lead@hope-erp.com',
      role: 'Admin',
      status: 'Blocked',
      rights: ALL_RIGHT_KEYS.slice(0, 18)
    },
    {
      id: 4,
      name: 'Maria Santos',
      email: 'staff@hope-erp.com',
      role: 'User',
      status: 'Active',
      rights: ['customers.view', 'customers.create', 'inventory.view', 'sales.view', 'sales.create_order', 'sales.pos_terminal']
    }
  ]
};

const ROLE_CONFIG = {
  Superadmin: {
    nav: [
      { id: 'dashboard', label: 'Executive Dashboard', badge: 'Full' },
      { id: 'users', label: 'User Management & Rights', badge: '36' }
    ],
    notice: 'Superadmin View: Unrestricted system governance, user blocking/restoration, and 36-rights permission assignment enabled.',
    quickActions: [
      { title: 'Manage 36 User Rights', desc: 'Configure granular module access', target: 'users' },
      { title: 'Review Blocked Accounts', desc: 'Inspect Figure 36 blocked user flags', target: 'users' },
      { title: 'Generate Revenue Audit', desc: 'Export Q4 financial summary', target: 'dashboard' },
      { title: 'System Health & DB Check', desc: 'Verify Express + PostgreSQL status', target: 'dashboard' }
    ]
  },
  Admin: {
    nav: [
      { id: 'dashboard', label: 'Operations Dashboard', badge: 'Ops' },
      { id: 'users', label: 'User Directory', badge: 'Manage' }
    ],
    notice: 'Admin View: Operational management enabled. You can block/unblock standard staff accounts and inspect permissions.',
    quickActions: [
      { title: 'Directory & Status Control', desc: 'Block or unblock user accounts', target: 'users' },
      { title: 'Approve Pending Invoices', desc: '14 orders awaiting sign-off', target: 'dashboard' },
      { title: 'Stock Reorder Queue', desc: 'Review 42 low-stock SKUs', target: 'dashboard' },
      { title: 'Customer Credit Review', desc: 'Validate corporate limits', target: 'dashboard' }
    ]
  },
  User: {
    nav: [
      { id: 'dashboard', label: 'Sales & POS Workspace', badge: 'Staff' }
    ],
    notice: 'Standard User View: Administrative User Management is hidden based on role privileges. Focused on daily sales and customer workflows.',
    quickActions: [
      { title: 'New Sales Order', desc: 'Create POS or B2B invoice', target: 'dashboard' },
      { title: 'Register Customer', desc: 'Onboard new retail client', target: 'dashboard' },
      { title: 'Check Product Stock', desc: 'Real-time warehouse lookup', target: 'dashboard' },
      { title: 'Daily Shift Summary', desc: 'View personal sales totals', target: 'dashboard' }
    ]
  }
};

// ==================== DOM REFERENCES ====================
const authView = document.getElementById('auth-view');
const appShell = document.getElementById('app-shell');
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const emailFeedback = document.getElementById('email-feedback');
const passwordFeedback = document.getElementById('password-feedback');
const loginAlert = document.getElementById('login-alert');

// ==================== AUTH & VALIDATION ====================
document.querySelectorAll('.eval-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    emailInput.value = btn.dataset.email;
    passwordInput.value = btn.dataset.pass;
    validateEmail();
    validatePassword();
    showLoginAlert(`Loaded ${btn.dataset.role} evaluation credentials. Click "Sign In" to launch.`, true);
  });
});

document.getElementById('toggle-password').addEventListener('click', (e) => {
  const isPass = passwordInput.type === 'password';
  passwordInput.type = isPass ? 'text' : 'password';
  e.target.textContent = isPass ? 'Hide' : 'Show';
});

document.getElementById('forgot-pass-trigger').addEventListener('click', () => {
  showLoginAlert('Password reset link simulation: Check your corporate inbox or use an Evaluation Account on the left.', true);
});

function validateEmail() {
  const val = emailInput.value.trim();
  if (!val) {
    emailInput.classList.add('input-error');
    emailFeedback.textContent = 'Corporate email is required.';
    emailFeedback.className = 'field-feedback error';
    return false;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    emailInput.classList.add('input-error');
    emailFeedback.textContent = 'Enter a valid email format (e.g., admin@hope-erp.com).';
    emailFeedback.className = 'field-feedback error';
    return false;
  }
  emailInput.classList.remove('input-error');
  emailFeedback.textContent = 'Valid corporate email format.';
  emailFeedback.className = 'field-feedback valid';
  return true;
}

function validatePassword() {
  const val = passwordInput.value;
  if (val.length < 8) {
    passwordInput.classList.add('input-error');
    passwordFeedback.textContent = 'Password must be at least 8 characters.';
    passwordFeedback.className = 'field-feedback error';
    return false;
  }
  passwordInput.classList.remove('input-error');
  passwordFeedback.textContent = 'Password meets complexity length.';
  passwordFeedback.className = 'field-feedback valid';
  return true;
}

emailInput.addEventListener('input', validateEmail);
passwordInput.addEventListener('input', validatePassword);

function showLoginAlert(msg, isInfo = false) {
  loginAlert.textContent = msg;
  loginAlert.className = isInfo ? 'alert-banner info' : 'alert-banner';
  loginAlert.classList.remove('hidden');
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const okEmail = validateEmail();
  const okPass = validatePassword();
  if (!okEmail || !okPass) {
    showLoginAlert('Please fix the highlighted validation errors before signing in.');
    return;
  }

  const email = emailInput.value.trim().toLowerCase();
  let role = 'User';
  let name = 'Maria Santos';
  if (email.includes('superadmin')) {
    role = 'Superadmin';
    name = 'Ashley Nicole Marticio';
  } else if (email.includes('admin')) {
    role = 'Admin';
    name = 'Ricky Sanglay';
  }

  state.currentUser = { name, email, role };
  state.activeTab = 'dashboard';
  enterWorkspace();
});

document.getElementById('logout-btn').addEventListener('click', () => {
  appShell.classList.add('hidden');
  authView.classList.remove('hidden');
  loginAlert.classList.add('hidden');
});

document.getElementById('live-role-switch').addEventListener('change', (e) => {
  const newRole = e.target.value;
  const preset = {
    Superadmin: { name: 'Ashley Nicole Marticio', email: 'superadmin@hope-erp.com' },
    Admin: { name: 'Ricky Sanglay', email: 'admin@hope-erp.com' },
    User: { name: 'Maria Santos', email: 'staff@hope-erp.com' }
  }[newRole];

  state.currentUser = { ...preset, role: newRole };
  if (newRole === 'User' && state.activeTab === 'users') {
    state.activeTab = 'dashboard';
  }
  renderWorkspace();
});

// ==================== WORKSPACE RENDERING ====================
function enterWorkspace() {
  authView.classList.add('hidden');
  appShell.classList.remove('hidden');
  renderWorkspace();
}

function renderWorkspace() {
  const { name, email, role } = state.currentUser;
  const cfg = ROLE_CONFIG[role];

  document.getElementById('live-role-switch').value = role;
  document.getElementById('sidebar-role-label').textContent = `${role} Workspace`;
  document.getElementById('active-user-name').textContent = name;
  document.getElementById('active-user-email').textContent = email;

  const pill = document.getElementById('active-role-pill');
  pill.textContent = role;
  pill.className = `role-pill ${role.toLowerCase()}`;

  // Sidebar Navigation
  const navContainer = document.getElementById('sidebar-nav');
  navContainer.innerHTML = '';
  cfg.nav.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-item ${state.activeTab === item.id ? 'active' : ''}`;
    btn.innerHTML = `<span>${item.label}</span><small>${item.badge}</small>`;
    btn.addEventListener('click', () => {
      state.activeTab = item.id;
      renderWorkspace();
    });
    navContainer.appendChild(btn);
  });

  // Switch active view
  const dashView = document.getElementById('dashboard-view');
  const usersView = document.getElementById('users-view');
  if (state.activeTab === 'users' && role !== 'User') {
    dashView.classList.add('hidden');
    usersView.classList.remove('hidden');
    document.getElementById('page-title').textContent = 'User Management & Rights';
    document.getElementById('page-subtitle').textContent = 'Figures 35–40 • Account status controls & 36-rights matrix';
    renderUserTable();
  } else {
    usersView.classList.add('hidden');
    dashView.classList.remove('hidden');
    document.getElementById('page-title').textContent = `${role} Dashboard`;
    document.getElementById('page-subtitle').textContent = 'Real-time operational metrics & role-scoped workflow shortcuts';
  }

  // Notice & Quick Actions
  document.getElementById('role-notice-banner').textContent = cfg.notice;
  const qaGrid = document.getElementById('quick-actions-grid');
  qaGrid.innerHTML = '';
  cfg.quickActions.forEach((qa) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-action-btn';
    btn.innerHTML = `<strong>${qa.title}</strong><span>${qa.desc}</span>`;
    btn.addEventListener('click', () => {
      if (qa.target === 'users' && role !== 'User') {
        state.activeTab = 'users';
        renderWorkspace();
      } else {
        alert(`Triggered workflow shortcut: ${qa.title}`);
      }
    });
    qaGrid.appendChild(btn);
  });
}

// ==================== USER TABLE & ROLE-GATED ACTIONS ====================
document.getElementById('user-search').addEventListener('input', renderUserTable);

function renderUserTable() {
  const query = document.getElementById('user-search').value.trim().toLowerCase();
  const tbody = document.getElementById('user-directory-body');
  const currentRole = state.currentUser.role;

  document.getElementById('privilege-indicator').textContent =
    currentRole === 'Superadmin'
      ? 'Superadmin: Full Block + 36-Rights Edit'
      : 'Admin: Standard Block/Unblock + View Rights';

  tbody.innerHTML = '';
  state.users
    .filter((u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
    .forEach((user) => {
      const tr = document.createElement('tr');
      if (user.status === 'Blocked') tr.classList.add('row-blocked');

      const canModifyTarget =
        currentRole === 'Superadmin' || (currentRole === 'Admin' && user.role !== 'Superadmin');

      const isBlocked = user.status === 'Blocked';
      const toggleLabel = isBlocked ? 'Unblock' : 'Block';
      const toggleClass = isBlocked ? 'btn-success' : 'btn-danger';

      tr.innerHTML = `
        <td><strong>${user.name}</strong></td>
        <td>${user.email}</td>
        <td><span class="role-pill ${user.role.toLowerCase()}">${user.role}</span></td>
        <td><span class="status-badge ${user.status.toLowerCase()}">${user.status}</span></td>
        <td><strong>${user.rights.length}</strong> / 36 rights</td>
        <td class="action-cell">
          <button type="button" class="btn btn-sm btn-primary edit-rights-btn" data-id="${user.id}" ${!canModifyTarget ? 'disabled' : ''}>
            Edit Rights
          </button>
          <button type="button" class="btn btn-sm ${toggleClass} toggle-status-btn" data-id="${user.id}" ${!canModifyTarget || user.role === 'Superadmin' ? 'disabled' : ''}>
            ${toggleLabel}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });

  document.querySelectorAll('.toggle-status-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const target = state.users.find((u) => u.id === id);
      if (!target) return;
      target.status = target.status === 'Active' ? 'Blocked' : 'Active';
      showToast(`Updated ${target.name} status to ${target.status}.`);
      renderUserTable();
    });
  });

  document.querySelectorAll('.edit-rights-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openRightsModal(Number(btn.dataset.id));
    });
  });
}

function showToast(msg) {
  const toast = document.getElementById('toast-banner');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ==================== 36-RIGHTS PERMISSIONS MODAL ====================
const rightsModal = document.getElementById('rights-modal');
const rightsContainer = document.getElementById('rights-modules-container');

function openRightsModal(userId) {
  const user = state.users.find((u) => u.id === userId);
  if (!user) return;
  state.editingUserId = userId;

  document.getElementById('modal-subtitle').textContent = `Target User: ${user.name} (${user.role} — ${user.email})`;
  rightsContainer.innerHTML = '';

  RIGHTS_MODULES.forEach((mod) => {
    const box = document.createElement('div');
    box.className = 'module-box';
    const itemsHtml = mod.rights
      .map((rightKey) => {
        const checked = user.rights.includes(rightKey) ? 'checked' : '';
        return `
          <label class="right-item">
            <input type="checkbox" class="right-checkbox" value="${rightKey}" ${checked} />
            <span>${rightKey}</span>
          </label>
        `;
      })
      .join('');

    box.innerHTML = `<h4>${mod.name}</h4><div class="rights-list">${itemsHtml}</div>`;
    rightsContainer.appendChild(box);
  });

  rightsContainer.querySelectorAll('.right-checkbox').forEach((cb) => {
    cb.addEventListener('change', updateRightsCounter);
  });

  updateRightsCounter();
  rightsModal.classList.remove('hidden');
}

function updateRightsCounter() {
  const checkedCount = rightsContainer.querySelectorAll('.right-checkbox:checked').length;
  document.getElementById('selected-rights-count').textContent = checkedCount;
}

document.getElementById('select-all-rights').addEventListener('click', () => {
  rightsContainer.querySelectorAll('.right-checkbox').forEach((cb) => {
    cb.checked = true;
  });
  updateRightsCounter();
});

document.getElementById('select-none-rights').addEventListener('click', () => {
  rightsContainer.querySelectorAll('.right-checkbox').forEach((cb) => {
    cb.checked = false;
  });
  updateRightsCounter();
});

function closeRightsModal() {
  rightsModal.classList.add('hidden');
  state.editingUserId = null;
}

document.getElementById('close-modal-x').addEventListener('click', closeRightsModal);
document.getElementById('cancel-rights-btn').addEventListener('click', closeRightsModal);

document.getElementById('save-rights-btn').addEventListener('click', () => {
  const user = state.users.find((u) => u.id === state.editingUserId);
  if (!user) return;
  const selected = Array.from(rightsContainer.querySelectorAll('.right-checkbox:checked')).map(
    (cb) => cb.value
  );
  user.rights = selected;
  closeRightsModal();
  renderUserTable();
  showToast(`Saved ${selected.length}/36 permissions for ${user.name}.`);
});