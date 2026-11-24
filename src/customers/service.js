const searchClause = `(custno ILIKE $1 ESCAPE E'\\\\' OR custname ILIKE $1 ESCAPE E'\\\\' OR address ILIKE $1 ESCAPE E'\\\\')`;
const columns = 'custno,custname,address,payterm';
async function listCustomers(pool, access, filter) {
  const metadata = ['admin', 'superadmin'].includes(access.user.role);
  const pattern = '%' + filter.search.replace(/[\\%_]/g, '\\$&') + '%';
  // User visibility is constrained in SQL, with no metadata in its projection or
  // counts. One statement gives privileged rows/counts the same MVCC snapshot.
  const sql = metadata ? `WITH matched AS (
      SELECT ${columns},is_deleted,stamp FROM public.customer WHERE ${searchClause}
    ) SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY custno)
      FILTER (WHERE $2='all' OR is_deleted=($2='inactive')),'[]'::jsonb) AS customers,
      jsonb_build_object('active',count(*) FILTER (WHERE NOT is_deleted),
        'inactive',count(*) FILTER (WHERE is_deleted),'all',count(*)) AS counts FROM matched m`
    : `WITH matched AS (SELECT ${columns} FROM public.customer
        WHERE NOT is_deleted AND ${searchClause})
       SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY custno),'[]'::jsonb) AS customers FROM matched m`;
  const row = (await pool.query(sql, metadata ? [pattern, filter.status] : [pattern])).rows[0];
  const customers = row.customers.map((record) => {
    const customer = Object.fromEntries(columns.split(',').map((key) => [key, record[key]]));
    if (metadata) { customer.status = record.is_deleted ? 'inactive' : 'active'; customer.stamp = record.stamp; }
    return customer;
  });
  return { customers, filter: { search: filter.search, status: metadata ? filter.status : 'active' },
    capabilities: { metadata, add: access.rights.has('customer.add'), edit: access.rights.has('customer.edit'), delete: access.rights.has('customer.delete') },
    ...(metadata ? { counts: row.counts } : {}) };
}
module.exports = { listCustomers };
