const { decorate } = require('../workspace/view');

function jobPage() {
  return decorate(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>Jobs | HOPE ERP</title>
    <link rel="stylesheet" href="/jobs.css"><script src="/jobs.js" defer></script></head>
    <body><main id="jobs">
      <nav aria-label="Human Resources"><a href="/workspace/human_resources">Departments</a></nav>
      <header><h1>Jobs</h1><button id="jobAdd" type="button" hidden>Add job</button></header>
      <form id="jobFilters">
        <label>Search jobs <input id="jobSearch" type="search" maxlength="100"></label>
        <button>Search</button>
      </form>
      <div id="jobStatusFilter" role="group" aria-label="Job status" hidden>
        <button type="button" value="active" aria-pressed="true">Active</button>
        <button type="button" value="inactive" aria-pressed="false">Inactive</button>
        <button type="button" value="all" aria-pressed="false">All</button>
      </div>
      <p id="jobFeedback" role="status">Loading jobs…</p>
      <div class="job-table"><table id="jobTable" hidden aria-label="Jobs"><thead></thead><tbody></tbody></table></div>
      <dialog id="jobDialog" aria-labelledby="jobTitle"><form id="jobForm">
        <h2 id="jobTitle"></h2><p id="jobConfirmation" hidden></p>
        <div id="jobFields">
          <label>Job code <input name="jobCode" maxlength="4" required></label>
          <label>Job description <input name="jobDesc" maxlength="20" required></label>
        </div>
        <p id="jobError" role="alert"></p>
        <button id="jobSave" type="submit">Save</button>
        <button id="jobCancel" type="button">Cancel</button>
      </form></dialog>
    </main></body></html>`);
}

module.exports = { jobPage };
