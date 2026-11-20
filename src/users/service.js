const bcrypt = require('bcrypt');
const { checkAccount } = require('../auth/service');
const { UserManagementError } = require('./validation');
const { assertSuperadmin, lockAccountChanges, protectLastSuperadmin } = require('./superadmin-guard');

const baseColumns = 'user_id,first_name,last_name,email,role,blocked,empno';
const isSuperadmin = (actor) => actor.role === 'superadmin';
const columns = (actor) => baseColumns + (isSuperadmin(actor) ? ',status,stamp,is_deleted' : '');
function publicUser(row, actor) {
  const result = {};
  for (const key of columns(actor).split(',')) result[key] = row[key];
  result.can_edit = !row.is_deleted && (isSuperadmin(actor) || row.role === 'user');
  result.can_block = result.can_edit && (isSuperadmin(actor) || (row.role !== 'superadmin' && String(row.user_id) !== String(actor.user_id)));
  result.can_manage_rights = (isSuperadmin(actor) || row.role === 'user')
    && (row.rights_eligible ?? (!row.is_deleted && row.status === 'active' && !row.blocked));
  if (isSuperadmin(actor)) {
    result.can_approve = !row.is_deleted && row.role === 'user' && row.status === 'pending' && !row.blocked;
    result.can_reject = !row.is_deleted && row.role === 'user' && row.status === 'pending';
    result.can_change_role = !row.is_deleted && row.status === 'active' && !row.blocked;
    result.can_remove = !row.is_deleted;
  }
  return result;
}
async function listUsers(pool, actor, filter) {
  const search = '%' + filter.search.replace(/[\\%_]/g, '\\$&') + '%';
  const where = `WHERE ($1::boolean OR (role <> 'superadmin' AND NOT is_deleted))
    AND ($2='all' OR blocked=($2='true')) AND ($3='all' OR role=$3)
    AND ($4='all' OR is_deleted=($4='true'))
    AND (first_name ILIKE $5 ESCAPE E'\\\\' OR last_name ILIKE $5 ESCAPE E'\\\\' OR email ILIKE $5 ESCAPE E'\\\\' OR (first_name || ' ' || last_name) ILIKE $5 ESCAPE E'\\\\')`;
  const values = [isSuperadmin(actor), filter.blocked, filter.role, isSuperadmin(actor) ? filter.deleted : 'false', search];
  const result = await pool.query(`SELECT ${columns(actor)},(status='active' AND NOT blocked AND NOT is_deleted) AS rights_eligible FROM app_user ${where} ORDER BY user_id LIMIT 51 OFFSET $6`, [...values, (filter.page - 1) * 50]);
  return { users: result.rows.slice(0, 50).map((row) => publicUser(row, actor)), page: filter.page, hasMore: result.rows.length > 50,
    viewer: { user_id: String(actor.user_id), role: actor.role, showMetadata: isSuperadmin(actor) } };
}
async function getUser(pool, actor, id) {
  const row = (await pool.query(`SELECT ${columns(actor)},(status='active' AND NOT blocked AND NOT is_deleted) AS rights_eligible FROM app_user WHERE user_id=$1 AND ($2::boolean OR (role='user' AND NOT is_deleted))`, [id, isSuperadmin(actor)])).rows[0];
  if (!row) throw new UserManagementError(404, 'Account not found.');
  return publicUser(row, actor);
}
async function withManagedUser(pool, auth, id, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await lockAccountChanges(client);
    // A stable lock order prevents concurrent managers editing one another from deadlocking.
    const rows = (await client.query('SELECT user_id,email,role,blocked,status,is_deleted,session_version FROM app_user WHERE user_id=ANY($1::bigint[]) ORDER BY user_id FOR UPDATE', [[String(auth.user.user_id), ...(id ? [id] : [])]])).rows;
    const actor = rows.find((row) => String(row.user_id) === String(auth.user.user_id));
    if (!actor || actor.session_version !== auth.version) throw new UserManagementError(401, 'Please sign in again.');
    checkAccount(actor);
    if (!['admin', 'superadmin'].includes(actor.role)) throw new UserManagementError(403, 'User Management requires an administrator.');
    const target = id ? rows.find((row) => String(row.user_id) === id) : null;
    if (id && (!target || target.is_deleted || (!isSuperadmin(actor) && target.role !== 'user'))) throw new UserManagementError(404, 'Account not found.');
    await client.query("SELECT set_config('app.username',$1,true)", [actor.email]);
    const row = await operation(client, actor, target);
    await client.query('COMMIT');
    return row;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function mutate(pool, auth, id, operation) {
  return withManagedUser(pool, auth, id, async (client, actor, target) => publicUser(await operation(client, actor, target), actor));
}
async function addUser(pool, auth, data) {
  const role = data.role ?? 'user';
  const checkRole = (actor) => {
    if (!['user', 'admin', 'superadmin'].includes(role)) throw new UserManagementError(400, 'Choose a valid account role.');
    if (actor.role !== 'superadmin' && role !== 'user') throw new UserManagementError(403, 'Only Superadmins may create privileged accounts.');
  };
  checkRole(auth.user);
  const hash = await bcrypt.hash(data.password, 12);
  return mutate(pool, auth, null, async (client, actor) => {
    checkRole(actor);
    return (await client.query(`INSERT INTO app_user
    (first_name,last_name,email,empno,password_hash,role,status,blocked,must_change_password)
    VALUES($1,$2,$3,$4,$5,$6,'active',FALSE,TRUE) RETURNING ${baseColumns},status,stamp,is_deleted`,
    [data.firstName, data.lastName, data.email, data.empno ?? null, hash, role])).rows[0];
  });
}
function editUser(pool, auth, id, data) {
  return mutate(pool, auth, id, async (client) => (await client.query(`UPDATE app_user SET first_name=$1,last_name=$2,email=$3,
    empno=CASE WHEN $4::boolean THEN $5 ELSE empno END WHERE user_id=$6 RETURNING ${baseColumns},status,stamp,is_deleted`,
  [data.firstName, data.lastName, data.email, Object.hasOwn(data, 'empno'), data.empno ?? null, id])).rows[0]);
}
function blockUser(pool, auth, id, blocked) {
  if (!isSuperadmin(auth.user) && String(auth.user.user_id) === id && blocked !== false) throw new UserManagementError(400, 'You cannot block your own account.');
  return mutate(pool, auth, id, async (client, actor, target) => {
    const nextBlocked = blocked ?? !target.blocked;
    if (target.role === 'superadmin') {
      assertSuperadmin(actor);
      if (nextBlocked) await protectLastSuperadmin(client, target);
    } else if (String(actor.user_id) === id && nextBlocked) throw new UserManagementError(400, 'You cannot block your own account.');
    const row = (await client.query(`UPDATE app_user SET blocked=$1 WHERE user_id=$2 RETURNING ${baseColumns},status,stamp,is_deleted`, [nextBlocked, id])).rows[0];
    if (nextBlocked) await client.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=$1", [id]);
    return row;
  });
}
module.exports = { listUsers, getUser, addUser, editUser, blockUser, mutateUser: mutate, withManagedUser,
  managedColumns: baseColumns + ',status,stamp,is_deleted' };
