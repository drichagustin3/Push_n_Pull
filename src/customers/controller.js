const { validateCustomerQuery, validateCustomerBody, customerNumber } = require('./validation');
const { writeCustomer } = require('./mutations');
const { listCustomers } = require('./service');
const customerList = (pool) => async (req, res) => {
  res.json(await listCustomers(pool, req.access, validateCustomerQuery(req.query)));
};
module.exports = { customerList };

const customerCreate = (pool) => async (req, res) => {
  res.status(201).json(await writeCustomer(pool, req.auth, 'customer.add', validateCustomerBody(req.body, true)));
};
const customerEdit = (pool) => async (req, res) => {
  res.json(await writeCustomer(pool, req.auth, 'customer.edit', validateCustomerBody(req.body, false), customerNumber(req.params.custNo)));
};
module.exports.customerCreate = customerCreate;
module.exports.customerEdit = customerEdit;
