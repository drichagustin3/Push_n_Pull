const { Router } = require('express');
const { createAuthorization } = require('../rbac/middleware');
const { AuthError } = require('../auth/service');
const { ProductValidationError } = require('./validation');
const { productList } = require('./controller');
function productsRouter(pool, config, sessions) {
  const router = Router(), access = createAuthorization(pool, config);
  router.use('/api/products', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, sessions);
  router.get('/api/products', access.requireModuleAccess('product'), productList(pool));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AuthError || error instanceof ProductValidationError) return res.status(error.status).json({ error: error.code, message: error.message });
    res.status(503).json({ error: 'products_unavailable', message: 'Products could not be loaded. Try again later.' });
  });
  return router;
}
module.exports = { productsRouter };
