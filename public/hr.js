(() => {
  const ROLES = Object.freeze({
    SUPERADMIN: "Superadmin",
    ADMIN: "Admin",
    USER: "User",
  });

  const TABS = Object.freeze({
    EMPLOYEES: "employees",
    JOBS: "jobs",
    DEPARTMENTS: "departments",
  });

  const STATUS_FILTERS = Object.freeze({
    ACTIVE: "active",
    INACTIVE: "inactive",
    ALL: "all",
  });

  const SAMPLE_DATA = Object.freeze({
    departments: [
      {
        id: "dept-1",
        code: "DEPT-01",
        name: "Human Resources",
        description: "Talent acquisition, employee relations, and HR operations",
        status: "active",
        stamp: "2026-10-12 · Admin",
      },
      {
        id: "dept-2",
        code: "DEPT-02",
        name: "Engineering",
        description: "Software engineering, platform reliability, and QA",
        status: "active",
        stamp: "2026-10-15 · Superadmin",
      },
      {
        id: "dept-3",
        code: "DEPT-03",
        name: "Finance & Accounting",
        description: "Billing, payables, ledger controls, and payroll",
        status: "active",
        stamp: "2026-10-18 · Admin",
      },
      {
        id: "dept-4",
        code: "DEPT-04",
        name: "Legacy Logistics",
        description: "Retired regional dispatch unit",
        status: "inactive",
        stamp: "2026-08-04 · Admin",
      },
    ],
    jobs: [
      {
        id: "job-1",
        code: "JOB-101",
        title: "HR Specialist",
        departmentId: "dept-1",
        departmentName: "Human Resources",
        payRange: "₱32,000 – ₱42,000 / mo",
        status: "active",
        stamp: "2026-10-20 · Admin",
      },
      {
        id: "job-2",
        code: "JOB-201",
        title: "Frontend Engineer",
        departmentId: "dept-2",
        departmentName: "Engineering",
        payRange: "₱45,000 – ₱65,000 / mo",
        status: "active",
        stamp: "2026-10-22 · Superadmin",
      },
      {
        id: "job-3",
        code: "JOB-301",
        title: "Accounts Analyst",
        departmentId: "dept-3",
        departmentName: "Finance & Accounting",
        payRange: "₱30,000 – ₱40,000 / mo",
        status: "active",
        stamp: "2026-10-25 · Admin",
      },
      {
        id: "job-4",
        code: "JOB-199",
        title: "Dispatch Coordinator",
        departmentId: "dept-4",
        departmentName: "Legacy Logistics",
        payRange: "₱24,000 – ₱29,000 / mo",
        status: "inactive",
        stamp: "2026-08-10 · Admin",
      },
    ],
    employees: [
      {
        id: "emp-1",
        code: "EMP-001",
        name: "Camille Santos",
        departmentName: "Human Resources",
        jobTitle: "HR Specialist",
        status: "active",
        stamp: "2026-10-21 · Admin",
      },
      {
        id: "emp-2",
        code: "EMP-002",
        name: "Rafael Mendoza",
        departmentName: "Engineering",
        jobTitle: "Frontend Engineer",
        status: "active",
        stamp: "2026-10-23 · Superadmin",
      },
      {
        id: "emp-3",
        code: "EMP-003",
        name: "Bianca Reyes",
        departmentName: "Finance & Accounting",
        jobTitle: "Accounts Analyst",
        status: "inactive",
        stamp: "2026-09-02 · Admin",
      },
    ],
  });

  const state = {
    session: {
      userName: "Workspace User",
      role: ROLES.ADMIN,
    },
    activeTab: TABS.DEPARTMENTS,
    searchQuery: "",
    statusFilter: STATUS_FILTERS.ACTIVE,
    departmentFilter: "",
    records: {
      departments: [],
      jobs: [],
      employees: [],
    },
    editingId: null,
    isLoading: false,
    errorMessage: "",
  };

  const els = {
    userName: document.getElementById("hrUserName"),
    roleBadge: document.getElementById("hrRoleBadge"),
    rolePreviewSelect: document.getElementById("rolePreviewSelect"),
    tabs: Array.from(document.querySelectorAll(".hr-tab")),
    addBtn: document.getElementById("hrAddBtn"),
    statusPillsWrap: document.getElementById("hrStatusPills"),
    statusPills: Array.from(document.querySelectorAll(".hr-pill")),
    countActive: document.getElementById("countActive"),
    countInactive: document.getElementById("countInactive"),
    countAll: document.getElementById("countAll"),
    searchInput: document.getElementById("hrSearchInput"),
    deptFilterWrap: document.getElementById("hrDeptFilterWrap"),
    deptFilterSelect: document.getElementById("hrDeptFilter"),
    feedback: document.getElementById("hrFeedback"),
    tableHead: document.getElementById("hrTableHead"),
    tableBody: document.getElementById("hrTableBody"),
    modalBackdrop: document.getElementById("hrModalBackdrop"),
    modalTitle: document.getElementById("hrModalTitle"),
    modalClose: document.getElementById("hrModalClose"),
    modalCancel: document.getElementById("hrModalCancel"),
    modalForm: document.getElementById("hrModalForm"),
    formFields: document.getElementById("hrFormFields"),
    formError: document.getElementById("hrFormError"),
    signOutBtn: document.getElementById("signOutBtn"),
  };

  function isPrivilegedRole(role) {
    return role === ROLES.ADMIN || role === ROLES.SUPERADMIN;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatStamp(actor = state.session.role) {
    const today = new Date().toISOString().slice(0, 10);
    return `${today} · ${actor}`;
  }

  async function resolveSession() {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        const user = data.user || data;
        const normalizedRole = Object.values(ROLES).includes(user.role)
          ? user.role
          : ROLES.USER;
        state.session = {
          userName: user.name || user.username || user.email || "Workspace User",
          role: normalizedRole,
        };
        return;
      }
    } catch {
      // Fallback when endpoint is unavailable in standalone frontend mode
    }

    const storedRole = window.sessionStorage?.getItem("hrRolePreview");
    if (storedRole && Object.values(ROLES).includes(storedRole)) {
      state.session.role = storedRole;
    }
  }

  async function fetchCollection(endpoint, fallbackKey) {
    try {
      const res = await fetch(endpoint, { credentials: "same-origin" });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const payload = await res.json();
      const rows = Array.isArray(payload) ? payload : payload.data || payload.items || [];
      return rows.map((item, idx) => ({
        ...item,
        id: item.id ?? `${fallbackKey}-${idx + 1}`,
        status: item.status === "inactive" ? "inactive" : "active",
        stamp: item.stamp || item.updatedAt || formatStamp("System"),
      }));
    } catch {
      return SAMPLE_DATA[fallbackKey].map((item) => ({ ...item }));
    }
  }

  async function loadAllHrData() {
    state.isLoading = true;
    state.errorMessage = "";
    render();

    try {
      const [departments, jobs, employees] = await Promise.all([
        fetchCollection("/api/hr/departments", "departments"),
        fetchCollection("/api/hr/jobs", "jobs"),
        fetchCollection("/api/hr/employees", "employees"),
      ]);

      state.records.departments = departments;
      state.records.jobs = jobs;
      state.records.employees = employees;
    } catch (err) {
      state.errorMessage = err?.message || "Unable to load HR records.";
    } finally {
      state.isLoading = false;
      render();
    }
  }

  function getActiveRecords() {
    return state.records[state.activeTab] || [];
  }

  function getFilteredRecords() {
    const privileged = isPrivilegedRole(state.session.role);
    const query = state.searchQuery.trim().toLowerCase();
    const deptId = state.departmentFilter;

    return getActiveRecords().filter((item) => {
      if (!privileged) {
        if (item.status !== "active") return false;
      } else if (state.statusFilter !== STATUS_FILTERS.ALL) {
        if (item.status !== state.statusFilter) return false;
      }

      if (state.activeTab === TABS.JOBS && deptId) {
        if (String(item.departmentId) !== String(deptId)) return false;
      }

      if (!query) return true;

      const haystack = [
        item.code,
        item.name,
        item.title,
        item.description,
        item.departmentName,
        item.payRange,
        item.jobTitle,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  function updateStatusCounts() {
    const records = getActiveRecords();
    const activeCount = records.filter((r) => r.status === "active").length;
    const inactiveCount = records.filter((r) => r.status === "inactive").length;

    els.countActive.textContent = String(activeCount);
    els.countInactive.textContent = String(inactiveCount);
    els.countAll.textContent = String(records.length);
  }

  function populateDepartmentFilter() {
    const isJobs = state.activeTab === TABS.JOBS;
    els.deptFilterWrap.hidden = !isJobs;
    if (!isJobs) return;

    const currentValue = state.departmentFilter;
    const options = ['<option value="">All Departments</option>'].concat(
      state.records.departments.map(
        (dept) =>
          `<option value="${escapeHtml(dept.id)}">${escapeHtml(dept.name)} (${escapeHtml(dept.code)})</option>`
      )
    );
    els.deptFilterSelect.innerHTML = options.join("");
    els.deptFilterSelect.value = currentValue;
  }

  function renderRoleAndHeader() {
    const { userName, role } = state.session;
    const privileged = isPrivilegedRole(role);

    els.userName.textContent = userName;
    els.roleBadge.textContent = role;
    els.rolePreviewSelect.value = role;

    els.statusPillsWrap.hidden = !privileged;
    if (privileged) {
      els.statusPills.forEach((pill) => {
        const isSelected = pill.dataset.status === state.statusFilter;
        pill.classList.toggle("is-active", isSelected);
        pill.setAttribute("aria-pressed", String(isSelected));
      });
    }

    const canAdd =
      privileged && (state.activeTab === TABS.DEPARTMENTS || state.activeTab === TABS.JOBS);
    els.addBtn.hidden = !canAdd;
    if (state.activeTab === TABS.DEPARTMENTS) {
      els.addBtn.textContent = "+ Add Department";
    } else if (state.activeTab === TABS.JOBS) {
      els.addBtn.textContent = "+ Add Job";
    }
  }

  function renderTabs() {
    els.tabs.forEach((tabBtn) => {
      const selected = tabBtn.dataset.tab === state.activeTab;
      tabBtn.classList.toggle("is-active", selected);
      tabBtn.setAttribute("aria-selected", String(selected));
    });
  }

  function renderFeedback(filteredCount) {
    if (state.isLoading) {
      els.feedback.hidden = false;
      els.feedback.classList.remove("is-error");
      els.feedback.textContent = `Loading ${state.activeTab}...`;
      return;
    }

    if (state.errorMessage) {
      els.feedback.hidden = false;
      els.feedback.classList.add("is-error");
      els.feedback.textContent = state.errorMessage;
      return;
    }

    if (filteredCount === 0) {
      els.feedback.hidden = false;
      els.feedback.classList.remove("is-error");
      els.feedback.textContent = `No ${state.activeTab} match your current search or filter.`;
      return;
    }

    els.feedback.hidden = true;
    els.feedback.classList.remove("is-error");
    els.feedback.textContent = "";
  }

  function renderTable() {
    const privileged = isPrivilegedRole(state.session.role);
    const rows = getFilteredRecords();

    renderFeedback(rows.length);

    if (state.isLoading || state.errorMessage || rows.length === 0) {
      els.tableHead.innerHTML = "";
      els.tableBody.innerHTML = "";
      return;
    }

    let headers = [];
    if (state.activeTab === TABS.DEPARTMENTS) {
      headers = ["Code", "Department Name", "Description"];
    } else if (state.activeTab === TABS.JOBS) {
      headers = ["Job Code", "Job Title", "Department", "Pay Range"];
    } else {
      headers = ["Employee ID", "Name", "Department", "Job Title"];
    }

    if (privileged) {
      headers.push("Status", "Stamp");
      if (state.activeTab === TABS.DEPARTMENTS || state.activeTab === TABS.JOBS) {
        headers.push("Actions");
      }
    }

    els.tableHead.innerHTML = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;

    els.tableBody.innerHTML = rows
      .map((item) => {
        const isInactive = item.status === "inactive";
        const rowClass = isInactive ? ' class="is-inactive"' : "";
        const badgeClass = isInactive ? "badge badge-inactive" : "badge badge-active";
        const statusLabel = isInactive ? "Inactive" : "Active";

        let cells = "";
        if (state.activeTab === TABS.DEPARTMENTS) {
          cells = `
            <td><strong>${escapeHtml(item.code)}</strong></td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.description || "—")}</td>
          `;
        } else if (state.activeTab === TABS.JOBS) {
          cells = `
            <td><strong>${escapeHtml(item.code)}</strong></td>
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.departmentName || "—")}</td>
            <td>${escapeHtml(item.payRange || "—")}</td>
          `;
        } else {
          cells = `
            <td><strong>${escapeHtml(item.code)}</strong></td>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.departmentName || "—")}</td>
            <td>${escapeHtml(item.jobTitle || "—")}</td>
          `;
        }

        if (privileged) {
          cells += `
            <td><span class="${badgeClass}">${escapeHtml(statusLabel)}</span></td>
            <td class="hr-stamp">${escapeHtml(item.stamp || "—")}</td>
          `;

          if (state.activeTab === TABS.DEPARTMENTS || state.activeTab === TABS.JOBS) {
            const toggleLabel = isInactive ? "Restore" : "Deactivate";
            cells += `
              <td>
                <div class="hr-actions">
                  <button
                    type="button"
                    class="hr-btn hr-btn-secondary hr-btn-sm"
                    data-action="edit"
                    data-id="${escapeHtml(item.id)}"
                  >Edit</button>
                  <button
                    type="button"
                    class="hr-btn hr-btn-danger-outline hr-btn-sm"
                    data-action="toggle-status"
                    data-id="${escapeHtml(item.id)}"
                  >${escapeHtml(toggleLabel)}</button>
                </div>
              </td>
            `;
          }
        }

        return `<tr${rowClass}>${cells}</tr>`;
      })
      .join("");
  }

  function render() {
    renderRoleAndHeader();
    renderTabs();
    updateStatusCounts();
    populateDepartmentFilter();
    renderTable();
  }

  function openModal(record = null) {
    if (!isPrivilegedRole(state.session.role)) return;
    if (state.activeTab !== TABS.DEPARTMENTS && state.activeTab !== TABS.JOBS) return;

    state.editingId = record ? record.id : null;
    els.formError.hidden = true;
    els.formError.textContent = "";

    if (state.activeTab === TABS.DEPARTMENTS) {
      els.modalTitle.textContent = record ? "Edit Department" : "Add Department";
      els.formFields.innerHTML = `
        <div class="hr-field">
          <label for="hrFieldCode">Department Code</label>
          <input id="hrFieldCode" name="code" type="text" required value="${escapeHtml(record?.code || "")}" placeholder="e.g., DEPT-05" />
        </div>
        <div class="hr-field">
          <label for="hrFieldName">Department Name</label>
          <input id="hrFieldName" name="name" type="text" required value="${escapeHtml(record?.name || "")}" placeholder="e.g., Operations" />
        </div>
        <div class="hr-field">
          <label for="hrFieldDescription">Description</label>
          <textarea id="hrFieldDescription" name="description" rows="3" placeholder="Optional scope or notes">${escapeHtml(record?.description || "")}</textarea>
        </div>
        <div class="hr-field">
          <label for="hrFieldStatus">Status</label>
          <select id="hrFieldStatus" name="status">
            <option value="active" ${(record?.status || "active") === "active" ? "selected" : ""}>Active</option>
            <option value="inactive" ${record?.status === "inactive" ? "selected" : ""}>Inactive</option>
          </select>
        </div>
      `;
    } else {
      els.modalTitle.textContent = record ? "Edit Job" : "Add Job";
      const deptOptions = state.records.departments
        .map((dept) => {
          const selected = String(dept.id) === String(record?.departmentId) ? "selected" : "";
          return `<option value="${escapeHtml(dept.id)}" ${selected}>${escapeHtml(dept.name)}</option>`;
        })
        .join("");

      els.formFields.innerHTML = `
        <div class="hr-field">
          <label for="hrFieldCode">Job Code</label>
          <input id="hrFieldCode" name="code" type="text" required value="${escapeHtml(record?.code || "")}" placeholder="e.g., JOB-401" />
        </div>
        <div class="hr-field">
          <label for="hrFieldTitle">Job Title</label>
          <input id="hrFieldTitle" name="title" type="text" required value="${escapeHtml(record?.title || "")}" placeholder="e.g., Operations Coordinator" />
        </div>
        <div class="hr-field">
          <label for="hrFieldDept">Department</label>
          <select id="hrFieldDept" name="departmentId" required>
            <option value="">Select department</option>
            ${deptOptions}
          </select>
        </div>
        <div class="hr-field">
          <label for="hrFieldPay">Pay Range</label>
          <input id="hrFieldPay" name="payRange" type="text" value="${escapeHtml(record?.payRange || "")}" placeholder="e.g., ₱28,000 – ₱36,000 / mo" />
        </div>
        <div class="hr-field">
          <label for="hrFieldStatus">Status</label>
          <select id="hrFieldStatus" name="status">
            <option value="active" ${(record?.status || "active") === "active" ? "selected" : ""}>Active</option>
            <option value="inactive" ${record?.status === "inactive" ? "selected" : ""}>Inactive</option>
          </select>
        </div>
      `;
    }

    els.modalBackdrop.hidden = false;
    const firstInput = els.formFields.querySelector("input, select, textarea");
    firstInput?.focus();
  }

  function closeModal() {
    els.modalBackdrop.hidden = true;
    state.editingId = null;
    els.modalForm.reset();
    els.formError.hidden = true;
    els.formError.textContent = "";
  }

  async function persistRecord(method, url, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.message || `Save failed (${res.status})`);
      }
      return await res.json().catch(() => body);
    } catch (err) {
      if (err instanceof TypeError) {
        return body;
      }
      throw err;
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    if (!isPrivilegedRole(state.session.role)) return;

    const formData = new FormData(els.modalForm);
    const code = String(formData.get("code") || "").trim();
    const status = formData.get("status") === "inactive" ? "inactive" : "active";

    if (!code) {
      els.formError.textContent = "Code is required.";
      els.formError.hidden = false;
      return;
    }

    const list = state.records[state.activeTab];
    const existingIndex = state.editingId
      ? list.findIndex((item) => String(item.id) === String(state.editingId))
      : -1;
    const existingItem = existingIndex >= 0 ? list[existingIndex] : null;

    if (state.activeTab === TABS.DEPARTMENTS) {
      const name = String(formData.get("name") || "").trim();
      const description = String(formData.get("description") || "").trim();
      if (!name) {
        els.formError.textContent = "Department name is required.";
        els.formError.hidden = false;
        return;
      }

      const payload = {
        id: existingItem?.id || `dept-${Date.now()}`,
        code,
        name,
        description,
        status,
        stamp: formatStamp(state.session.role),
      };

      try {
        if (existingItem) {
          await persistRecord("PUT", `/api/hr/departments/${encodeURIComponent(existingItem.id)}`, payload);
          list[existingIndex] = payload;
        } else {
          const created = await persistRecord("POST", "/api/hr/departments", payload);
          list.unshift(created?.id ? created : payload);
        }
        closeModal();
        render();
      } catch (err) {
        els.formError.textContent = err.message || "Could not save department.";
        els.formError.hidden = false;
      }
      return;
    }

    if (state.activeTab === TABS.JOBS) {
      const title = String(formData.get("title") || "").trim();
      const departmentId = String(formData.get("departmentId") || "").trim();
      const payRange = String(formData.get("payRange") || "").trim();

      if (!title || !departmentId) {
        els.formError.textContent = "Job title and department are required.";
        els.formError.hidden = false;
        return;
      }

      const matchedDept = state.records.departments.find(
        (dept) => String(dept.id) === departmentId
      );

      const payload = {
        id: existingItem?.id || `job-${Date.now()}`,
        code,
        title,
        departmentId,
        departmentName: matchedDept?.name || existingItem?.departmentName || "",
        payRange,
        status,
        stamp: formatStamp(state.session.role),
      };

      try {
        if (existingItem) {
          await persistRecord("PUT", `/api/hr/jobs/${encodeURIComponent(existingItem.id)}`, payload);
          list[existingIndex] = payload;
        } else {
          const created = await persistRecord("POST", "/api/hr/jobs", payload);
          list.unshift(created?.id ? created : payload);
        }
        closeModal();
        render();
      } catch (err) {
        els.formError.textContent = err.message || "Could not save job.";
        els.formError.hidden = false;
      }
    }
  }

  async function handleTableAction(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn || !isPrivilegedRole(state.session.role)) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const list = state.records[state.activeTab];
    const target = list.find((item) => String(item.id) === String(id));
    if (!target) return;

    if (action === "edit") {
      openModal(target);
      return;
    }

    if (action === "toggle-status") {
      const nextStatus = target.status === "inactive" ? "active" : "inactive";
      const updated = {
        ...target,
        status: nextStatus,
        stamp: formatStamp(state.session.role),
      };

      const endpointBase =
        state.activeTab === TABS.DEPARTMENTS ? "/api/hr/departments" : "/api/hr/jobs";

      await persistRecord("PATCH", `${endpointBase}/${encodeURIComponent(target.id)}`, {
        status: nextStatus,
        stamp: updated.stamp,
      });

      const idx = list.findIndex((item) => String(item.id) === String(id));
      if (idx >= 0) {
        list[idx] = updated;
      }
      render();
    }
  }

  function bindEvents() {
    els.tabs.forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const nextTab = tabBtn.dataset.tab;
        if (!nextTab || nextTab === state.activeTab) return;
        state.activeTab = nextTab;
        state.departmentFilter = "";
        render();
      });
    });

    els.statusPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        if (!isPrivilegedRole(state.session.role)) return;
        state.statusFilter = pill.dataset.status || STATUS_FILTERS.ACTIVE;
        render();
      });
    });

    let debounceTimer = null;
    els.searchInput.addEventListener("input", (event) => {
      const value = event.target.value;
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        state.searchQuery = value;
        renderTable();
      }, 200);
    });

    els.deptFilterSelect.addEventListener("change", (event) => {
      state.departmentFilter = event.target.value;
      renderTable();
    });

    els.rolePreviewSelect.addEventListener("change", (event) => {
      const nextRole = event.target.value;
      if (!Object.values(ROLES).includes(nextRole)) return;
      state.session.role = nextRole;
      window.sessionStorage?.setItem("hrRolePreview", nextRole);
      if (!isPrivilegedRole(nextRole)) {
        state.statusFilter = STATUS_FILTERS.ACTIVE;
      }
      render();
    });

    els.addBtn.addEventListener("click", () => openModal(null));
    els.modalClose.addEventListener("click", closeModal);
    els.modalCancel.addEventListener("click", closeModal);
    els.modalBackdrop.addEventListener("click", (event) => {
      if (event.target === els.modalBackdrop) closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !els.modalBackdrop.hidden) {
        closeModal();
      }
    });

    els.modalForm.addEventListener("submit", handleFormSubmit);
    els.tableBody.addEventListener("click", handleTableAction);

    els.signOutBtn?.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      } catch {
        // Ignore if endpoint is not present
      }
      window.location.href = "./login.html";
    });
  }

  async function init() {
    bindEvents();
    await resolveSession();
    await loadAllHrData();
  }

  init();
})();