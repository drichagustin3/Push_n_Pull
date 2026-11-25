const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProductBody, validateProductCode, PRODUCT_UNITS } = require('../src/products/validation');
const { productPage } = require('../src/products/view');
test('product profile validation accepts issue units and exact 100 character descriptions without translation', () => {
  for (const unit of PRODUCT_UNITS) assert.deepEqual(validateProductBody({ prodCode: 'P-001', description: 'x'.repeat(100), unit }), { prodCode: 'P-001', description: 'x'.repeat(100), unit });
});
test('product validation rejects forbidden fields, injection codes, missing values, oversized descriptions and unknown units', () => {
  const good = { prodCode: 'P-001', description: 'Pump', unit: 'pcs' };
  for (const body of [null, [], {}, { ...good, description: '' }, { ...good, description: 'x'.repeat(101) }, { ...good, description: 'a\nb' }, { ...good, unit: 'unknown' }, { ...good, stamp: 'spoof' }, { ...good, currentPrice: '1.00' }, { ...good, status: 'active' }, { ...good, prodCode: "' OR 1" }]) assert.throws(() => validateProductBody(body));
  assert.throws(() => validateProductBody(good, true));
  assert.throws(() => validateProductCode('../bad'));
});
test('product form exposes accessible immutable-code editor and required field constraints', () => {
  const html = productPage();
  for (const part of ['product-editor.js','productEditorTitle','maxlength="100"','maxlength="6"','value="meter"','role="alert"','productNotice']) assert.ok(html.includes(part));
});
