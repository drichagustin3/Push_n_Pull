const { decorate } = require('../workspace/view');

function departmentPage() {
  return decorate(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Departments | HOPE ERP</title>
    <link rel="stylesheet" href="/departments.css"><script src="/departments.js" defer></script></head>
    <body><main id="departments">
      <nav aria-label="Human Resources"><a href="/workspace/human_resources/jobs">Jobs</a></nav>
      <header><h1>Departments</h1><button id="departmentAdd" type="button" hidden>Add department</button></header>
      <form id="departmentFilters">
        <label>Search departments <input id="departmentSearch" type="search" maxlength="100"></label>
        <label id="departmentStatusFilter" hidden>Status
          <select id="departmentStatus"><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select>
        </label>
        <button>Search</button>
      </form>
      <p id="departmentFeedback" role="status">Loading departments…</p>
      <div class="department-table"><table id="departmentTable" hidden aria-label="Departments"><thead></thead><tbody></tbody></table></div>
      <dialog id="departmentDialog" aria-labelledby="departmentTitle"><form id="departmentForm">
        <h2 id="departmentTitle"></h2><p id="departmentConfirmation" hidden></p>
        <div id="departmentFields">
          <label>Department code <input name="deptCode" maxlength="3" required></label>
          <label>Department name <input name="deptName" maxlength="20" required></label>
        </div>
        <p id="departmentError" role="alert"></p>
        <button id="departmentSave" type="submit">Save</button>
        <button id="departmentCancel" type="button">Cancel</button>
      </form></dialog>
    </main></body></html>`);
}

module.exports = { departmentPage };
