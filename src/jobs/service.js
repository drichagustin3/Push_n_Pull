const { AuthError, unauthenticated } = require('../auth/service');
const { loadAccess, forbidden } = require('../rbac/service');

const moduleCode = 'human_resources';
const adminRoles = ['admin', 'superadmin'];
const rights = { create: 'job.add', edit: 'job.edit', delete: 'job.delete' };
const columns = 'jobcode, jobdesc';
const metadataColumns = columns + ', is_deleted, stamp';
const isAdmin = ({ user }) => adminRoles.includes(user.role);
const notFound = () => new AuthError(404, 'job_not_found', 'Job not found.');

function serialize(record, metadata) {
  const { jobcode, jobdesc, is_deleted, stamp } = record;
  return { jobcode, jobdesc, ...(metadata ? { status: is_deleted ? 'inactive' : 'active', stamp } : {}) };
}

async function listJobs(pool, access, { search, status }) {
  const metadata = isAdmin(access);
  const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
  const match = 'jobcode ILIKE $1 OR jobdesc ILIKE $1';
  const sql = metadata ? `WITH matched AS (
    SELECT ${metadataColumns} FROM public.job WHERE ${match}
  ) SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY jobcode)
    FILTER (WHERE $2 = 'all' OR is_deleted = ($2 = 'inactive')), '[]') AS jobs,
    jsonb_build_object('active', count(*) FILTER (WHERE NOT is_deleted),
      'inactive', count(*) FILTER (WHERE is_deleted), 'all', count(*)) AS counts
    FROM matched m` : `SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY jobcode), '[]') AS jobs
    FROM (SELECT ${columns} FROM public.job_active WHERE ${match}) m`;
  const [row] = (await pool.query(sql, metadata ? [pattern, status] : [pattern])).rows;
  return {
    jobs: row.jobs.map((record) => serialize(record, metadata)),
    filter: { search, status: metadata ? status : 'active' },
    capabilities: { metadata, add: access.rights.has(rights.create), edit: access.rights.has(rights.edit),
      delete: access.rights.has(rights.delete), restore: metadata },
    ...(metadata ? { counts: row.counts } : {}),
  };
}

async function readJob(pool, access, code) {
  const metadata = isAdmin(access);
  const [row] = (await pool.query(metadata
    ? `SELECT ${metadataColumns} FROM public.job WHERE jobcode = $1`
    : `SELECT ${columns} FROM public.job_active WHERE jobcode = $1`, [code])).rows;
  if (!row) throw notFound();
  return { job: serialize(row, metadata) };
}

const mutations = {
  create: `INSERT INTO public.job (jobcode, jobdesc) VALUES ($1, $2)`,
  edit: `UPDATE public.job SET jobdesc = $2 WHERE jobcode = $1 AND NOT is_deleted`,
  delete: `UPDATE public.job SET is_deleted = true WHERE jobcode = $1 AND NOT is_deleted`,
  restore: `UPDATE public.job SET is_deleted = false WHERE jobcode = $1 AND is_deleted`,
};

async function writeJob(pool, auth, operation, code, description) {
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

    await client.query('LOCK TABLE public.job IN ROW EXCLUSIVE MODE');
    const [contract] = (await client.query(`SELECT count(*)::int AS enabled FROM pg_trigger
      WHERE tgrelid = 'public.job'::regclass AND tgenabled IN ('O', 'A')
        AND tgqual IS NULL AND (
          (tgname = 'job_biu_stamp' AND tgtype = 23 AND tgfoid = to_regprocedure('public.trg_set_stamp()')) OR
          (tgname = 'job_aiu_audit' AND tgtype = 21 AND tgfoid = to_regprocedure('public.trg_audit_log()')
            AND encode(tgargs, 'hex') = '6a6f62636f646500') OR
          (tgname = 'job_bu_check' AND tgtype = 19 AND tgfoid = to_regprocedure('public.trg_check_children()'))
        )`)).rows;
    if (contract.enabled !== 3) {
      throw new AuthError(503, 'job_schema_unavailable', 'Job changes require the database audit and dependency triggers.');
    }

    await client.query("SELECT set_config('app.username', $1, true)", [access.user.email]);
    const [row] = (await client.query(mutations[operation] + ' RETURNING ' + metadataColumns,
      description === undefined ? [code] : [code, description])).rows;
    if (!row) throw notFound();
    await client.query('COMMIT');
    return { job: serialize(row, metadata) };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505' && error.constraint === 'job_pkey') {
      throw new AuthError(409, 'job_conflict', 'Job code already exists.');
    }
    if (operation === 'delete' && error.code === 'P0001' && /^Cannot delete job row:/.test(error.message)) {
      throw new AuthError(409, 'job_in_use', 'This job has active job history and cannot be deleted.');
    }
    if (error.code === '22001') {
      throw new AuthError(503, 'job_stamp_unavailable', 'The database could not store the audit stamp for this account.');
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { moduleCode, adminRoles, rights, listJobs, readJob, writeJob };
