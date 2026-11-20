const assert = require('node:assert/strict');
const { test } = require('node:test');
const { changeRole, reviewPending, removeUser } = require('../src/users/superadmin-service');
const { blockUser } = require('../src/users/service');
const { requireSuperadmin } = require('../src/users/superadmin-middleware');
const { LAST_SUPERADMIN_MESSAGE } = require('../src/users/superadmin-guard');

const actor = { user_id: '1', email: 'superadmin@example.test', role: 'superadmin', status: 'active', blocked: false, is_deleted: false, session_version: 0 };
const auth = { user: actor, version: 0 };
function backend({ target = actor, currentActor = actor, count = 1, updateFails = false } = {}) {
  const statements = []; let released = false;
  const client = { async query(sql, values) {
    statements.push({ sql, values });
    if (sql.startsWith('SELECT user_id,email')) return { rows: [...new Map([currentActor, target].map((row) => [row.user_id, row])).values()] };
    if (sql.startsWith('SELECT count')) return { rows: [{ count }] };
    if (sql.startsWith('SELECT 1 FROM user_permission')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('UPDATE app_user')) {
      if (updateFails) throw new Error('private database detail');
      return { rows: [{ ...target, first_name: 'Test', last_name: 'Fixture', stamp: 'EDIT actor' }] };
    }
    return { rows: [], rowCount: 0 };
  }, release() { released = true; } };
  return { pool: { connect: async () => client }, statements, released: () => released };
}
test('requireSuperadmin denies absent, User and Admin roles independently of frontend controls', () => {
  for (const role of [undefined, 'user', 'admin']) {
    let status;
    requireSuperadmin({ user: role ? { role } : undefined }, { status(value) { status = value; return this; }, json() {} }, () => assert.fail('must deny'));
    assert.equal(status, 403);
  }
  let called = false; requireSuperadmin({ user: { role: 'superadmin' } }, {}, () => { called = true; }); assert.equal(called, true);
});
test('sole Superadmin role/block/delete guard returns the exact issue #44 error and rolls back', async () => {
  for (const operation of [
    (pool) => changeRole(pool, auth, '1', 'user'), (pool) => blockUser(pool, auth, '1', true), (pool) => removeUser(pool, auth, '1'),
  ]) {
    const tx = backend();
    await assert.rejects(operation(tx.pool), (error) => error.status === 403 && error.message === LAST_SUPERADMIN_MESSAGE);
    assert.equal(tx.statements.some(({ sql }) => sql.startsWith('UPDATE') || sql.startsWith('DELETE')), false);
    assert.equal(tx.statements.at(-1).sql, 'ROLLBACK'); assert.equal(tx.released(), true);
    assert.equal(tx.statements[0].sql, 'BEGIN ISOLATION LEVEL READ COMMITTED');
    assert.match(tx.statements[1].sql, /pg_advisory_xact_lock/);
    assert.match(tx.statements[2].sql, /FOR UPDATE/);
  }
});
test('two Superadmins permit a removal; session revocation shares the audited transaction', async () => {
  const tx = backend({ count: 2 });
  await blockUser(tx.pool, auth, '1', true);
  assert.deepEqual(tx.statements.find(({ sql }) => sql.includes('set_config')).values, [actor.email]);
  assert.deepEqual(tx.statements.find(({ sql }) => sql.startsWith('DELETE FROM auth_session')).values, ['1']);
  assert.equal(tx.statements.at(-1).sql, 'COMMIT');
});
test('Superadmin authority is revalidated after locking; database failure rolls back without consuming authority', async () => {
  const target = { ...actor, user_id: '2', role: 'user' };
  const demoted = backend({ currentActor: { ...actor, role: 'admin' }, target });
  await assert.rejects(changeRole(demoted.pool, auth, '2', 'admin'), (error) => error.status === 403);
  assert.equal(demoted.statements.some(({ sql }) => sql.startsWith('UPDATE')), false);
  const failed = backend({ target, updateFails: true });
  await assert.rejects(changeRole(failed.pool, auth, '2', 'admin'));
  assert.equal(failed.statements.at(-1).sql, 'ROLLBACK'); assert.equal(failed.released(), true);
});
test('approval cannot activate nonpending or blocked targets; role payloads are allowlisted; no-op roles retain sessions', async () => {
  for (const target of [{ ...actor, user_id: '2', role: 'user' }, { ...actor, user_id: '2', role: 'user', status: 'pending', blocked: true }]) {
    const tx = backend({ target });
    await assert.rejects(reviewPending(tx.pool, auth, '2', true), (error) => error.status === 409);
    assert.equal(tx.statements.some(({ sql }) => sql.startsWith('UPDATE')), false);
  }
  for (const role of [undefined, null, 'owner', 'Admin', ['admin']]) assert.throws(() => changeRole({}, auth, '2', role), (error) => error.status === 400);
  const noOp = backend(); await changeRole(noOp.pool, auth, '1', 'superadmin');
  assert.equal(noOp.statements.some(({ sql }) => sql.startsWith('SELECT count') || sql.startsWith('DELETE FROM auth_session')), false);
  assert.equal(noOp.statements.at(-1).sql, 'COMMIT');
});
