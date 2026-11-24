const { ProductValidationError, validateProductCode } = require('./validation');
function effectiveDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new ProductValidationError('Effective date must be a valid YYYY-MM-DD calendar date.');
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new ProductValidationError('Effective date must be a valid YYYY-MM-DD calendar date.');
  return value;
}
function unitPrice(value) {
  // Decimal strings only: never round a JS Number or allow PostgreSQL to round input.
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(value)) throw new ProductValidationError('Unit price must be decimal text greater than 0, up to 99999999.99 with at most two decimals.');
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2,'0'));
  if (cents <= 0n) throw new ProductValidationError('Unit price must be greater than 0.');
  return whole + '.' + fraction.padEnd(2,'0');
}
function priceInput(req, operation) {
  const prodCode = validateProductCode(req.params.prodCode);
  const allowed = operation === 'add' ? ['effDate','unitPrice'] : operation === 'edit' ? ['unitPrice'] : [];
  const body = req.body === undefined ? {} : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || Object.keys(req.query).length) throw new ProductValidationError('Only the supported price fields are allowed; query parameters are not accepted for mutations.');
  return { prodCode, effDate: effectiveDate(operation === 'add' ? body.effDate : req.params.effDate), ...(['add','edit'].includes(operation) ? { unitPrice: unitPrice(body.unitPrice) } : {}) };
}
function priceFilter(query) {
  if (Object.keys(query).some(key => key !== 'status') || (query.status !== undefined && !['active','inactive','all'].includes(query.status))) throw new ProductValidationError('Status must be active, inactive, or all.');
  return query.status ?? 'active';
}
module.exports = { effectiveDate, unitPrice, priceInput, priceFilter };
