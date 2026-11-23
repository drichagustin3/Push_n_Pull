const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateCustomerBody, customerNumber } = require('../src/customers/validation');
const { writeCustomer } = require('../src/customers/mutations');
const input = { custNo: 'N0001', custName: 'Sample', address: 'Sample City', payTerms: 'Net 30' };
test('customer write validation maps approved payment labels and actual lengths without system field injection', () => {
  assert.deepEqual(validateCustomerBody(input, true), { custNo: 'N0001', custName: 'Sample', address: 'Sample City', payterm: '30D' });
  assert.equal(validateCustomerBody({ ...input, payTerms: 'Net 45' }, true).payterm, '45D');
  assert.equal(validateCustomerBody({ ...input, payTerms: 'Net 15', custName: 'x'.repeat(100) }, true).payterm, '15D');
  assert.equal(validateCustomerBody({ ...input, payTerms: 'Prepaid' }, true).payterm, 'PRE');
  assert.equal(validateCustomerBody({ ...input, address: '', payTerms: 'COD' }, true).address, null);
  for (const body of [null, [], {}, { ...input, custName: 'x'.repeat(101) }, { ...input, address: 'x'.repeat(51) },
    { ...input, custNo: '123456' }, { ...input, custName: ' ' }, { ...input, address: [] },
    { ...input, payTerms: 'Unknown' }, { ...input, stamp: 'spoof' },
    { ...input, status: 'active' }, { ...input, is_deleted: true }, { ...input, custName: 'a\0b' }]) {
    assert.throws(() => validateCustomerBody(body, true), (e) => e.status === 400);
  }
  assert.throws(() => validateCustomerBody(input, false), /cannot be edited/);
  assert.throws(() => customerNumber('\0'), (e) => e.status === 400);
});
function backend(fault) {
  const calls = [], state = { release: 0, actor: { user_id: '7', email: 'fixture@example.test', role: 'user', status: 'active', blocked: false, is_deleted: false, session_version: 0 } };
  const client = { release() { ++state.release; }, async query(sql, args = []) {
    calls.push({ sql, args });
    if (fault?.(sql)) throw Object.assign(new Error('private password SQL detail'), { code: fault.code });
    if (sql.includes('FROM public.app_user')) return { rows: [state.actor] };
    if (sql.includes('FROM public.role')) return { rows: [{ role_code: 'user' }] };
    if (sql.includes('FROM public.rights_catalogue') || sql.includes('FROM public.user_permission')) return { rows: [{ right_code: 'customer.add' }] };
    if (sql.includes('FROM information_schema.columns')) return { rows: [{ column_name: 'custname', data_type: 'character varying', max: 100 }, { column_name: 'stamp', data_type: 'text', max: null }] };
    if (sql.includes('FROM pg_trigger')) return { rows: [
      { tgname: 'customer_biu_stamp', nspname: 'public', proname: 'trg_set_stamp', tgtype: 23, tgnargs: 0, unconditional: true },
      { tgname: 'customer_aiu_audit', nspname: 'public', proname: 'trg_audit_log', tgtype: 21, tgnargs: 1, args: '637573746e6f00', unconditional: true },
    ] };
    if (sql.startsWith('INSERT INTO public.customer')) return { rows: [{ custno: 'N0001', custname: 'Sample', address: null, payterm: 'COD', is_deleted: false, stamp: 'CREATED fixture@example.test 2026-11-23 09:00 AM' }] };
    return { rows: [] };
  } };
  return { pool: { connect: async () => client }, calls, state };
}
test('write context is transaction-local on the mutation client; responses omit User metadata and release the connection', async () => {
  const { pool, calls, state } = backend();
  const result = await writeCustomer(pool, { user: { user_id: '7' }, version: 0 }, 'customer.add', validateCustomerBody(input, true));
  assert.equal(Object.hasOwn(result.customer, 'stamp'), false);
  assert.deepEqual(calls.find(c => c.sql.includes('set_config')).args, ['fixture@example.test']);
  assert.equal(calls.at(-1).sql, 'COMMIT'); assert.equal(state.release, 1);
  assert.ok(calls.findIndex(c => c.sql.includes('set_config')) < calls.findIndex(c => c.sql.startsWith('INSERT')));
  assert.equal(calls.some(c => c.sql.includes('INSERT INTO public.audit_log')), false, 'Audit trigger is the sole writer');
});
test('database errors rollback without raw diagnostics; duplicate PK is 409 and other failures 503', async () => {
  for (const code of ['23505', '22001', 'XX000']) {
    const fault = sql => sql.startsWith('INSERT INTO public.customer'); fault.code = code;
    const { pool, calls, state } = backend(fault);
    await assert.rejects(writeCustomer(pool, { user: { user_id: '7' }, version: 0 }, 'customer.add', validateCustomerBody(input, true)), e => e.status === (code === '23505' ? 409 : 503) && !/private|password|SQL/.test(e.message));
    assert.equal(calls.at(-1).sql, 'ROLLBACK'); assert.equal(state.release, 1);
  }
});
test('stale or blocked actors fail under lock before database mutation', async () => {
  for (const patch of [{ session_version: 1 }, { blocked: true }, { status: 'pending' }]) {
    const { pool, calls, state } = backend(); Object.assign(state.actor, patch);
    await assert.rejects(writeCustomer(pool, { user: { user_id: '7' }, version: 0 }, 'customer.add', validateCustomerBody(input, true)));
    assert.equal(calls.some(c => c.sql.startsWith('INSERT')), false); assert.equal(calls.at(-1).sql, 'ROLLBACK');
  }
});
