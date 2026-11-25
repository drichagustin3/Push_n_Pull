const { ProductWriteError, lockProductActor } = require('./mutations');
const { AuthError } = require('../auth/service');
const privileged = role => ['admin','superadmin'].includes(role);
const project = (row, metadata) => ({ effDate: row.effdate, unitPrice: row.unitprice, ...(metadata ? { status: row.is_deleted ? 'inactive' : 'active', stamp: row.stamp } : {}) });
async function listPrices(pool, access, code, status) {
  const metadata = privileged(access.user.role);
  // Parent eligibility and child projection share one statement/snapshot. Cast
  // DATE and NUMERIC before JSON aggregation; no timezone or Number coercion.
  const { rows } = await pool.query(`SELECT p.prodcode,p.description,p.is_deleted,
    coalesce((SELECT jsonb_agg(jsonb_build_object('effdate',h.effdate::text,'unitprice',h.unitprice::text${metadata ? ",'is_deleted',h.is_deleted,'stamp',h.stamp" : ''}) ORDER BY h.effdate DESC)
      FROM public.pricehist h WHERE h.prodcode=p.prodcode AND ${metadata ? "($2='all' OR h.is_deleted=($2='inactive'))" : 'NOT h.is_deleted'}),'[]'::jsonb) AS prices
    FROM public.product p WHERE p.prodcode=$1 ${metadata ? '' : 'AND NOT p.is_deleted'}`, metadata ? [code,status] : [code]);
  if (!rows.length) throw new ProductWriteError(404,'product_not_found','Product not found.');
  return { product: { prodcode: rows[0].prodcode, description: rows[0].description }, prices: rows[0].prices.map(row => project(row,metadata)),
    filter: { status: metadata ? status : 'active' }, capabilities: { metadata, add: !rows[0].is_deleted && access.rights.has('price.add'), edit: !rows[0].is_deleted && access.rights.has('price.edit'), delete: !rows[0].is_deleted && access.rights.has('price.delete'), restore: !rows[0].is_deleted && metadata } };
}
async function verifyPriceAudit(client) {
  const fields = (await client.query("SELECT column_name,data_type,character_maximum_length AS max FROM information_schema.columns WHERE table_schema='public' AND table_name='pricehist' AND column_name IN ('stamp','is_deleted')")).rows;
  const stamp = fields.find(row => row.column_name === 'stamp');
  if (!stamp || (stamp.data_type !== 'text' && !(stamp.max >= 284)) || !fields.some(row => row.column_name === 'is_deleted' && row.data_type === 'boolean')) throw new ProductWriteError(503,'price_schema_unavailable','Price changes are awaiting a database update.');
  const triggers = (await client.query(`SELECT t.tgname,t.tgtype,t.tgnargs,encode(t.tgargs,'hex') args,p.proname,n.nspname,t.tgqual IS NULL unconditional
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE t.tgrelid='public.pricehist'::regclass AND NOT t.tgisinternal AND t.tgenabled='O'`)).rows;
  const before = triggers.find(t => t.tgname === 'pricehist_biu_stamp' && t.tgtype === 23 && t.tgnargs === 0 && t.nspname === 'public' && t.unconditional && ['trg_set_stamp','pricehist_set_stamp'].includes(t.proname));
  const writers = triggers.filter(t => ['trg_audit_log','log_audit_event'].includes(t.proname));
  const audit = writers[0];
  if (!before || writers.length !== 1 || !audit || audit.tgname !== 'pricehist_aiu_audit' || audit.nspname !== 'public' || !audit.unconditional || ![21,29].includes(audit.tgtype)
    || (audit.proname === 'trg_audit_log' ? audit.tgnargs !== 2 || audit.args !== Buffer.from('effdate\0prodcode\0').toString('hex') : audit.tgnargs !== 0)) throw new ProductWriteError(503,'price_audit_unavailable','Price changes require the approved database stamp and audit triggers.');
}
async function writePrice(pool, auth, operation, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'"); await client.query('SET LOCAL search_path=pg_catalog,public');
    const actor = await lockProductActor(client,auth,'price.'+(operation === 'restore' ? 'delete' : operation),operation === 'restore');
    await verifyPriceAudit(client);
    // Take the child table writer lock before the parent: same ordering as DEV-06
    // SHARE child-table locks, avoiding a parent/child lock inversion at insertion.
    await client.query('LOCK TABLE public.pricehist IN ROW EXCLUSIVE MODE');
    const parent = (await client.query('SELECT is_deleted FROM public.product WHERE prodcode=$1 FOR SHARE',[data.prodCode])).rows[0];
    if (!parent || (parent.is_deleted && !privileged(actor.role))) throw new ProductWriteError(404,'product_not_found','Active product not found.');
    if (parent.is_deleted) throw new ProductWriteError(409,'product_inactive','Restore the product before changing its prices.');
    await client.query("SELECT set_config('app.username',$1,true)",[actor.email]);
    let existing;
    if (operation !== 'add') {
      existing = (await client.query('SELECT unitprice::text AS unitprice,is_deleted FROM public.pricehist WHERE prodcode=$1 AND effdate=$2::date FOR UPDATE',[data.prodCode,data.effDate])).rows[0];
      if (!existing || (existing.is_deleted && !privileged(actor.role))) throw new ProductWriteError(404,'price_not_found','Active price not found.');
      if (operation === 'edit' && existing.is_deleted) throw new ProductWriteError(409,'price_inactive','Restore the price before editing it.');
      if ((operation === 'delete' && existing.is_deleted) || (operation === 'restore' && !existing.is_deleted)) throw new ProductWriteError(400,'price_state_conflict',operation === 'delete' ? 'Price is already inactive.' : 'Price is already active.');
    }
    const values = [data.prodCode,data.effDate]; let result;
    if (operation === 'add') result = await client.query(`INSERT INTO public.pricehist(prodcode,effdate,unitprice,is_deleted) VALUES($1,$2::date,$3::numeric,false) RETURNING effdate::text,unitprice::text,is_deleted,stamp`,[...values,data.unitPrice]);
    else if (operation === 'edit') result = await client.query(`UPDATE public.pricehist SET unitprice=$3::numeric WHERE prodcode=$1 AND effdate=$2::date RETURNING effdate::text,unitprice::text,is_deleted,stamp`,[...values,data.unitPrice]);
    else result = await client.query(`UPDATE public.pricehist SET is_deleted=$3 WHERE prodcode=$1 AND effdate=$2::date RETURNING effdate::text,unitprice::text,is_deleted,stamp`,[...values,operation === 'delete']);
    const saved = result.rows[0];
    if (!(operation === 'edit' && existing.unitprice === data.unitPrice)) {
      const prefix = ({add:'CREATED',edit:'EDITED',delete:'DELETED',restore:'RESTORED'})[operation]+' '+actor.email+' ';
      if (typeof saved.stamp !== 'string' || !saved.stamp.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2} (0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(saved.stamp.slice(prefix.length))) throw new ProductWriteError(503,'price_stamp_unavailable','Price changes are awaiting a database audit update.');
    }
    await client.query('COMMIT');
    return { price: ['delete','restore'].includes(operation) && !privileged(actor.role) ? { effDate: saved.effdate } : project(saved,privileged(actor.role)) };
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    if (error.code === '23505') throw new ProductWriteError(409,'price_conflict','A price already exists for this product and effective date, including inactive records.');
    if (error instanceof ProductWriteError || error instanceof AuthError) throw error;
    throw new ProductWriteError(503,'prices_unavailable','Price history changes could not be saved. Try again later.');
  } finally { client.release(); }
}
module.exports = { listPrices, writePrice };
