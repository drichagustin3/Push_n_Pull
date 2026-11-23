const { Router } = require('express');
const { createAuthorization } = require('../rbac/middleware');
const { AuthError } = require('../auth/service');
const { CustomerValidationError } = require('./validation');
const { customerList, customerCreate, customerEdit, customerState } = require('./controller');
const { CustomerWriteError } = require('./mutations');
function customersRouter(pool, config, sessions) {
  const router = Router();
  const access = createAuthorization(pool, config);
  router.use('/api/customers', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, sessions);
  router.get('/api/customers', access.requireModuleAccess('customer'), customerList(pool));
  const writeGuard = (req, res, next) => {
    if (req.get('origin') !== config.origin) return res.status(403).json({ error: 'invalid_origin', message: 'Request origin is not allowed.' });
    if (config.secure && !req.secure) return res.status(400).json({ error: 'https_required', message: 'A secure HTTPS connection is required.' });
    const stateRequest = req.method === 'DELETE' || req.path.endsWith('/restore');
    const hasBody = req.get('transfer-encoding') || Number(req.get('content-length') || 0) > 0;
    if (!(stateRequest && !hasBody) && !req.is('application/json')) return res.status(415).json({ error: 'unsupported_media_type', message: 'Content-Type must be application/json.' });
    next();
  };
  router.post('/api/customers', writeGuard, access.requireRight('customer.add'), customerCreate(pool));
  router.delete('/api/customers/:custNo', writeGuard, access.requireRight('customer.delete'), customerState(pool, false));
  router.put('/api/customers/:custNo/restore', writeGuard, access.requireRole('admin', 'superadmin'), customerState(pool, true));
  router.put('/api/customers/:custNo', writeGuard, access.requireRight('customer.edit'), customerEdit(pool));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof URIError && error.status === 400) return res.status(400).json({ error: 'validation_error', message: 'Customer number is malformed.' });
    if (error instanceof AuthError || error instanceof CustomerValidationError || error instanceof CustomerWriteError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    res.status(503).json({ error: 'customers_unavailable', message: 'Customers could not be loaded. Try again later.' });
  });
  return router;
}
module.exports = { customersRouter };
