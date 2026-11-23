async function listProducts(pool, access, filter) {
  const metadata = ['admin', 'superadmin'].includes(access.user.role);
  const pattern = '%' + filter.search.replace(/[\\%_]/g, '\\$&') + '%';
  // NUMERIC -> text BEFORE JSON aggregation prevents driver/JSON Number coercion.
  // One lateral lookup per product within ONE SQL statement, not per-item API queries.
  const sql = `WITH matched AS (
      SELECT p.prodcode,p.description,p.unit,price.unitprice::text AS "currentPrice"${metadata ? ',p.is_deleted,p.stamp' : ''}
      FROM public.product p LEFT JOIN LATERAL (
        SELECT h.unitprice FROM public.pricehist h WHERE h.prodcode=p.prodcode
          AND NOT h.is_deleted AND h.effdate<=CURRENT_DATE ORDER BY h.effdate DESC LIMIT 1
      ) price ON true
      WHERE ${metadata ? '' : 'NOT p.is_deleted AND '}(p.prodcode ILIKE $1 ESCAPE E'\\\\' OR p.description ILIKE $1 ESCAPE E'\\\\')
    ) SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY prodcode)${metadata ? " FILTER (WHERE $2='all' OR is_deleted=($2='inactive'))" : ''},'[]'::jsonb) AS products${metadata ? ",jsonb_build_object('active',count(*) FILTER (WHERE NOT is_deleted),'inactive',count(*) FILTER (WHERE is_deleted),'all',count(*)) AS counts" : ''} FROM matched m`;
  const row = (await pool.query(sql, metadata ? [pattern, filter.status] : [pattern])).rows[0];
  const products = row.products.map(record => {
    const product = { prodcode: record.prodcode, description: record.description, unit: record.unit, currentPrice: record.currentPrice };
    if (metadata) { product.status = record.is_deleted ? 'inactive' : 'active'; product.stamp = record.stamp; }
    return product;
  });
  return { products, filter: { search: filter.search, status: metadata ? filter.status : 'active' },
    capabilities: { metadata, add: access.rights.has('product.add'), edit: access.rights.has('product.edit'), delete: access.rights.has('product.delete'),
      prices: ['price.add', 'price.edit', 'price.delete'].some(code => access.rights.has(code)) },
    ...(metadata ? { counts: row.counts } : {}) };
}
module.exports = { listProducts };
