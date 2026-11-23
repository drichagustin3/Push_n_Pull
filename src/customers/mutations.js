const { checkAccount, unauthenticated, AuthError } = require('../auth/service');
const { forbidden } = require('../rbac/service');
class CustomerWriteError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
async function verifyCustomerAudit(client, profile = true) {
  const fields = (await client.query(`SELECT column_name,data_type,character_maximum_length AS max
    FROM information_schema.columns WHERE table_schema='public' AND table_name='customer'
    AND column_name IN ('custname','stamp')`)).rows;
  const name = fields.find((f) => f.column_name === 'custname');
  const stampField = fields.find((f) => f.column_name === 'stamp');
  if ((profile && (!name || (name.data_type !== 'text' && !(name.max >= 100)))) || !stampField
    || (stampField.data_type !== 'text' && !(stampField.max >= 284))) {
    throw new CustomerWriteError(503, 'customer_schema_unavailable', 'Customer changes are awaiting a database update. Contact the administrator.');
  }
  const { rows } = await client.query(`SELECT t.tgname,t.tgtype,t.tgnargs,encode(t.tgargs,'hex') AS args,
      p.proname,n.nspname,t.tgqual IS NULL AS unconditional
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE t.tgrelid='public.customer'::regclass AND NOT t.tgisinternal AND t.tgenabled='O'
      AND (t.tgname IN ('customer_biu_stamp','customer_aiu_audit') OR p.proname IN ('trg_audit_log','log_audit_event'))`);
  const stamp = rows.find((r) => r.tgname === 'customer_biu_stamp' && r.nspname === 'public'
    && ['trg_set_stamp', 'customer_set_stamp'].includes(r.proname) && r.tgtype === 23 && r.tgnargs === 0 && r.unconditional);
  const writers = rows.filter((r) => ['trg_audit_log', 'log_audit_event'].includes(r.proname));
  const audit = writers[0];
  if (!stamp || writers.length !== 1 || !audit || audit.tgname !== 'customer_aiu_audit'
    || audit.nspname !== 'public' || !audit.unconditional || ![21, 29].includes(audit.tgtype)
    || (audit.proname === 'trg_audit_log' ? audit.tgnargs !== 1 || audit.args !== '637573746e6f00' : audit.tgnargs !== 0)) {
    throw new CustomerWriteError(503, 'customer_audit_unavailable', 'Customer changes require the approved database stamp and audit triggers. Contact the database administrator.');
  }
}
async function writeCustomer(pool, auth, right, data, number, stateChange) {
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
    if (stateChange === 'restore' && !['admin', 'superadmin'].includes(actor.role)) throw forbidden();
    const role = await client.query('SELECT role_code FROM public.role WHERE role_code=$1 AND NOT is_deleted FOR SHARE', [actor.role]);
    const catalogue = await client.query(`SELECT r.right_code FROM public.rights_catalogue r JOIN public.module m USING(module_code)
      WHERE r.right_code=$1 AND m.module_code='customer' AND NOT r.is_deleted AND NOT m.is_deleted FOR SHARE OF r,m`, [right]);
    if (!role.rows.length || !catalogue.rows.length) throw forbidden();
    if (!['admin', 'superadmin'].includes(actor.role)) {
      const grant = await client.query('SELECT right_code FROM public.user_permission WHERE user_id=$1 AND right_code=$2 AND NOT is_deleted FOR SHARE', [actor.user_id, right]);
      if (!grant.rows.length) throw forbidden();
    }
    await verifyCustomerAudit(client, !stateChange);
    await client.query("SELECT set_config('app.username',$1,true)", [actor.email]);
    // Stamps and audit records are DB-owned. Never accept either from the client,
    // duplicate trigger audit entries, or silently write against an unaudited DB.
    let unchanged = false;
    if (stateChange === 'delete') {
      // Lock sales BEFORE the customer row to serialize against in-flight child
      // writers/FK checks. The database child guard remains enabled as well.
      const guard = await client.query(`SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
        JOIN pg_namespace n ON n.oid=p.pronamespace WHERE t.tgrelid='public.customer'::regclass
        AND t.tgname='customer_bu_check' AND t.tgtype=19 AND t.tgnargs=0 AND t.tgqual IS NULL
        AND t.tgenabled='O' AND p.proname='trg_check_children' AND n.nspname='public'`);
      if (!guard.rows.length) throw new CustomerWriteError(503, 'customer_dependencies_unavailable', 'Customer changes are awaiting a database dependency update. Contact the administrator.');
      await client.query('LOCK TABLE public.sales IN SHARE MODE');
    }
    if (stateChange) {
      const target = (await client.query('SELECT custno,is_deleted FROM public.customer WHERE custno=$1 FOR UPDATE', [number])).rows[0];
      if (!target) throw new CustomerWriteError(404, 'customer_not_found', 'Customer not found.');
      const deleting = stateChange === 'delete';
      if (target.is_deleted === deleting) throw new CustomerWriteError(400, 'customer_state_conflict', deleting ? 'Customer is already inactive.' : 'Customer is already active.');
      if (deleting && (await client.query('SELECT EXISTS(SELECT 1 FROM public.sales WHERE custno=$1 AND NOT is_deleted) AS active', [number])).rows[0].active) {
        throw new CustomerWriteError(409, 'customer_has_dependencies', 'Active sales prevent deleting this customer.');
      }
    } else if (number !== undefined) {
      const existing = (await client.query('SELECT custname,address,payterm FROM public.customer WHERE custno=$1 AND NOT is_deleted FOR UPDATE', [number])).rows[0];
      if (!existing) throw new CustomerWriteError(404, 'customer_not_found', 'Active customer not found.');
      unchanged = existing.custname === data.custName && existing.address === data.address && existing.payterm === data.payterm;
    }
    const result = stateChange
      ? await client.query(`UPDATE public.customer SET is_deleted=$1 WHERE custno=$2
          RETURNING custno,custname,address,payterm,is_deleted,stamp`, [stateChange === 'delete', number])
      : number === undefined
      ? await client.query(`INSERT INTO public.customer(custno,custname,address,payterm,is_deleted)
          VALUES($1,$2,$3,$4,false) RETURNING custno,custname,address,payterm,is_deleted,stamp`, [data.custNo, data.custName, data.address, data.payterm])
      : await client.query(`UPDATE public.customer SET custname=$1,address=$2,payterm=$3
          WHERE custno=$4 AND NOT is_deleted RETURNING custno,custname,address,payterm,is_deleted,stamp`, [data.custName, data.address, data.payterm, number]);
    if (!result.rows.length) throw new CustomerWriteError(404, 'customer_not_found', 'Active customer not found.');
    const saved = result.rows[0];
    if (!unchanged) {
      const prefix = (stateChange === 'delete' ? 'DELETED' : stateChange === 'restore' ? 'RESTORED' : number === undefined ? 'CREATED' : 'EDITED') + ' ' + actor.email + ' ';
      if (typeof saved.stamp !== 'string' || !saved.stamp.startsWith(prefix)
        || !/^\d{4}-\d{2}-\d{2} (0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(saved.stamp.slice(prefix.length))) {
        throw new CustomerWriteError(503, 'customer_stamp_unavailable', 'Customer changes are awaiting a database audit update. Contact the administrator.');
      }
    }
    await client.query('COMMIT');
    const customer = { custno: saved.custno, custname: saved.custname, address: saved.address, payterm: saved.payterm };
    if (['admin', 'superadmin'].includes(actor.role)) { customer.status = saved.is_deleted ? 'inactive' : 'active'; customer.stamp = saved.stamp; }
    return stateChange ? { customer: ['admin', 'superadmin'].includes(actor.role) ? customer : { custno: saved.custno }, status: saved.is_deleted ? 'inactive' : 'active' } : { customer };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') throw new CustomerWriteError(409, 'customer_conflict', 'Customer number already exists. Choose another number.');
    if (error.code === '23514') throw new CustomerWriteError(503, 'customer_schema_unavailable', 'Customer changes are awaiting a database constraint update. Contact the administrator.');
    if (error instanceof AuthError || error instanceof CustomerWriteError) throw error;
    throw new CustomerWriteError(503, 'customers_unavailable', 'Customer changes could not be saved. Check the database contract or try again later.');
  } finally { client.release(); }
}
const changeCustomerState = (pool, auth, number, restore) => writeCustomer(pool, auth, 'customer.delete', {}, number, restore ? 'restore' : 'delete');
module.exports = { CustomerWriteError, verifyCustomerAudit, writeCustomer, changeCustomerState };
