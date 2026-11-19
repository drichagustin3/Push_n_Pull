const { mutateUser, managedColumns } = require('./service');
const { UserManagementError } = require('./validation');
const { assertSuperadmin, protectLastSuperadmin } = require('./superadmin-guard');

const revoke = (client, id) => client.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=$1", [id]);

function reviewPending(pool, auth, id, approved) {
  return mutateUser(pool, auth, id, async (client, actor, target) => {
    assertSuperadmin(actor);
    if (target.status !== 'pending' || target.role !== 'user' || (approved && target.blocked)) throw new UserManagementError(409, 'Only eligible pending User registrations can be reviewed.');
    const row = (await client.query(`UPDATE app_user SET status=$1 WHERE user_id=$2 RETURNING ${managedColumns}`, [approved ? 'active' : 'inactive', id])).rows[0];
    await revoke(client, id);
    return row;
  });
}

function changeRole(pool, auth, id, role) {
  if (!['user', 'admin', 'superadmin'].includes(role)) throw new UserManagementError(400, 'Choose user, admin, or superadmin.');
  return mutateUser(pool, auth, id, async (client, actor, target) => {
    assertSuperadmin(actor);
    if (target.status !== 'active' || target.blocked) throw new UserManagementError(409, 'Roles can be assigned only to active, unblocked accounts.');
    if (target.role === 'superadmin' && role !== 'superadmin') await protectLastSuperadmin(client, target);
    const row = (await client.query(`UPDATE app_user SET role=$1 WHERE user_id=$2 RETURNING ${managedColumns}`, [role, id])).rows[0];
    if (target.role !== role) await revoke(client, id);
    return row;
  });
}

function removeUser(pool, auth, id) {
  return mutateUser(pool, auth, id, async (client, actor, target) => {
    assertSuperadmin(actor);
    await protectLastSuperadmin(client, target);
    const rights = await client.query('SELECT 1 FROM user_permission WHERE user_id=$1 AND NOT is_deleted LIMIT 1', [id]);
    if (rights.rowCount) throw new UserManagementError(409, 'Remove active permission assignments before deleting this account.');
    const row = (await client.query(`UPDATE app_user SET is_deleted=TRUE,status='inactive' WHERE user_id=$1 RETURNING ${managedColumns}`, [id])).rows[0];
    await revoke(client, id);
    return row;
  });
}

module.exports = { reviewPending, changeRole, removeUser };
