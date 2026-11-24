const { Router } = require('express');
const { createAuthorization } = require('../rbac/middleware');
const { AuthError } = require('../auth/service');
const { CustomerValidationError } = require('./validation');
const { customerList } = require('./controller');
function customersRouter(pool, config, sessions) {
  const router = Router();
  const access = createAuthorization(pool, config);
  router.use('/api/customers', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, sessions);
  router.get('/api/customers', access.requireModuleAccess('customer'), customerList(pool));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AuthError || error instanceof CustomerValidationError) {
      return res.status(error.status).json({ error: error.code, message: error.message });
    }
    res.status(503).json({ error: 'customers_unavailable', message: 'Customers could not be loaded. Try again later.' });
  });
  return router;
}
module.exports = { customersRouter };
