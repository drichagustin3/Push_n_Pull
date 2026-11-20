const opening = `<div class="ws-layout"><aside class="ws-sidebar"><a class="ws-brand" href="/workspace">HOPE, INC. ERP</a><nav id="workspaceNav" aria-label="Workspace modules"></nav><button id="workspaceLogout" type="button">Sign out</button></aside><div class="ws-main"><header class="ws-header"><strong id="workspaceName"></strong><span id="workspaceRole"></span></header><p id="workspaceStatus" role="status" tabindex="-1">Loading workspace…</p>`;
const closing = '</div></div>';
function decorate(html) {
  return html.replace('</head>', '<link rel="stylesheet" href="/workspace.css"><script src="/workspace.js" defer></script></head>')
    .replace('<body>', '<body>' + opening).replace('</body>', closing + '</body>');
}
function page(title = 'Main page', dashboard = false) {
  return decorate(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HOPE ERP Workspace</title></head><body><main><h1>${title}</h1>${dashboard ? '<section id="workspaceMetrics" aria-label="Dashboard metrics"></section><h2>Modules</h2><section id="workspaceTiles" class="ws-tiles"></section>' : '<p>This section is not yet available.</p>'}</main></body></html>`);
}
module.exports = { decorate, page };
