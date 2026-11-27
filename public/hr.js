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

  const ENDPOINTS = Object.freeze({
    employees: "/api/hr/employees",
    jobs: "/api/hr/jobs",
    departments: "/api/hr/departments",
  });

  const SAMPLE_DATA = Object.freeze({
    departments: [
      {
        id: "dept-1",
        deptCode: "DEPT-01",
        deptName: "Human Resources",
        status: "active",
        stamp: "2026-10-12 · Admin",
      },
      {
        id: "dept-2",
        deptCode: "DEPT-02",
        deptName: "Engineering",
        status: "active",
        stamp: "2026-10-15 · Superadmin",
      },
      {
        id: "dept-3",
        deptCode: "DEPT-03",
        deptName: "Finance & Accounting",
        status: "active",
        stamp: "2026-10-18 · Admin",
      },
      {
        id: "dept-4",
        deptCode: "DEPT-04",
        deptName: "Legacy Logistics",
        status: "inactive",
        stamp: "2026-08-04 · Admin",
      },
    ],
    jobs: [
      {
        id: "job-1",
        jobCode: "JOB-101",
        jobDesc: "HR Specialist",
        deptCode: "DEPT-01",
        status: "active",
        stamp: "2026-10-20 · Admin",
      },
      {
        id: "job-2",
        jobCode: "JOB-201",
        jobDesc: "Frontend Engineer",
        deptCode: "DEPT-02",
        status: "active",
        stamp: "2026-10-22 · Superadmin",
      },
      {
        id: "job-3",
        jobCode: "JOB-301",
        jobDesc: "Accounts Analyst",
        deptCode: "DEPT-03",
        status: "active",
        stamp: "2026-10-25 · Admin",
      },
      {
        id: "job-4",
        jobCode: "JOB-199",
        jobDesc: "Dispatch Coordinator",
        deptCode: "DEPT-04",
        status: "inactive",
        stamp: "2026-08-10 · Admin",
      },
    ],
    employees: [
      {
        id: "emp-1",
        empNo: "EMP-001",
        lastName: "Santos",
        firstName: "Camille",
        gender: "Female",
        birthDate: "1996-04-18",
        hireDate: "2024-02-01",
        sepDate: "",
        deptCode: "DEPT-01",
        departmentName: "Human Resources",
        jobCode: "JOB-101",
        jobTitle: "HR Specialist",
        linkedAccount: "camille.santos@hopeinc.local",
        accountRole: "Admin",
        status: "active",
        stamp: "2026-10-21 · Admin",
      },
      {
        id: "emp-2",
        empNo: "EMP-002",
        lastName: "Mendoza",
        firstName: "Rafael",
        gender: "Male",
        birthDate: "1998-09-09",
        hireDate: "2025-01-13",
        sepDate: "",
        deptCode: "DEPT-02",
        departmentName: "Engineering",
        jobCode: "JOB-201",
        jobTitle: "Frontend Engineer",
        linkedAccount: "rafael.mendoza@hopeinc.local",
        accountRole: "User",
        status: "active",
        stamp: "2026-10-23 · Superadmin",
      },
      {
        id: "emp-3",
        empNo: "EMP-003",
        lastName: "Reyes",
        firstName: "Bianca",
        gender: "Female",
        birthDate: "1994-11-27",
        hireDate: "2022-06-15",
        sepDate: "2026-09-02",
        deptCode: "DEPT-03",
        departmentName: "Finance & Accounting",
        jobCode: "JOB-301",
        jobTitle: "Accounts Analyst",
        linkedAccount: "bianca.reyes@hopeinc.local",
        accountRole: "User",
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
    activeTab: TABS.EMPLOYEES,
    searchQuery: "",
    statusFilter: STATUS_FILTERS.ACTIVE,
    departmentFilter: "",
    selectedEmployeeId: null,
    profileOpen: false,
    records: {
      departments: [],
      jobs: [],
      employees: [],
    },
    editingId: null,
    pendingToggle: null,
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
    workspaceSplit: document.querySelector(".hr-workspace-split"),
    tableHead: document.getElementById("hrTableHead"),
    tableBody: document.getElementById("hrTableBody"),

    profilePanel: document.getElementById("hrProfilePanel"),
    profileClose: document.getElementById("hrProfileClose"),
    profileName: document.getElementById("hrProfileName"),
    profileSubtitle: document.getElementById("hrProfileSubtitle"),
    profileStatusBadge: document.getElementById("hrProfileStatusBadge"),
    profileAccountBadge: document.getElementById("hrProfileAccountBadge"),
    profEmpNo: document.getElementById("hrProfEmpNo"),
    profGender: document.getElementById("hrProfGender"),
    profBirthDate: document.getElementById("hrProfBirthDate"),
    profHireDate: document.getElementById("hrProfHireDate"),
    profSepDate: document.getElementById("hrProfSepDate"),
    profDept: document.getElementById("hrProfDept"),
    profJob: document.getElementById("hrProfJob"),
    profAccount: document.getElementById("hrProfAccount"),
    profileStampRow: document.getElementById("hrProfileStampRow"),
    profStamp: document.getElementById("hrProfStamp"),
    profileActions: document.getElementById("hrProfileActions"),
    profileEditBtn: document.getElementById("hrProfileEditBtn"),
    profileToggleBtn: document.getElementById("hrProfileToggleBtn"),

    toast: document.getElementById("hrToast"),

    modalBackdrop: document.getElementById("hrModalBackdrop"),
    modalTitle: document.getElementById("hrModalTitle"),
    modalClose: document.getElementById("hrModalClose"),
    modalCancel: document.getElementById("hrModalCancel"),
    modalForm: document.getElementById("hrModalForm"),
    formFields: document.getElementById("hrFormFields"),
    formError: document.getElementById("hrFormError"),

    confirmBackdrop: document.getElementById("hrConfirmBackdrop"),
    confirmTitle: document.getElementById("hrConfirmTitle"),
    confirmClose: document.getElementById("hrConfirmClose"),
    confirmMessage: document.getElementById("hrConfirmMessage"),
    confirmError: document.getElementById("hrConfirmError"),
    confirmCancel: document.getElementById("hrConfirmCancel"),
    confirmProceed: document.getElementById("hrConfirmProceed"),

    signOutBtn: document.getElementById("signOutBtn"),
  };

  let toastTimer = null;

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

  function showToast(message, isError = false) {
    if (!els.toast) return;
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.toggle("is-error", Boolean(isError));
    els.toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 3200);
  }

  function handleHttpErrorStatus(status, fallbackMsg) {
    if (status === 401) {
      window.location.href = "./login.html";
      throw new Error("Session expired. Redirecting to login...");
    }
    if (status === 403) {
      const msg = "You do not have permission to perform this action.";
      showToast(msg, true);
      throw new Error(msg);
    }
    throw new Error(fallbackMsg || `Request failed (${status})`);
  }

  function normalizeDepartment(item, idx = 0) {
    return {
      ...item,
      id: item.id ?? `dept-${idx + 1}`,
      deptCode: item.deptCode ?? item.code ?? "",
      deptName: item.deptName ?? item.name ?? "",
      status: item.status === "inactive" ? "inactive" : "active",
      stamp: item.stamp || item.updatedAt || formatStamp("System"),
    };
  }

  function normalizeJob(item, idx = 0) {
    return {
      ...item,
      id: item.id ?? `job-${idx + 1}`,
      jobCode: item.jobCode ?? item.code ?? "",
      jobDesc: item.jobDesc ?? item.description ?? item.title ?? "",
      deptCode: item.deptCode ?? item.departmentCode ?? "",
      status: item.status === "inactive" ? "inactive" : "active",
      stamp: item.stamp || item.updatedAt || formatStamp("System"),
    };
  }

  function normalizeEmployee(item, idx = 0) {
    return {
      ...item,
      id: item.id ?? `emp-${idx + 1}`,
      empNo: item.empNo ?? item.code ?? "",
      lastName: item.lastName ?? "",
      firstName: item.firstName ?? "",
      gender: item.gender ?? "",
      birthDate: item.birthDate ?? "",
      hireDate: item.hireDate ?? "",
      sepDate: item.sepDate ?? "",
      deptCode: item.deptCode ?? "",
      departmentName: item.departmentName ?? "",
      jobCode: item.jobCode ?? "",
      jobTitle: item.jobTitle ?? "",
      linkedAccount: item.linkedAccount ?? item.email ?? "Unlinked",
      accountRole: item.accountRole ?? "User",
      status: item.status === "inactive" ? "inactive" : "active",
      stamp: item.stamp || item.updatedAt || formatStamp("System"),
    };
  }

  async function resolveSession() {
    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin" });
      if (res.status === 401) {
        return;
      }
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

  async function fetchCollection(tabKey) {
    const endpoint = ENDPOINTS[tabKey];
    const normalizer =
      tabKey === TABS.DEPARTMENTS
        ? normalizeDepartment
        : tabKey === TABS.JOBS
        ? normalizeJob
        : normalizeEmployee;

    try {
      const res = await fetch(endpoint, { credentials: "same-origin" });
      if (res.status === 401 || res.status === 403) {
        handleHttpErrorStatus(res.status, `Unable to load ${tabKey}.`);
      }
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      const payload = await res.json();
      const rows = Array.isArray(payload) ? payload : payload.data || payload.items || [];
      return rows.map((item, idx) => normalizer(item, idx));
    } catch (err) {
      if (err?.message?.includes("permission")) {
        throw err;
      }
      return SAMPLE_DATA[tabKey].map((item, idx) => normalizer({ ...item }, idx));
    }
  }

  async function loadTabData(tabKey = state.activeTab) {
    state.isLoading = true;
    state.errorMessage = "";
    render();

    try {
      const [departments, jobs, employees] = await Promise.all([
        fetchCollection(TABS.DEPARTMENTS),
        fetchCollection(TABS.JOBS),
        fetchCollection(TABS.EMPLOYEES),
      ]);
      state.records.departments = departments;
      state.records.jobs = jobs;
      state.records.employees = employees;

      if (tabKey === TABS.EMPLOYEES && !state.selectedEmployeeId && employees.length > 0) {
        const firstVisible = isPrivilegedRole(state.session.role)
          ? employees[0]
          : employees.find((e) => e.status === "active");
        if (firstVisible) {
          state.selectedEmployeeId = firstVisible.id;
        }
      }
    } catch (err) {
      state.errorMessage = err?.message || `Unable to load ${tabKey}.`;
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
    const deptCode = state.departmentFilter;

    return getActiveRecords().filter((item) => {
      if (!privileged) {
        if (item.status !== "active") return false;
      } else if (state.statusFilter !== STATUS_FILTERS.ALL) {
        if (item.status !== state.statusFilter) return false;
      }

      if (state.activeTab === TABS.JOBS && deptCode) {
        if (String(item.deptCode || "") !== deptCode) return false;
      }

      if (!query) return true;

      if (state.activeTab === TABS.EMPLOYEES) {
        return [item.empNo, item.firstName, item.lastName]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(query));
      }

      const haystack = [
        item.jobCode,
        item.jobDesc,
        item.deptCode,
        item.deptName,
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
          `<option value="${escapeHtml(dept.deptCode)}">${escapeHtml(dept.deptName)} (${escapeHtml(dept.deptCode)})</option>`
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

    els.addBtn.hidden = !privileged;
    if (state.activeTab === TABS.EMPLOYEES) {
      els.addBtn.textContent = "+ Add Employee";
      els.searchInput.placeholder = "Search by employee ID, first name, or last name...";
    } else if (state.activeTab === TABS.JOBS) {
      els.addBtn.textContent = "+ Add Job";
      els.searchInput.placeholder = "Search by job code or description...";
    } else {
      els.addBtn.textContent = "+ Add Department";
      els.searchInput.placeholder = "Search by department code or name...";
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

  function getSelectedEmployee() {
    if (!state.selectedEmployeeId) return null;
    const found = state.records.employees.find(
      (emp) => String(emp.id) === String(state.selectedEmployeeId)
    );
    if (!found) return null;
    if (!isPrivilegedRole(state.session.role) && found.status !== "active") {
      return null;
    }
    return found;
  }

  function renderEmployeeProfile() {
    const showPanel = state.activeTab === TABS.EMPLOYEES && state.profileOpen;
    const emp = showPanel ? getSelectedEmployee() : null;

    els.profilePanel.hidden = !emp;
    els.workspaceSplit.classList.toggle("has-profile", Boolean(emp));

    if (!emp) return;

    const fullName = `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || "Employee";
    const isInactive = emp.status === "inactive";

    els.profileName.textContent = fullName;
    els.profileSubtitle.textContent = `${emp.jobTitle || emp.jobCode || "Role Unassigned"} · ${
      emp.departmentName || emp.deptCode || "Department Unassigned"
    }`;

    els.profileStatusBadge.textContent = isInactive ? "Inactive" : "Active";
    els.profileStatusBadge.className = isInactive ? "badge badge-inactive" : "badge badge-active";

    els.profileAccountBadge.textContent = `${emp.accountRole || "User"} Account`;

    els.profEmpNo.textContent = emp.empNo || "—";
    els.profGender.textContent = emp.gender || "—";
    els.profBirthDate.textContent = emp.birthDate || "—";
    els.profHireDate.textContent = emp.hireDate || "—";
    els.profSepDate.textContent = emp.sepDate || (isInactive ? "Separated" : "—");
    els.profDept.textContent = emp.departmentName
      ? `${emp.departmentName}${emp.deptCode ? ` (${emp.deptCode})` : ""}`
      : emp.deptCode || "—";
    els.profJob.textContent = emp.jobTitle
      ? `${emp.jobTitle}${emp.jobCode ? ` (${emp.jobCode})` : ""}`
      : emp.jobCode || "—";
    els.profAccount.textContent = `${emp.linkedAccount || "Unlinked"} (${emp.accountRole || "User"})`;

    const privileged = isPrivilegedRole(state.session.role);
    els.profileStampRow.hidden = !privileged;
    els.profStamp.textContent = emp.stamp || "—";

    els.profileActions.hidden = !privileged;
    els.profileToggleBtn.textContent = isInactive ? "Restore" : "Delete";
  }

  function renderTable() {
    const privileged = isPrivilegedRole(state.session.role);
    const rows = getFilteredRecords();

    renderFeedback(rows.length);

    if (state.isLoading || state.errorMessage || rows.length === 0) {
      els.tableHead.innerHTML = "";
      els.tableBody.innerHTML = "";
      renderEmployeeProfile();
      return;
    }

    let headers = [];
    if (state.activeTab === TABS.EMPLOYEES) {
      headers = [
        "empNo",
        "lastName",
        "firstName",
        "gender",
        "birthDate",
        "hireDate",
        "sepDate",
      ];
    } else if (state.activeTab === TABS.JOBS) {
      headers = ["JOB CODE", "DESCRIPTION"];
    } else {
      headers = ["DEPT CODE", "DEPARTMENT NAME"];
    }

    if (privileged) {
      headers.push("STATUS", "STAMP");
    }
    headers.push("ACTIONS");

    els.tableHead.innerHTML = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;

    els.tableBody.innerHTML = rows
      .map((item) => {
        const isInactive = item.status === "inactive";
        const isSelected =
          state.activeTab === TABS.EMPLOYEES &&
          state.profileOpen &&
          String(item.id) === String(state.selectedEmployeeId);

        const classes = [];
        if (isInactive) classes.push("is-inactive");
        if (isSelected) classes.push("is-selected");
        const rowAttr = classes.length ? ` class="${classes.join(" ")}"` : "";

        const badgeClass = isInactive ? "badge badge-inactive" : "badge badge-active";
        const statusLabel = isInactive ? "Inactive" : "Active";

        let cells = "";
        if (state.activeTab === TABS.EMPLOYEES) {
          cells = `
            <td><strong>${escapeHtml(item.empNo)}</strong></td>
            <td>${escapeHtml(item.lastName)}</td>
            <td>${escapeHtml(item.firstName)}</td>
            <td>${escapeHtml(item.gender || "—")}</td>
            <td>${escapeHtml(item.birthDate || "—")}</td>
            <td>${escapeHtml(item.hireDate || "—")}</td>
            <td>${escapeHtml(item.sepDate || "—")}</td>
          `;
        } else if (state.activeTab === TABS.JOBS) {
          cells = `
            <td><strong>${escapeHtml(item.jobCode)}</strong></td>
            <td>${escapeHtml(item.jobDesc)}</td>
          `;
        } else {
          cells = `
            <td><strong>${escapeHtml(item.deptCode)}</strong></td>
            <td>${escapeHtml(item.deptName)}</td>
          `;
        }

        if (privileged) {
          cells += `
            <td><span class="${badgeClass}">${escapeHtml(statusLabel)}</span></td>
            <td class="hr-stamp">${escapeHtml(item.stamp || "—")}</td>
          `;
        }

        if (state.activeTab === TABS.EMPLOYEES) {
          const adminButtons = privileged
            ? `
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
              >${isInactive ? "Restore" : "Delete"}</button>
            `
            : "";

          cells += `
            <td>
              <div class="hr-actions">
                <button
                  type="button"
                  class="hr-btn hr-btn-secondary hr-btn-sm"
                  data-action="profile"
                  data-id="${escapeHtml(item.id)}"
                >Profile</button>
                ${adminButtons}
              </div>
            </td>
          `;
        } else if (privileged) {
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
                >${isInactive ? "Restore" : "Delete"}</button>
              </div>
            </td>
          `;
        } else {
          cells += `
            <td><span class="hr-stamp">Read-only</span></td>
          `;
        }

        return `<tr${rowAttr}>${cells}</tr>`;
      })
      .join("");

    renderEmployeeProfile();
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

    state.editingId = record ? record.id : null;
    els.formError.hidden = true;
    els.formError.textContent = "";

    if (state.activeTab === TABS.DEPARTMENTS) {
      els.modalTitle.textContent = record ? "Edit Department" : "Add Department";
      els.formFields.innerHTML = `
        <div class="hr-field hr-field-full">
          <label for="hrDeptCode">Department Code (deptCode)</label>
          <input id="hrDeptCode" name="deptCode" type="text" required value="${escapeHtml(record?.deptCode || "")}" placeholder="e.g., DEPT-05" />
        </div>
        <div class="hr-field hr-field-full">
          <label for="hrDeptName">Department Name (deptName)</label>
          <input id="hrDeptName" name="deptName" type="text" required value="${escapeHtml(record?.deptName || "")}" placeholder="e.g., Operations" />
        </div>
      `;
    } else if (state.activeTab === TABS.JOBS) {
      els.modalTitle.textContent = record ? "Edit Job" : "Add Job";
      els.formFields.innerHTML = `
        <div class="hr-field hr-field-full">
          <label for="hrJobCode">Job Code (jobCode)</label>
          <input id="hrJobCode" name="jobCode" type="text" required value="${escapeHtml(record?.jobCode || "")}" placeholder="e.g., JOB-401" />
        </div>
        <div class="hr-field hr-field-full">
          <label for="hrJobDesc">Job Description (jobDesc)</label>
          <input id="hrJobDesc" name="jobDesc" type="text" required value="${escapeHtml(record?.jobDesc || "")}" placeholder="e.g., Operations Coordinator" />
        </div>
      `;
    } else {
      els.modalTitle.textContent = record ? "Edit Employee" : "Add Employee";
      const deptOptions = state.records.departments
        .map((d) => {
          const sel = String(d.deptCode) === String(record?.deptCode) ? "selected" : "";
          return `<option value="${escapeHtml(d.deptCode)}" ${sel}>${escapeHtml(d.deptName)} (${escapeHtml(d.deptCode)})</option>`;
        })
        .join("");

      const jobOptions = state.records.jobs
        .map((j) => {
          const sel = String(j.jobCode) === String(record?.jobCode) ? "selected" : "";
          return `<option value="${escapeHtml(j.jobCode)}" ${sel}>${escapeHtml(j.jobDesc)} (${escapeHtml(j.jobCode)})</option>`;
        })
        .join("");

      els.formFields.innerHTML = `
        <div class="hr-field">
          <label for="hrEmpNo">Employee No. (empNo)</label>
          <input id="hrEmpNo" name="empNo" type="text" required value="${escapeHtml(record?.empNo || "")}" placeholder="e.g., EMP-004" />
        </div>
        <div class="hr-field">
          <label for="hrGender">Gender (gender)</label>
          <select id="hrGender" name="gender">
            <option value="">Select gender</option>
            <option value="Female" ${record?.gender === "Female" ? "selected" : ""}>Female</option>
            <option value="Male" ${record?.gender === "Male" ? "selected" : ""}>Male</option>
            <option value="Other" ${record?.gender === "Other" ? "selected" : ""}>Other</option>
          </select>
        </div>
        <div class="hr-field">
          <label for="hrFirstName">First Name (firstName)</label>
          <input id="hrFirstName" name="firstName" type="text" required value="${escapeHtml(record?.firstName || "")}" />
        </div>
        <div class="hr-field">
          <label for="hrLastName">Last Name (lastName)</label>
          <input id="hrLastName" name="lastName" type="text" required value="${escapeHtml(record?.lastName || "")}" />
        </div>
        <div class="hr-field">
          <label for="hrBirthDate">Birth Date (birthDate)</label>
          <input id="hrBirthDate" name="birthDate" type="date" value="${escapeHtml(record?.birthDate || "")}" />
        </div>
        <div class="hr-field">
          <label for="hrHireDate">Hire Date (hireDate)</label>
          <input id="hrHireDate" name="hireDate" type="date" value="${escapeHtml(record?.hireDate || "")}" />
        </div>
        <div class="hr-field">
          <label for="hrSepDate">Separation Date (sepDate)</label>
          <input id="hrSepDate" name="sepDate" type="date" value="${escapeHtml(record?.sepDate || "")}" />
        </div>
        <div class="hr-field">
          <label for="hrEmpDept">Department</label>
          <select id="hrEmpDept" name="deptCode">
            <option value="">Select department</option>
            ${deptOptions}
          </select>
        </div>
        <div class="hr-field">
          <label for="hrEmpJob">Job</label>
          <select id="hrEmpJob" name="jobCode">
            <option value="">Select job</option>
            ${jobOptions}
          </select>
        </div>
        <div class="hr-field">
          <label for="hrLinkedAccount">Linked User Account</label>
          <input id="hrLinkedAccount" name="linkedAccount" type="text" value="${escapeHtml(record?.linkedAccount || "")}" placeholder="user@hopeinc.local" />
        </div>
        <div class="hr-field hr-field-full">
          <label for="hrAccountRole">Account Role</label>
          <select id="hrAccountRole" name="accountRole">
            <option value="User" ${record?.accountRole === "User" ? "selected" : ""}>User</option>
            <option value="Admin" ${record?.accountRole === "Admin" ? "selected" : ""}>Admin</option>
            <option value="Superadmin" ${record?.accountRole === "Superadmin" ? "selected" : ""}>Superadmin</option>
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

  function openConfirmModal(item) {
    if (!isPrivilegedRole(state.session.role) || !item) return;

    const isInactive = item.status === "inactive";
    const nextStatus = isInactive ? "active" : "inactive";
    const actionWord = isInactive ? "restore" : "delete (deactivate)";

    const label =
      state.activeTab === TABS.EMPLOYEES
        ? `${item.empNo} — ${item.firstName} ${item.lastName}`
        : state.activeTab === TABS.JOBS
        ? `${item.jobCode} — ${item.jobDesc}`
        : `${item.deptCode} — ${item.deptName}`;

    state.pendingToggle = {
      tab: state.activeTab,
      id: item.id,
      nextStatus,
    };

    els.confirmTitle.textContent = isInactive ? "Confirm Restore" : "Confirm Delete";
    els.confirmMessage.textContent = `Are you sure you want to ${actionWord} ${label}?`;
    els.confirmError.hidden = true;
    els.confirmError.textContent = "";
    els.confirmBackdrop.hidden = false;
    els.confirmProceed.focus();
  }

  function closeConfirmModal() {
    els.confirmBackdrop.hidden = true;
    state.pendingToggle = null;
    els.confirmError.hidden = true;
    els.confirmError.textContent = "";
  }

  async function apiRequest(method, url, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 401 || res.status === 403) {
        handleHttpErrorStatus(res.status, "Action not authorized.");
      }

      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        throw new Error(errPayload.message || errPayload.error || `Request failed (${res.status})`);
      }

      return await res.json().catch(() => ({ ok: true }));
    } catch (err) {
      if (err instanceof TypeError) {
        return { ...(body || {}), _offlineFallback: true };
      }
      throw err;
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    if (!isPrivilegedRole(state.session.role)) return;

    const formData = new FormData(els.modalForm);
    const list = state.records[state.activeTab];
    const existingIndex = state.editingId
      ? list.findIndex((item) => String(item.id) === String(state.editingId))
      : -1;
    const existingItem = existingIndex >= 0 ? list[existingIndex] : null;
    const isEdit = Boolean(existingItem);
    const baseUrl = ENDPOINTS[state.activeTab];

    try {
      if (state.activeTab === TABS.DEPARTMENTS) {
        const deptCode = String(formData.get("deptCode") || "").trim();
        const deptName = String(formData.get("deptName") || "").trim();
        if (!deptCode || !deptName) {
          els.formError.textContent = "Department code and name are required.";
          els.formError.hidden = false;
          return;
        }

        const payload = {
          id: existingItem?.id || `dept-${Date.now()}`,
          deptCode,
          deptName,
          status: existingItem?.status || "active",
          stamp: formatStamp(state.session.role),
        };

        const saved = isEdit
          ? await apiRequest("PUT", `${baseUrl}/${encodeURIComponent(existingItem.id)}`, payload)
          : await apiRequest("POST", baseUrl, payload);

        const normalized = normalizeDepartment(
          saved?._offlineFallback ? payload : { ...payload, ...saved },
          existingIndex >= 0 ? existingIndex : 0
        );

        if (isEdit) {
          list[existingIndex] = normalized;
        } else {
          list.unshift(normalized);
        }

        closeModal();
        render();
        showToast(isEdit ? "Department updated." : "Department created.");
        return;
      }

      if (state.activeTab === TABS.JOBS) {
        const jobCode = String(formData.get("jobCode") || "").trim();
        const jobDesc = String(formData.get("jobDesc") || "").trim();
        if (!jobCode || !jobDesc) {
          els.formError.textContent = "Job code and description are required.";
          els.formError.hidden = false;
          return;
        }

        const payload = {
          id: existingItem?.id || `job-${Date.now()}`,
          jobCode,
          jobDesc,
          deptCode: existingItem?.deptCode || state.departmentFilter || "",
          status: existingItem?.status || "active",
          stamp: formatStamp(state.session.role),
        };

        const saved = isEdit
          ? await apiRequest("PUT", `${baseUrl}/${encodeURIComponent(existingItem.id)}`, payload)
          : await apiRequest("POST", baseUrl, payload);

        const normalized = normalizeJob(
          saved?._offlineFallback ? payload : { ...payload, ...saved },
          existingIndex >= 0 ? existingIndex : 0
        );

        if (isEdit) {
          list[existingIndex] = normalized;
        } else {
          list.unshift(normalized);
        }

        closeModal();
        render();
        showToast(isEdit ? "Job updated." : "Job created.");
        return;
      }

      if (state.activeTab === TABS.EMPLOYEES) {
        const empNo = String(formData.get("empNo") || "").trim();
        const firstName = String(formData.get("firstName") || "").trim();
        const lastName = String(formData.get("lastName") || "").trim();
        if (!empNo || !firstName || !lastName) {
          els.formError.textContent = "Employee number, first name, and last name are required.";
          els.formError.hidden = false;
          return;
        }

        const deptCode = String(formData.get("deptCode") || "").trim();
        const jobCode = String(formData.get("jobCode") || "").trim();
        const matchedDept = state.records.departments.find((d) => d.deptCode === deptCode);
        const matchedJob = state.records.jobs.find((j) => j.jobCode === jobCode);

        const payload = {
          id: existingItem?.id || `emp-${Date.now()}`,
          empNo,
          firstName,
          lastName,
          gender: String(formData.get("gender") || "").trim(),
          birthDate: String(formData.get("birthDate") || "").trim(),
          hireDate: String(formData.get("hireDate") || "").trim(),
          sepDate: String(formData.get("sepDate") || "").trim(),
          deptCode,
          departmentName: matchedDept?.deptName || existingItem?.departmentName || "",
          jobCode,
          jobTitle: matchedJob?.jobDesc || existingItem?.jobTitle || "",
          linkedAccount: String(formData.get("linkedAccount") || "").trim() || "Unlinked",
          accountRole: String(formData.get("accountRole") || "User"),
          status: existingItem?.status || "active",
          stamp: formatStamp(state.session.role),
        };

        const saved = isEdit
          ? await apiRequest("PUT", `${baseUrl}/${encodeURIComponent(existingItem.id)}`, payload)
          : await apiRequest("POST", baseUrl, payload);

        const normalized = normalizeEmployee(
          saved?._offlineFallback ? payload : { ...payload, ...saved },
          existingIndex >= 0 ? existingIndex : 0
        );

        if (isEdit) {
          list[existingIndex] = normalized;
        } else {
          list.unshift(normalized);
        }

        state.selectedEmployeeId = normalized.id;
        state.profileOpen = true;
        closeModal();
        render();
        showToast(isEdit ? "Employee profile updated." : "Employee added.");
      }
    } catch (err) {
      els.formError.textContent = err?.message || "Unable to save record.";
      els.formError.hidden = false;
    }
  }

  async function handleConfirmProceed() {
    if (!state.pendingToggle || !isPrivilegedRole(state.session.role)) return;

    const { tab, id, nextStatus } = state.pendingToggle;
    const list = state.records[tab];
    const idx = list.findIndex((item) => String(item.id) === String(id));
    if (idx < 0) return;

    const target = list[idx];
    const nextStamp = formatStamp(state.session.role);
    const updatedPayload = {
      ...target,
      status: nextStatus,
      sepDate:
        tab === TABS.EMPLOYEES && nextStatus === "inactive" && !target.sepDate
          ? new Date().toISOString().slice(0, 10)
          : nextStatus === "active"
          ? ""
          : target.sepDate,
      stamp: nextStamp,
    };

    try {
      const endpoint = `${ENDPOINTS[tab]}/${encodeURIComponent(target.id)}`;
      if (nextStatus === "inactive") {
        await apiRequest("DELETE", endpoint, { status: "inactive", stamp: nextStamp });
      } else {
        await apiRequest("PATCH", endpoint, { status: "active", stamp: nextStamp });
      }

      list[idx] = updatedPayload;
      closeConfirmModal();
      render();
      showToast(nextStatus === "inactive" ? "Record deactivated." : "Record restored.");
    } catch (err) {
      els.confirmError.textContent = err?.message || "Unable to update record status.";
      els.confirmError.hidden = false;
    }
  }

  function handleTableAction(event) {
    const btn = event.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const list = getActiveRecords();
    const target = list.find((item) => String(item.id) === String(id));
    if (!target) return;

    if (action === "profile" && state.activeTab === TABS.EMPLOYEES) {
      state.selectedEmployeeId = target.id;
      state.profileOpen = true;
      renderTable();
      return;
    }

    if (!isPrivilegedRole(state.session.role)) return;

    if (action === "edit") {
      openModal(target);
      return;
    }

    if (action === "toggle-status") {
      openConfirmModal(target);
    }
  }

  function bindEvents() {
    els.tabs.forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const nextTab = tabBtn.dataset.tab;
        if (!nextTab || nextTab === state.activeTab) return;
        state.activeTab = nextTab;
        state.departmentFilter = "";
        if (nextTab !== TABS.EMPLOYEES) {
          state.profileOpen = false;
        }
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

    els.confirmClose.addEventListener("click", closeConfirmModal);
    els.confirmCancel.addEventListener("click", closeConfirmModal);
    els.confirmProceed.addEventListener("click", handleConfirmProceed);
    els.confirmBackdrop.addEventListener("click", (event) => {
      if (event.target === els.confirmBackdrop) closeConfirmModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (!els.modalBackdrop.hidden) closeModal();
        if (!els.confirmBackdrop.hidden) closeConfirmModal();
      }
    });

    els.modalForm.addEventListener("submit", handleFormSubmit);
    els.tableBody.addEventListener("click", handleTableAction);

    els.profileClose.addEventListener("click", () => {
      state.profileOpen = false;
      renderTable();
    });

    els.profileEditBtn.addEventListener("click", () => {
      const emp = getSelectedEmployee();
      if (emp) openModal(emp);
    });

    els.profileToggleBtn.addEventListener("click", () => {
      const emp = getSelectedEmployee();
      if (emp) openConfirmModal(emp);
    });

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
    await loadTabData(state.activeTab);
  }

  init();
})();