-- S1-DBA-05 target contract: exact issue #47 codes and module mappings.
-- Read-only. Passes after the DBA-05 catalogue reconciliation.
-- Exact issue action labels include the Customer soft-delete annotation.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $verify$
DECLARE differences text; active_count integer;
BEGIN
  IF (SELECT count(*) FROM public.role) <> 3 OR EXISTS (
    SELECT 1 FROM (VALUES ('user'),('admin'),('superadmin')) AS expected(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.role WHERE role_code=expected.code)
  ) THEN RAISE EXCEPTION 'Role catalogue differs from the three-role contract'; END IF;
  IF (SELECT count(*) FROM public.module) <> 5 OR EXISTS (
    SELECT 1 FROM (VALUES ('customer'),('product'),('human_resources'),('sales'),('reports')) AS expected(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.module WHERE module_code=expected.code)
  ) THEN RAISE EXCEPTION 'Module catalogue differs from the merged five-module contract'; END IF;
  WITH expected(right_code,module_code,description) AS (VALUES
    ('customer.add','customer','Add Customer'),
    ('customer.edit','customer','Edit Customer'),
    ('customer.delete','customer','Delete Customer (Soft delete)'),
    ('product.add','product','Add Product'),
    ('product.edit','product','Edit Product'),
    ('product.delete','product','Delete Product'),
    ('price.add','product','Add Price'),
    ('price.edit','product','Edit Price'),
    ('price.delete','product','Delete Price'),
    ('job.add','human_resources','Add Job'),
    ('job.edit','human_resources','Edit Job'),
    ('job.delete','human_resources','Delete Job'),
    ('dept.add','human_resources','Add Department'),
    ('dept.edit','human_resources','Edit Department'),
    ('dept.delete','human_resources','Delete Department'),
    ('emp.add','human_resources','Add Employee'),
    ('emp.edit','human_resources','Edit Employee'),
    ('emp.delete','human_resources','Delete Employee'),
    ('jobhistory.view','human_resources','View Job History'),
    ('jobhistory.add','human_resources','Add Job History'),
    ('jobhistory.edit','human_resources','Edit Job History'),
    ('jobhistory.delete','human_resources','Delete Job History'),
    ('sale.add','sales','Add Sale'),
    ('sale.edit','sales','Edit Sale'),
    ('sale.delete','sales','Delete Sale'),
    ('saledetail.view','sales','View Sale Detail'),
    ('saledetail.add','sales','Add Sale Detail'),
    ('saledetail.edit','sales','Edit Sale Detail'),
    ('saledetail.delete','sales','Delete Sale Detail'),
    ('report.top_customers','reports','Top Customers'),
    ('report.product_master','reports','Product Master List'),
    ('report.top_products','reports','Top Products'),
    ('report.active_emp','reports','Active Employees'),
    ('report.all_emp','reports','All Employees'),
    ('report.emp_job_history','reports','Employee Job History'),
    ('report.top_sales','reports','Top Sales')
  ), differences AS (
    (SELECT * FROM expected EXCEPT SELECT right_code,module_code,description FROM public.rights_catalogue)
    UNION ALL
    (SELECT right_code,module_code,description FROM public.rights_catalogue EXCEPT SELECT * FROM expected)
  )
  SELECT string_agg(right_code, ', ' ORDER BY right_code) INTO differences FROM differences;
  IF differences IS NOT NULL THEN RAISE EXCEPTION 'Issue #47 rights contract differs at codes: %', differences; END IF;
  SELECT count(*) INTO active_count FROM public.rights_catalogue WHERE NOT is_deleted;
  IF active_count <> 36 OR EXISTS (SELECT 1 FROM public.module WHERE is_deleted)
     OR EXISTS (SELECT 1 FROM public.role WHERE is_deleted) THEN
    RAISE EXCEPTION 'Required roles, modules or rights are soft-deleted; no records modified';
  END IF;
  RAISE NOTICE 'PASS: exact issue #47 codes, mappings and action labels; % of 36 rights active. No records modified.', active_count;
END
$verify$;
COMMIT;
