const { validateProductQuery, validateProductBody, validateProductCode } = require('./validation');
const { listProducts } = require('./service');
const { writeProduct } = require('./mutations');
const productList = pool => async (req, res) => res.json(await listProducts(pool, req.access, validateProductQuery(req.query)));
const productCreate = pool => async (req, res) => res.status(201).json(await writeProduct(pool, req.auth, 'product.add', validateProductBody(req.body)));
const productEdit = pool => async (req, res) => res.json(await writeProduct(pool, req.auth, 'product.edit', validateProductBody(req.body, true), validateProductCode(req.params.prodCode)));
module.exports = { productList, productCreate, productEdit };
