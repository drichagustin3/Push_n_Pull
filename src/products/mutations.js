const { checkAccount, unauthenticated, AuthError } = require('../auth/service');
const { forbidden } = require('../rbac/service');
class ProductWriteError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
async function verifyProductAudit(client) {
  const fields = (await client.query(`SELECT column_name,data_type,character_maximum_length AS max
    FROM information_schema.columns WHERE table_schema='public' AND table_name='product'
    AND column_name IN ('description','unit','stamp')`)).rows;
  const description = fields.find((f) => f.column_name === 'description');
  const unit = fields.find((f) => f.column_name === 'unit');
  const stampField = fields.find((f) => f.column_name === 'stamp');
  if (!description || (description.data_type !== 'text' && !(description.max >= 100)) || !unit || (unit.data_type !== 'text' && !(unit.max >= 5)) || !stampField
    || (stampField.data_type !== 'text' && !(stampField.max >= 284))) {
    throw new ProductWriteError(503, 'product_schema_unavailable', 'Product changes are awaiting a database update. Contact the administrator.');
  }
  const { rows } = await client.query(`SELECT t.tgname,t.tgtype,t.tgnargs,encode(t.tgargs,'hex') AS args,
      p.proname,n.nspname,t.tgqual IS NULL AS unconditional
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE t.tgrelid='public.product'::regclass AND NOT t.tgisinternal AND t.tgenabled='O'
      AND (t.tgname IN ('product_biu_stamp','product_aiu_audit') OR p.proname IN ('trg_audit_log','log_audit_event'))`);
  const stamp = rows.find((r) => r.tgname === 'product_biu_stamp' && r.nspname === 'public'
    && ['trg_set_stamp', 'product_set_stamp'].includes(r.proname) && r.tgtype === 23 && r.tgnargs === 0 && r.unconditional);
  const writers = rows.filter((r) => ['trg_audit_log', 'log_audit_event'].includes(r.proname));
  const audit = writers[0];
  if (!stamp || writers.length !== 1 || !audit || audit.tgname !== 'product_aiu_audit'
    || audit.nspname !== 'public' || !audit.unconditional || ![21, 29].includes(audit.tgtype)
    || (audit.proname === 'trg_audit_log' ? audit.tgnargs !== 1 || audit.args !== '70726f64636f646500' : audit.tgnargs !== 0)) {
    throw new ProductWriteError(503, 'product_audit_unavailable', 'Product changes require the approved database stamp and audit triggers. Contact the database administrator.');
  }
}
async function writeProduct(pool, auth, right, data, code) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SET LOCAL search_path=pg_catalog,public');
    // Shares the existing account-management lock boundary: blocking, role changes
    // and rights changes cannot invalidate this actor while its mutation commits.
    const actor = (await client.query('SELECT user_id,email,role,status,blocked,is_deleted,session_version FROM public.app_user WHERE user_id=$1 FOR SHARE', [auth.user.user_id])).rows[0];
    if (!actor || actor.session_version !== auth.version) throw unauthenticated();
    checkAccount(actor);
    const role = await client.query('SELECT role_code FROM public.role WHERE role_code=$1 AND NOT is_deleted FOR SHARE', [actor.role]);
    const catalogue = await client.query(`SELECT r.right_code FROM public.rights_catalogue r JOIN public.module m USING(module_code)
      WHERE r.right_code=$1 AND m.module_code='product' AND NOT r.is_deleted AND NOT m.is_deleted FOR SHARE OF r,m`, [right]);
    if (!role.rows.length || !catalogue.rows.length) throw forbidden();
    if (!['admin', 'superadmin'].includes(actor.role)) {
      const grant = await client.query('SELECT right_code FROM public.user_permission WHERE user_id=$1 AND right_code=$2 AND NOT is_deleted FOR SHARE', [actor.user_id, right]);
      if (!grant.rows.length) throw forbidden();
    }
    await verifyProductAudit(client);
    await client.query("SELECT set_config('app.username',$1,true)", [actor.email]);
    // Stamps and audit records are DB-owned. Never accept either from the client,
    // duplicate trigger audit entries, or silently write against an unaudited DB.
    let unchanged = false;
    if (code !== undefined) {
      const existing = (await client.query('SELECT description,unit FROM public.product WHERE prodcode=$1 AND NOT is_deleted FOR UPDATE', [code])).rows[0];
      if (!existing) throw new ProductWriteError(404, 'product_not_found', 'Active product not found.');
      unchanged = existing.description === data.description && existing.unit === data.unit;
    }
    const result = code === undefined
      ? await client.query(`INSERT INTO public.product(prodcode,description,unit,is_deleted)
          VALUES($1,$2,$3,false) RETURNING prodcode,description,unit,is_deleted,stamp`, [data.prodCode, data.description, data.unit])
      : await client.query(`UPDATE public.product SET description=$1,unit=$2
          WHERE prodcode=$3 AND NOT is_deleted RETURNING prodcode,description,unit,is_deleted,stamp`, [data.description, data.unit, code]);
    if (!result.rows.length) throw new ProductWriteError(404, 'product_not_found', 'Active product not found.');
    const saved = result.rows[0];
    if (!unchanged) {
      const prefix = (code === undefined ? 'CREATED' : 'EDITED') + ' ' + actor.email + ' ';
      if (typeof saved.stamp !== 'string' || !saved.stamp.startsWith(prefix)
        || !/^\d{4}-\d{2}-\d{2} (0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(saved.stamp.slice(prefix.length))) {
        throw new ProductWriteError(503, 'product_stamp_unavailable', 'Product changes are awaiting a database audit update. Contact the administrator.');
      }
    }
    await client.query('COMMIT');
    const product = { prodcode: saved.prodcode, description: saved.description, unit: saved.unit };
    if (['admin', 'superadmin'].includes(actor.role)) { product.status = saved.is_deleted ? 'inactive' : 'active'; product.stamp = saved.stamp; }
    return { product };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') throw new ProductWriteError(400, 'product_conflict', 'Product code already exists. Choose another code.');
    if (error.code === '23514') throw new ProductWriteError(503, 'product_schema_unavailable', 'Product changes are awaiting a database constraint update. Contact the administrator.');
    if (error instanceof AuthError || error instanceof ProductWriteError) throw error;
    throw new ProductWriteError(503, 'products_unavailable', 'Product changes could not be saved. Check the database contract or try again later.');
  } finally { client.release(); }
}
module.exports = { ProductWriteError, verifyProductAudit, writeProduct };
