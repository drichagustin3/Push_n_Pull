const { AuthError, unauthenticated } = require('../auth/service');
const { loadAccess, forbidden } = require('../rbac/service');

const moduleCode = 'human_resources';
const adminRoles = ['admin', 'superadmin'];
const rights = { create: 'dept.add', edit: 'dept.edit', delete: 'dept.delete' };
const columns = 'deptcode, deptname';
const metadataColumns = columns + ', is_deleted, stamp';
const isAdmin = ({ user }) => adminRoles.includes(user.role);
const notFound = () => new AuthError(404, 'department_not_found', 'Department not found.');

function serialize(record, metadata) {
  const { deptcode, deptname, is_deleted, stamp } = record;
  return { deptcode, deptname, ...(metadata ? { status: is_deleted ? 'inactive' : 'active', stamp } : {}) };
}

async function listDepartments(pool, access, { search, status }) {
  const metadata = isAdmin(access);
  const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
  const match = 'deptcode ILIKE $1 OR deptname ILIKE $1';
  const sql = metadata ? `WITH matched AS (
    SELECT ${metadataColumns} FROM public.department WHERE ${match}
  ) SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY deptcode)
    FILTER (WHERE $2 = 'all' OR is_deleted = ($2 = 'inactive')), '[]') AS departments,
    jsonb_build_object('active', count(*) FILTER (WHERE NOT is_deleted),
      'inactive', count(*) FILTER (WHERE is_deleted), 'all', count(*)) AS counts
    FROM matched m` : `SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY deptcode), '[]') AS departments
    FROM (SELECT ${columns} FROM public.department_active WHERE ${match}) m`;
  const [row] = (await pool.query(sql, metadata ? [pattern, status] : [pattern])).rows;
  return {
    departments: row.departments.map((record) => serialize(record, metadata)),
    filter: { search, status: metadata ? status : 'active' },
    capabilities: { metadata, add: access.rights.has(rights.create), edit: access.rights.has(rights.edit),
      delete: access.rights.has(rights.delete), restore: metadata },
    ...(metadata ? { counts: row.counts } : {}),
  };
}

async function readDepartment(pool, access, code) {
  const metadata = isAdmin(access);
  const [row] = (await pool.query(metadata
    ? `SELECT ${metadataColumns} FROM public.department WHERE deptcode = $1`
    : `SELECT ${columns} FROM public.department_active WHERE deptcode = $1`, [code])).rows;
  if (!row) throw notFound();
  return { department: serialize(row, metadata) };
}

const mutations = {
  create: `INSERT INTO public.department (deptcode, deptname) VALUES ($1, $2)`,
  edit: `UPDATE public.department SET deptname = $2 WHERE deptcode = $1 AND NOT is_deleted`,
  delete: `UPDATE public.department SET is_deleted = true WHERE deptcode = $1 AND NOT is_deleted`,
  restore: `UPDATE public.department SET is_deleted = false WHERE deptcode = $1 AND is_deleted`,
};

async function writeDepartment(pool, auth, operation, code, name) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SET LOCAL search_path = pg_catalog, public');
    // Account and grant management take an exclusive lock on the same account row.
    const actor = await client.query('SELECT 1 FROM public.app_user WHERE user_id = $1 FOR SHARE', [auth.user.user_id]);
    if (!actor.rowCount) throw unauthenticated();
    const access = await loadAccess(client, auth);
    const metadata = isAdmin(access);
    const authorized = operation === 'restore' ? metadata
      : access.modules.has(moduleCode) && access.rights.has(rights[operation]);
    if (!authorized) throw forbidden();

    const [contract] = (await client.query(`SELECT count(*)::int AS enabled FROM pg_trigger
      WHERE tgrelid = 'public.department'::regclass AND tgenabled IN ('O', 'A')
        AND tgname IN ('department_biu_stamp', 'department_aiu_audit', 'department_bu_check')`)).rows;
    if (contract.enabled !== 3) {
      throw new AuthError(503, 'department_schema_unavailable', 'Department changes require the database audit and dependency triggers.');
    }

    await client.query("SELECT set_config('app.username', $1, true)", [access.user.email]);
    const [row] = (await client.query(mutations[operation] + ' RETURNING ' + metadataColumns,
      name === undefined ? [code] : [code, name])).rows;
    if (!row) throw notFound();
    await client.query('COMMIT');
    return { department: serialize(row, metadata) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505' && error.constraint === 'department_pkey') {
      throw new AuthError(409, 'department_conflict', 'Department code already exists.');
    }
    if (operation === 'delete' && error.code === 'P0001' && /^Cannot delete department row:/.test(error.message)) {
      throw new AuthError(409, 'department_in_use', 'This department has active job history and cannot be deleted.');
    }
    if (error.code === '22001') {
      throw new AuthError(503, 'department_stamp_unavailable', 'The database could not store the audit stamp for this account.');
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { moduleCode, adminRoles, rights, listDepartments, readDepartment, writeDepartment };
