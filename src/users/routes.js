const { Router } = require('express');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { rateLimit } = require('express-rate-limit');
const { requireAuth } = require('../auth/middleware');
const { AuthError } = require('../auth/service');
const { usersController } = require('./controller');
const { UserManagementError } = require('./validation');
const { requireSuperadmin } = require('./superadmin-middleware');
const { superadminController } = require('./superadmin-controller');
const { rightsController } = require('./rights-controller');

const template = readFileSync(path.resolve(__dirname, '../../views/users/index.html'), 'utf8');
function usersRouter(pool, config, sessionMiddleware) {
  const router = Router();
  const controller = usersController(pool);
  const superadmin = superadminController(pool);
  const rights = rightsController(pool);
  const authenticate = requireAuth(pool, config);
  const manager = (req, res, next) => ['admin', 'superadmin'].includes(req.user.role)
    ? next() : res.status(403).json({ error: 'User Management requires an administrator.' });
  const guard = (allowEmpty = false) => (req, res, next) => {
    if (req.get('origin') !== config.origin || (config.secure && !req.secure)) return res.status(403).json({ error: 'Request origin or transport is not allowed.' });
    const empty = allowEmpty && !req.get('content-type') && !req.get('transfer-encoding') && Number(req.get('content-length') || 0) === 0;
    if (!req.is('application/json') && !empty) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    next();
  };
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many account changes. Try again later.' } });
  router.use(['/users', '/api/users'], (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
    next();
  }, sessionMiddleware, authenticate, manager);
  router.get('/users', (req, res) => {
    const superadmin = req.user.role === 'superadmin';
    res.type('html').send(template.replace('<!--METADATA_FILTER-->', superadmin ? '<label>Deleted rows<select name="deleted"><option value="all">All</option><option value="false">Not deleted</option><option value="true">Deleted only</option></select></label>' : '')
      .replace('<!--SUPER_ROLE-->', superadmin ? '<option value="superadmin">Superadmin</option>' : '')
      .replace('<!--CREATE_ROLE-->', '<label>Role<select name="role"><option value="user">User</option>' + (superadmin ? '<option value="admin">Admin</option><option value="superadmin">Superadmin</option>' : '') + '</select></label>'));
  });
  router.get('/api/users', controller.list);
  router.get('/api/users/:id', controller.get);
  router.post('/api/users', guard(), limiter, controller.add);
  router.put('/api/users/:id', guard(), limiter, controller.edit);
  router.put('/api/users/:id/block', guard(true), limiter, controller.toggleBlock);
  router.patch('/api/users/:id/blocked', guard(), limiter, controller.block);
  router.get('/api/users/:id/rights', rights.get);
  router.put('/api/users/:id/rights', guard(), limiter, rights.put);
  router.put('/api/users/:id/approve', requireSuperadmin, guard(true), limiter, superadmin.approve);
  router.put('/api/users/:id/reject', requireSuperadmin, guard(true), limiter, superadmin.reject);
  router.put('/api/users/:id/role', requireSuperadmin, guard(), limiter, superadmin.role);
  router.delete('/api/users/:id', requireSuperadmin, guard(true), limiter, superadmin.remove);
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof UserManagementError || error instanceof AuthError) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'An account already uses that email.' });
    if (['23503', '23514'].includes(error.code)) return res.status(400).json({ error: 'The account data references unavailable or invalid values.' });
    res.status(500).json({ error: 'User Management is temporarily unavailable. Try again later.' });
  });
  return router;
}
module.exports = { usersRouter };
