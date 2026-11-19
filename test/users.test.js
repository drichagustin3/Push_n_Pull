const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateProfile, validateFilters, validateId } = require('../src/users/validation');
const { addUser, editUser, blockUser } = require('../src/users/service');

const profile = { firstName: ' Ana ', lastName: ' Rivera ', email: ' ANA@EXAMPLE.TEST ' };
test('profile validation normalizes values, accepts optional employee links, and preserves temporary password bytes', () => {
  const result = validateProfile(profile);
  assert.deepEqual(result, { firstName: 'Ana', lastName: 'Rivera', email: 'ana@example.test' });
  const password = ' TemporaryPassword123! ';
  assert.equal(validateProfile({ ...profile, empno: '00001', role: 'user', password, confirmPassword: password }, true).password, password);
  assert.equal(validateProfile({ ...profile, empno: null }).empno, null);
});
test('profile validation rejects privilege injection, unsafe identities, weak/mismatched and oversized passwords', () => {
  for (const input of [null, [], {}, { ...profile, firstName: '' }, { ...profile, lastName: 'x'.repeat(101) },
    { ...profile, email: 'bad' }, { ...profile, email: 'a\r\n@example.test' }, { ...profile, firstName: 'x\0y' },
    { ...profile, empno: '123456' }, { ...profile, empno: 1 },
    ...['status', 'blocked', 'is_deleted', 'stamp', 'session_version', 'password_hash', 'setup_token_hash', 'password'].map((key) => ({ ...profile, [key]: 'injected' }))]) assert.throws(() => validateProfile(input));
  for (const role of ['admin', 'superadmin']) {
    assert.equal(validateProfile({ ...profile, role, password: 'StrongPassword123!', confirmPassword: 'StrongPassword123!' }, true).role, role);
    assert.throws(() => validateProfile({ ...profile, role }), (error) => error.status === 403);
  }
  for (const role of ['owner', 'Admin', null, ['user']]) assert.throws(() => validateProfile({ ...profile, role }, true));
  for (const password of ['weak', 'a'.repeat(72), 'StrongPass123' + 'é'.repeat(40), 'StrongPass123\0']) assert.throws(() => validateProfile({ ...profile, password, confirmPassword: password }, true));
  assert.throws(() => validateProfile({ ...profile, password: 'StrongPassword123!', confirmPassword: 'different' }, true));
});
test('IDs and filters reject overflow, structured query input, SQL-like ids, and Admin metadata filters', () => {
  assert.equal(validateId('9223372036854775807'), '9223372036854775807');
  for (const id of ['0', '-1', '1 OR 1=1', '1.2', '9223372036854775808', '0001']) assert.throws(() => validateId(id));
  assert.equal(validateFilters({ role: 'superadmin', deleted: 'true', page: '2' }, true).page, 2);
  for (const query of [{ deleted: 'all' }, { role: 'superadmin' }, { search: ['a', 'b'] }, { search: { $ne: '' } },
    { blocked: ['true', 'false'] }, { page: '-1' }, { page: '1.5' }, { search: 'x'.repeat(101) }, { status: 'active' }]) assert.throws(() => validateFilters(query, false));
});

function transactionPool(actor, target, { failUpdate = false } = {}) {
  const statements = []; let released = false;
  const client = { async query(sql, values) {
    statements.push({ sql, values });
    if (sql.startsWith('SELECT user_id,email')) return { rows: [actor, target].filter(Boolean) };
    if (sql.startsWith('UPDATE app_user')) {
      if (failUpdate) throw new Error('private database detail');
      return { rows: [{ ...target, first_name: 'Ana', last_name: 'Rivera', stamp: 'EDIT actor', empno: null }] };
    }
    return { rows: [] };
  }, release() { released = true; } };
  return { pool: { connect: async () => client }, statements, released: () => released };
}
const actor = { user_id: '1', role: 'admin', email: 'admin@example.test', status: 'active', blocked: false, is_deleted: false, session_version: 0 };
const target = { user_id: '2', role: 'user', email: 'user@example.test', status: 'active', blocked: false, is_deleted: false, session_version: 0 };

test('mutations recheck actor version, role and account eligibility under transaction locks', async () => {
  for (const change of [{ session_version: 1 }, { role: 'user' }, { blocked: true }, { status: 'pending' }, { is_deleted: true }]) {
    const tx = transactionPool({ ...actor, ...change }, target);
    await assert.rejects(editUser(tx.pool, { user: actor, version: 0 }, target.user_id, validateProfile(profile)));
    assert.equal(tx.statements.some(({ sql }) => sql.startsWith('UPDATE')), false);
    assert.equal(tx.statements.at(-1).sql, 'ROLLBACK'); assert.equal(tx.released(), true);
  }
});
test('mutations recheck target hierarchy/deletion and rollback SQL failures', async () => {
  for (const change of [{ role: 'admin' }, { role: 'superadmin' }, { is_deleted: true }]) {
    const tx = transactionPool(actor, { ...target, ...change });
    await assert.rejects(editUser(tx.pool, { user: actor, version: 0 }, target.user_id, validateProfile(profile)), (error) => error.status === 404);
    assert.equal(tx.statements.some(({ sql }) => sql.startsWith('UPDATE')), false);
    assert.equal(tx.statements.at(-1).sql, 'ROLLBACK');
  }
  const tx = transactionPool(actor, target, { failUpdate: true });
  await assert.rejects(editUser(tx.pool, { user: actor, version: 0 }, target.user_id, validateProfile(profile)));
  assert.equal(tx.statements.at(-1).sql, 'ROLLBACK'); assert.equal(tx.released(), true);
});
test('blocking commits audit identity and session deletion together; returned Admin profile excludes metadata/secrets', async () => {
  const tx = transactionPool(actor, { ...target, password_hash: 'private', setup_token_hash: 'private', session_version: 8 });
  const result = await blockUser(tx.pool, { user: actor, version: 0 }, target.user_id, true);
  assert.deepEqual(tx.statements.find(({ sql }) => sql.includes('set_config')).values, [actor.email]);
  assert.deepEqual(tx.statements.find(({ sql }) => sql.startsWith('DELETE FROM auth_session')).values, ['2']);
  assert.equal(tx.statements.at(-1).sql, 'COMMIT'); assert.equal(tx.released(), true);
  for (const key of ['password_hash', 'setup_token_hash', 'session_version', 'status', 'stamp', 'is_deleted']) assert.equal(Object.hasOwn(result, key), false);
});
test('elevated creation requires a Superadmin both before hashing and under the transaction lock', async () => {
  const data = { ...validateProfile(profile), role: 'admin', password: 'StrongPassword123!' };
  const denied = transactionPool(actor, null);
  await assert.rejects(addUser(denied.pool, { user: actor, version: 0 }, data), (error) => error.status === 403);
  assert.equal(denied.statements.length, 0);
  const privileged = { ...actor, role: 'superadmin' };
  const demoted = transactionPool(actor, null);
  await assert.rejects(addUser(demoted.pool, { user: privileged, version: 0 }, data), (error) => error.status === 403);
  assert.equal(demoted.statements.some(({ sql }) => sql.startsWith('INSERT')), false);
  assert.equal(demoted.statements.at(-1).sql, 'ROLLBACK');
});
