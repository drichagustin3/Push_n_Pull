const { validateProductCode } = require('./validation');
const { priceInput, priceFilter } = require('./price-validation');
const { listPrices, writePrice } = require('./price-service');
const priceList = pool => async(req,res) => res.json(await listPrices(pool,req.access,validateProductCode(req.params.prodCode),priceFilter(req.query)));
const priceWrite = (pool,operation) => async(req,res) => res.status(operation === 'add' ? 201 : 200).json(await writePrice(pool,req.auth,operation,priceInput(req,operation)));
module.exports = { priceList, priceWrite };
