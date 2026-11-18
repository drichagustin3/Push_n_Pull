const { withManagedUser } = require('./service');
const { UserManagementError } = require('./validation');

// Guide module counts validate the installed catalogue, not permission identifiers.
const MODULE_COUNTS = { customer: 3, product: 6, human_resources: 13, sales: 7, reports: 7 };
function validateRights(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'rightCodes')
    || !Array.isArray(body.rightCodes) || body.rightCodes.length > 36
    || body.rightCodes.some((code) => typeof code !== 'string' || !code.length || code.length > 50 || /[\u0000-\u001f\u007f]/u.test(code))
    || new Set(body.rightCodes).size !== body.rightCodes.length) {
    throw new UserManagementError(400, 'Provide only rightCodes: an array of up to 36 unique right codes.');
  }
  return body.rightCodes;
}
function eligible(target) {
  if (target.status !== 'active' || target.blocked) throw new UserManagementError(409, 'Rights can be managed only for active, unblocked accounts.');
}
async function catalogue(client) {
  const rows = (await client.query(`SELECT m.module_code,m.description AS module_description,r.right_code,r.description
    FROM module m JOIN rights_catalogue r USING(module_code)
    WHERE NOT m.is_deleted AND NOT r.is_deleted ORDER BY m.module_code,r.right_code FOR SHARE OF m,r`)).rows;
  const groups = new Map(Object.keys(MODULE_COUNTS).map((code) => [code, []]));
  for (const row of rows) groups.get(row.module_code)?.push(row);
  if (rows.length !== 36 || [...groups].some(([code, rights]) => rights.length !== MODULE_COUNTS[code])) {
    throw new UserManagementError(503, 'The rights catalogue must contain all 36 active rights in the five expected modules. Contact the database administrator.');
  }
  return groups;
}
async function snapshot(client, target, groups) {
  const rightCodes = (await client.query('SELECT right_code FROM user_permission WHERE user_id=$1 AND NOT is_deleted ORDER BY right_code', [target.user_id])).rows.map((row) => row.right_code);
  const active = new Set(rightCodes);
  return { target: { user_id: String(target.user_id), role: target.role }, rightCodes,
    modules: [...groups].map(([code, rights]) => ({ code, description: rights[0].module_description,
      rights: rights.map((right) => ({ rightCode: right.right_code, description: right.description, granted: active.has(right.right_code) })) })) };
}
function getRights(pool, auth, id) {
  return withManagedUser(pool, auth, id, async (client, actor, target) => {
    eligible(target);
    return snapshot(client, target, await catalogue(client));
  });
}
function putRights(pool, auth, id, rightCodes) {
  return withManagedUser(pool, auth, id, async (client, actor, target) => {
    eligible(target);
    const groups = await catalogue(client);
    const known = new Set([...groups.values()].flat().map((right) => right.right_code));
    if (rightCodes.some((code) => !known.has(code))) throw new UserManagementError(400, 'One or more right codes are unavailable.');
    const rows = (await client.query('SELECT right_code,is_deleted FROM user_permission WHERE user_id=$1 FOR UPDATE', [id])).rows;
    const active = new Set(rows.filter((row) => !row.is_deleted).map((row) => row.right_code));
    const requested = new Set(rightCodes);
    const grants = rightCodes.filter((code) => !active.has(code));
    const revokes = [...active].filter((code) => !requested.has(code));
    if (revokes.length) await client.query('UPDATE user_permission SET is_deleted=TRUE WHERE user_id=$1 AND right_code=ANY($2::varchar[]) AND NOT is_deleted', [id, revokes]);
    if (grants.length) await client.query(`INSERT INTO user_permission AS existing(user_id,right_code,is_deleted)
      SELECT $1,code,FALSE FROM unnest($2::varchar[]) AS requested(code)
      ON CONFLICT(user_id,right_code) DO UPDATE SET is_deleted=FALSE WHERE existing.is_deleted`, [id, grants]);
    if (grants.length || revokes.length) {
      // Fire the DB-owned stamp trigger only; its audit trigger ignores stamp-only changes.
      // Per-right ADD/DELETE/RESTORE audit rows already come from user_permission triggers.
      await client.query('UPDATE app_user SET stamp=stamp WHERE user_id=$1', [id]);
    }
    return snapshot(client, target, groups);
  });
}
module.exports = { getRights, putRights, validateRights };
