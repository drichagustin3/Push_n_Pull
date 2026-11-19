const { AuthError, checkAccount, unauthenticated } = require('../auth/service');

const MODULES = {
  customer: 'Customers', product: 'Products', human_resources: 'Human Resources', sales: 'Sales', reports: 'Reports',
};
const forbidden = () => new AuthError(403, 'forbidden', 'You do not have permission to access this resource.');

async function loadAccess(pool, auth) {
  const user = (await pool.query(`SELECT u.user_id,u.first_name,u.last_name,u.email,u.role,u.status,u.blocked,u.is_deleted,u.session_version,
    r.is_deleted AS role_deleted FROM app_user u JOIN role r ON r.role_code=u.role WHERE u.user_id=$1`, [auth.user.user_id])).rows[0];
  if (!user || user.session_version !== auth.version) throw unauthenticated();
  checkAccount(user);
  if (user.role_deleted) throw forbidden();
  const rows = (await pool.query(`SELECT m.module_code,r.right_code,(p.user_id IS NOT NULL) AS granted
    FROM module m JOIN rights_catalogue r USING(module_code)
    LEFT JOIN user_permission p ON p.right_code=r.right_code AND p.user_id=$1 AND NOT p.is_deleted
    WHERE NOT m.is_deleted AND NOT r.is_deleted ORDER BY m.module_code,r.right_code`, [user.user_id])).rows;
  const privileged = ['admin', 'superadmin'].includes(user.role);
  const rights = new Set(rows.filter((row) => privileged || row.granted).map((row) => row.right_code));
  const modules = new Set(rows.filter((row) => privileged || row.granted).map((row) => row.module_code).filter((code) => Object.hasOwn(MODULES, code)));
  return { user, rights, modules };
}
function navigation(access) {
  const { user, rights, modules } = access;
  const items = Object.entries(MODULES).filter(([code]) => modules.has(code)).map(([code, label]) => ({ code, label, href: '/workspace/' + code, kind: 'module' }));
  if (['admin', 'superadmin'].includes(user.role)) items.push({ code: 'users', label: 'User Management', href: '/users', kind: 'administration' });
  if (user.role === 'superadmin') items.push({ code: 'settings', label: 'System Settings', href: '/workspace/settings', kind: 'shell' },
    { code: 'audit', label: 'Audit Log', href: '/workspace/audit', kind: 'shell' });
  return { user: { name: user.first_name + ' ' + user.last_name, username: user.email, role: user.role },
    items, rightCodes: [...rights], restricted: items.length === 0 };
}
module.exports = { MODULES, loadAccess, navigation, forbidden };
