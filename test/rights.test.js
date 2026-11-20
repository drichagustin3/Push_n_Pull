const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getRights, putRights, validateRights } = require('../src/users/rights-service');

test('rights payload validates exact structure, unique bounded string codes and no injected metadata', () => {
  assert.deepEqual(validateRights({ rightCodes: [] }), []);
  assert.deepEqual(validateRights({ rightCodes: ['customer.add'] }), ['customer.add']);
  for (const body of [null, [], {}, { rightCodes: null }, { rightCodes: 'all' }, { rightCodes: [1] },
    { rightCodes: [''] }, { rightCodes: ['x'.repeat(51)] }, { rightCodes: ['x\0y'] },
    { rightCodes: ['same', 'same'] }, { rightCodes: Array.from({ length: 37 }, (_, n) => String(n)) },
    { rightCodes: [], role: 'superadmin' }, { rightCodes: [], user_id: '1' }]) assert.throws(() => validateRights(body), (error) => error.status === 400);
});

const actor = { user_id: '1', email: 'admin@example.test', role: 'admin', status: 'active', blocked: false, is_deleted: false, session_version: 0 };
const target = { ...actor, user_id: '2', role: 'user' };
function backend({ currentActor = actor, currentTarget = target, catalogue = [] } = {}) {
  const queries = []; let released = false;
  const client = { async query(sql, values) {
    queries.push({ sql, values });
    if (sql.startsWith('SELECT user_id,email')) return { rows: [currentActor, currentTarget] };
    if (sql.startsWith('SELECT m.module_code')) return { rows: catalogue };
    if (sql.startsWith('SELECT right_code')) return { rows: [] };
    return { rows: [] };
  }, release() { released = true; } };
  return { pool: { connect: async () => client }, queries, released: () => released };
}
test('read and update recheck current actor/session and target hierarchy before catalogue exposure', async () => {
  for (const change of [{ currentActor: { ...actor, session_version: 1 } }, { currentActor: { ...actor, role: 'user' } },
    { currentActor: { ...actor, blocked: true } }, { currentTarget: { ...target, role: 'admin' } },
    { currentTarget: { ...target, role: 'superadmin' } }, { currentTarget: { ...target, is_deleted: true } },
    { currentTarget: { ...target, status: 'pending' } }, { currentTarget: { ...target, blocked: true } }]) {
    for (const operation of [(pool) => getRights(pool, { user: actor, version: 0 }, '2'), (pool) => putRights(pool, { user: actor, version: 0 }, '2', [])]) {
      const tx = backend(change); await assert.rejects(operation(tx.pool));
      assert.equal(tx.queries.some(({ sql }) => sql.startsWith('SELECT m.module_code') || sql.startsWith('UPDATE') || sql.startsWith('INSERT')), false);
      assert.equal(tx.queries.at(-1).sql, 'ROLLBACK'); assert.equal(tx.released(), true);
    }
  }
});
test('catalogue discrepancies fail closed with a DBA dependency error, never seeded or silently accepted', async () => {
  const tx = backend();
  await assert.rejects(putRights(tx.pool, { user: actor, version: 0 }, '2', []), (error) => error.status === 503 && error.message.includes('36 active rights'));
  assert.equal(tx.queries.some(({ sql }) => sql.startsWith('UPDATE') || sql.startsWith('INSERT')), false);
  assert.equal(tx.queries.at(-1).sql, 'ROLLBACK'); assert.equal(tx.released(), true);
});
test('empty/no-op assignment commits without changing stamps, permissions or audit records', async () => {
  const counts = { customer: 3, product: 6, human_resources: 13, sales: 7, reports: 7 };
  const catalogue = Object.entries(counts).flatMap(([module_code, count]) => Array.from({ length: count }, (_, n) => ({ module_code, module_description: module_code, right_code: `${module_code}.action${n}`, description: 'Action ' + n })));
  const tx = backend({ catalogue });
  const result = await putRights(tx.pool, { user: actor, version: 0 }, '2', []);
  assert.deepEqual(result.rightCodes, []); assert.equal(result.modules.flatMap((module) => module.rights).length, 36);
  assert.equal(tx.queries.some(({ sql }) => sql.startsWith('UPDATE') || sql.startsWith('INSERT')), false);
  assert.equal(tx.queries.at(-1).sql, 'COMMIT'); assert.equal(tx.released(), true);
  assert.deepEqual(tx.queries.find(({ sql }) => sql.includes('set_config')).values, [actor.email]);
});
