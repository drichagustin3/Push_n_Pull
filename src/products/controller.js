const { validateProductQuery, validateProductBody, validateProductCode } = require('./validation');
const { listProducts } = require('./service');
const { writeProduct } = require('./mutations');
const productList = pool => async (req, res) => res.json(await listProducts(pool, req.access, validateProductQuery(req.query)));
const productCreate = pool => async (req, res) => res.status(201).json(await writeProduct(pool, req.auth, 'product.add', validateProductBody(req.body)));
const productEdit = pool => async (req, res) => res.json(await writeProduct(pool, req.auth, 'product.edit', validateProductBody(req.body, true), validateProductCode(req.params.prodCode)));
const productTransition = (pool, transition) => async (req, res) => {
  if (Object.keys(req.query).length || (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length))) {
    const { ProductValidationError } = require('./validation');
    throw new ProductValidationError('Product state changes accept no payload fields or query parameters.');
  }
  const result = await writeProduct(pool, req.auth, 'product.delete', {}, validateProductCode(req.params.prodCode), transition);
  res.json({ ...result, message: transition === 'delete' ? 'Product deactivated.' : 'Product restored.' });
};
module.exports = { productList, productCreate, productEdit, productTransition };
