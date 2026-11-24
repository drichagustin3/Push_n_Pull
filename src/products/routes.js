const { Router } = require('express');
const { createAuthorization } = require('../rbac/middleware');
const { AuthError } = require('../auth/service');
const { ProductValidationError } = require('./validation');
const { ProductWriteError } = require('./mutations');
const { productList, productCreate, productEdit } = require('./controller');
function productsRouter(pool, config, sessions) {
  const router = Router(), access = createAuthorization(pool, config);
  router.use('/api/products', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, sessions);
  router.get('/api/products', access.requireModuleAccess('product'), productList(pool));
  const writeGuard = (req, res, next) => {
    if (req.get('origin') !== config.origin) return res.status(403).json({ error: 'invalid_origin', message: 'Request origin is not allowed.' });
    if (config.secure && !req.secure) return res.status(400).json({ error: 'https_required', message: 'A secure HTTPS connection is required.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'unsupported_media_type', message: 'Content-Type must be application/json.' });
    next();
  };
  router.post('/api/products', writeGuard, access.requireRight('product.add'), productCreate(pool));
  router.put('/api/products/:prodCode', writeGuard, access.requireRight('product.edit'), productEdit(pool));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof AuthError || error instanceof ProductValidationError || error instanceof ProductWriteError) return res.status(error.status).json({ error: error.code, message: error.message });
    res.status(503).json({ error: 'products_unavailable', message: 'Products could not be loaded. Try again later.' });
  });
  return router;
}
// The app's JSON parser runs before all routers. Handle its errors for this API
// before unrelated authentication routers can turn them into a server failure.
function productBodyError(error, req, res, next) {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'validation_error', message: 'Invalid JSON body.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'validation_error', message: 'Request body is too large.' });
  next(error);
}
module.exports = { productsRouter, productBodyError };
