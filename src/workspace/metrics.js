class MetricsDependencyError extends Error {
  constructor(message) { super(message); this.status = 503; this.code = 'metrics_unavailable'; }
}
async function readMetrics(pool, access) {
  const customer = access.modules.has('customer'), product = access.modules.has('product'), sales = access.modules.has('sales');
  if (!customer && !product && !sales) return { metrics: {} };
  const tables = [...(customer ? ['customer'] : []), ...(product ? ['product'] : []), ...(sales ? ['sales', 'salesdetail', 'pricehist'] : [])];
  const rows = (await pool.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='is_deleted' AND data_type='boolean' AND table_name=ANY($1::text[])", [tables])).rows;
  if (tables.some((table) => !rows.some((row) => row.table_name === table))) throw new MetricsDependencyError('Dashboard metrics are not configured yet. Contact an administrator.');
  const fields = [
    ...(customer ? ['(SELECT count(*)::text FROM customer WHERE NOT is_deleted) AS customers'] : []),
    ...(product ? ['(SELECT count(*)::text FROM product WHERE NOT is_deleted) AS products'] : []),
    ...(sales ? ["(SELECT count(*)::text FROM sales WHERE NOT is_deleted) AS sales",
      `(SELECT round(COALESCE(sum(d.quantity*p.unitprice),0),2)::text FROM sales s JOIN salesdetail d USING(transno)
        LEFT JOIN LATERAL (SELECT unitprice FROM pricehist h WHERE h.prodcode=d.prodcode AND h.effdate<=s.salesdate AND NOT h.is_deleted ORDER BY h.effdate DESC LIMIT 1) p ON TRUE
        WHERE NOT s.is_deleted AND NOT d.is_deleted) AS revenue`,
      `(SELECT count(*)::integer FROM sales s JOIN salesdetail d USING(transno)
        LEFT JOIN LATERAL (SELECT unitprice FROM pricehist h WHERE h.prodcode=d.prodcode AND h.effdate<=s.salesdate AND NOT h.is_deleted ORDER BY h.effdate DESC LIMIT 1) p ON TRUE
        WHERE NOT s.is_deleted AND NOT d.is_deleted AND (p.unitprice IS NULL OR d.quantity IS NULL)) AS missing_prices`] : []),
  ];
  try {
    const row = (await pool.query('SELECT ' + fields.join(','))).rows[0];
    if (row.missing_prices) throw new MetricsDependencyError('Dashboard revenue is unavailable because historical sale pricing is incomplete.');
    delete row.missing_prices;
    return { metrics: row };
  } catch (error) {
    if (['42P01', '42703'].includes(error.code)) throw new MetricsDependencyError('Dashboard metrics are not configured yet. Contact an administrator.');
    throw error;
  }
}
module.exports = { readMetrics, MetricsDependencyError };
