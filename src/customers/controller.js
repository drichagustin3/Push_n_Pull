const { validateCustomerQuery } = require('./validation');
const { listCustomers } = require('./service');
const customerList = (pool) => async (req, res) => {
  res.json(await listCustomers(pool, req.access, validateCustomerQuery(req.query)));
};
module.exports = { customerList };
