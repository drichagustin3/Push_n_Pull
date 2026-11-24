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

// Exact stored values: legacy catalogue plus Issue #76 examples; no unit translation.
const PRODUCT_UNITS = Object.freeze(['pc', 'ea', 'mtr', 'pkg', 'ltr', 'pcs', 'can', 'pair', 'meter']);
function validateProductCode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,5}$/.test(value)) throw new ProductValidationError('Product code must contain 1–6 letters, digits or hyphens, starting with a letter or digit.');
  return value;
}
function validateProductBody(body, editing = false) {
  const fields = editing ? ['description', 'unit'] : ['prodCode', 'description', 'unit'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !fields.includes(key))) throw new ProductValidationError('Only the supported product profile fields are allowed.');
  if (typeof body.description !== 'string' || !body.description.trim() || body.description.trim().length > 100 || /[\u0000-\u001f\u007f]/.test(body.description)) throw new ProductValidationError('Description is required, up to 100 characters without control characters.');
  if (!PRODUCT_UNITS.includes(body.unit)) throw new ProductValidationError('Select a supported packaging unit.');
  return { ...(!editing ? { prodCode: validateProductCode(body.prodCode) } : {}), description: body.description.trim(), unit: body.unit };
}
module.exports = { ProductValidationError, validateProductQuery, PRODUCT_UNITS, validateProductCode, validateProductBody };
