const { validateProductQuery } = require('./validation');
const { listProducts } = require('./service');
const productList = pool => async (req, res) => res.json(await listProducts(pool, req.access, validateProductQuery(req.query)));
module.exports = { productList };
