const { Router } = require('express');
const { AuthError } = require('../auth/service');
const { createAuthorization } = require('../rbac/middleware');
const { MODULES, navigation } = require('../rbac/service');
const { readMetrics, MetricsDependencyError } = require('./metrics');
const { page } = require('./view');
const { customerPage } = require('../customers/view');
const { productPage } = require('../products/view');

function workspaceRouter(pool, config, sessions) {
  const router = Router();
  const access = createAuthorization(pool, config);
  router.use(['/workspace', '/api/navigation', '/api/me/navigation', '/api/dashboard'], (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
    next();
  }, sessions);
  router.get(['/api/navigation', '/api/me/navigation'], access.requireAccess, (req, res) => res.json(navigation(req.access)));
  router.get('/api/dashboard/metrics', access.requireAccess, async (req, res) => res.json(await readMetrics(pool, req.access)));
  router.get('/workspace', access.requireAccess, (req, res) => res.send(page('Main page', true)));
  for (const [code, label] of Object.entries(MODULES)) router.get('/workspace/' + code, access.requireModuleAccess(code), (req, res) => res.send(code === 'customer' ? customerPage() : code === 'product' ? productPage() : page(label)));
  router.get('/workspace/settings', access.requireRole('superadmin'), (req, res) => res.send(page('System Settings')));
  router.get('/workspace/audit', access.requireRole('superadmin'), (req, res) => res.send(page('Audit Log')));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AuthError || error instanceof MetricsDependencyError) {
      if (req.path.startsWith('/workspace') && req.accepts(['html', 'json']) === 'html') {
        if (error.code === 'unauthenticated') return res.redirect('/login?terminated=1');
        return res.status(error.status).send(page('Access unavailable'));
      }
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    res.status(503).json({ error: 'workspace_unavailable', message: 'Workspace access is temporarily unavailable. Try again later.' });
  });
  return router;
}
module.exports = { workspaceRouter };
