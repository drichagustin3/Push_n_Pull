class CustomerValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'validation_error'; }
}
function validateCustomerQuery(query) {
  if (Object.keys(query).some((key) => !['search', 'status'].includes(key))) {
    throw new CustomerValidationError('Only search and status query parameters are supported.');
  }
  const search = query.search ?? '';
  const status = query.status ?? 'active';
  if (typeof search !== 'string' || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search)) {
    throw new CustomerValidationError('Search must be text of at most 100 characters without control characters.');
  }
  if (typeof status !== 'string' || !['active', 'inactive', 'all'].includes(status)) {
    throw new CustomerValidationError('Status must be active, inactive, or all.');
  }
  return { search: search.trim(), status };
}
module.exports = { CustomerValidationError, validateCustomerQuery };

const PAYMENT_TERMS = { COD: 'COD', 'Net 15': '15D', 'Net 30': '30D', 'Net 45': '45D', Prepaid: 'PRE' };
function customerNumber(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 5 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new CustomerValidationError('Customer number is required and must be at most 5 characters without control characters.');
  }
  return value.trim();
}
function validateCustomerBody(body, creating) {
  const allowed = creating ? ['custNo', 'custName', 'address', 'payTerms'] : ['custName', 'address', 'payTerms'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new CustomerValidationError('Provide only the supported customer fields; number and system fields cannot be edited.');
  }
  function text(key, max, required) {
    const value = body[key] ?? '';
    if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new CustomerValidationError(`${key} ${required ? 'is required and ' : ''}must be text of at most ${max} characters without control characters.`);
    }
    return value.trim() || null;
  }
  const custName = text('custName', 100, true), address = text('address', 50, false);
  if (typeof body.payTerms !== 'string' || !Object.hasOwn(PAYMENT_TERMS, body.payTerms)) {
    throw new CustomerValidationError('Payment terms must be COD, Net 15, Net 30, Net 45, or Prepaid.');
  }
  return { ...(creating ? { custNo: customerNumber(body.custNo) } : {}), custName, address, payterm: PAYMENT_TERMS[body.payTerms] };
}
module.exports.customerNumber = customerNumber;
module.exports.validateCustomerBody = validateCustomerBody;

function validateCustomerStateBody(body) {
  if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
    throw new CustomerValidationError('Customer state changes do not accept profile, status, stamp, or actor fields.');
  }
}
module.exports.validateCustomerStateBody = validateCustomerStateBody;
