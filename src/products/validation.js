class ProductValidationError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'validation_error'; }
}
function validateProductQuery(query) {
  if (Object.keys(query).some(key => !['search', 'status'].includes(key))) throw new ProductValidationError('Only search and status query parameters are supported.');
  const search = query.search ?? '', status = query.status ?? 'active';
  if (typeof search !== 'string' || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search)) throw new ProductValidationError('Search must be text of at most 100 characters without control characters.');
  if (typeof status !== 'string' || !['active', 'inactive', 'all'].includes(status)) throw new ProductValidationError('Status must be active, inactive, or all.');
  return { search: search.trim(), status };
}
module.exports = { ProductValidationError, validateProductQuery };
