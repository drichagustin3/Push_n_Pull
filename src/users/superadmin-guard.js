const { UserManagementError } = require('./validation');

const LAST_SUPERADMIN_MESSAGE = 'Action blocked: Cannot remove, demote, or disable the last remaining Superadmin.';

function assertSuperadmin(actor) {
  if (actor.role !== 'superadmin') throw new UserManagementError(403, 'Only a Superadmin may perform this operation.');
}

async function lockAccountChanges(client) {
  // Application-wide account mutation lock; always acquired before account row locks.
  // All account-management writers use the same transaction lock.
  await client.query('SELECT pg_advisory_xact_lock(1213157445, 6)');
}

async function protectLastSuperadmin(client, target) {
  if (target.role !== 'superadmin' || target.status !== 'active' || target.blocked || target.is_deleted) return;
  const row = (await client.query("SELECT count(*)::integer AS count FROM app_user WHERE role='superadmin' AND status='active' AND NOT blocked AND NOT is_deleted")).rows[0];
  if (row.count <= 1) throw new UserManagementError(403, LAST_SUPERADMIN_MESSAGE);
}

module.exports = { assertSuperadmin, lockAccountChanges, protectLastSuperadmin, LAST_SUPERADMIN_MESSAGE };
