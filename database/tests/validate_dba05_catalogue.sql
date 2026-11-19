-- S1-DBA-05 historical preflight: verify the merged pre-reconciliation catalogue only.
-- Read-only. Intentionally reports drift AFTER the issue-code reconciliation; use
-- validate_dba05_issue_catalogue.sql for post-migration acceptance.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
DO $verify$
DECLARE differences text; active_count integer;
BEGIN
  IF (SELECT count(*) FROM public.role) <> 3 OR EXISTS (
    SELECT 1 FROM (VALUES ('user'),('admin'),('superadmin')) AS expected(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.role WHERE role_code=expected.code)
  ) THEN RAISE EXCEPTION 'Role catalogue differs from the merged three-role contract'; END IF;
  IF (SELECT count(*) FROM public.module) <> 5 OR EXISTS (
    SELECT 1 FROM (VALUES ('customer'),('product'),('human_resources'),('sales'),('reports')) AS expected(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.module WHERE module_code=expected.code)
  ) THEN RAISE EXCEPTION 'Module catalogue differs from the merged five-module contract'; END IF;
  WITH expected(right_code,module_code,description) AS (VALUES
    ('customer.add','customer','Add Customer'),
    ('customer.edit','customer','Edit Customer'),
    ('customer.delete','customer','Delete Customer'),
    ('product.add','product','Add Product'),
    ('product.edit','product','Edit Product'),
    ('product.delete','product','Delete Product'),
    ('price.add','product','Add Price'),
    ('price.edit','product','Edit Price'),
    ('price.delete','product','Delete Price'),
    ('job.add','human_resources','Add Job'),
    ('job.edit','human_resources','Edit Job'),
    ('job.delete','human_resources','Delete Job'),
    ('department.add','human_resources','Add Department'),
    ('department.edit','human_resources','Edit Department'),
    ('department.delete','human_resources','Delete Department'),
    ('employee.add','human_resources','Add Employee'),
    ('employee.edit','human_resources','Edit Employee'),
    ('employee.delete','human_resources','Delete Employee'),
    ('job_history.view','human_resources','View Job History'),
    ('job_history.add','human_resources','Add Job History'),
    ('job_history.edit','human_resources','Edit Job History'),
    ('job_history.delete','human_resources','Delete Job History'),
    ('sale.add','sales','Add Sale'),
    ('sale.edit','sales','Edit Sale'),
    ('sale.delete','sales','Delete Sale'),
    ('sale_detail.view','sales','View Sale Detail'),
    ('sale_detail.add','sales','Add Sale Detail'),
    ('sale_detail.edit','sales','Edit Sale Detail'),
    ('sale_detail.delete','sales','Delete Sale Detail'),
    ('report.top_customers','reports','Top Customers'),
    ('report.product_master_list','reports','Product Master List'),
    ('report.top_products','reports','Top Products'),
    ('report.active_employees','reports','Active Employees'),
    ('report.all_employees','reports','All Employees'),
    ('report.employee_job_history','reports','Employee Job History'),
    ('report.top_sales','reports','Top Sales')
  ), differences AS (
    (SELECT * FROM expected EXCEPT SELECT right_code,module_code,description FROM public.rights_catalogue)
    UNION ALL
    (SELECT right_code,module_code,description FROM public.rights_catalogue EXCEPT SELECT * FROM expected)
  )
  SELECT string_agg(right_code, ', ' ORDER BY right_code) INTO differences FROM differences;
  IF differences IS NOT NULL THEN RAISE EXCEPTION 'Canonical rights differ at codes: %', differences; END IF;
  SELECT count(*) INTO active_count FROM public.rights_catalogue WHERE NOT is_deleted;
  IF active_count<>36 OR EXISTS(SELECT 1 FROM public.module WHERE is_deleted)
    OR EXISTS(SELECT 1 FROM public.role WHERE is_deleted) THEN
    RAISE EXCEPTION 'Required roles, modules or canonical rights are disabled';
  END IF;
  RAISE NOTICE 'PASS: exact canonical set, mappings and descriptions verified; % of 36 rights active. No records modified.', active_count;
END
$verify$;
COMMIT;
