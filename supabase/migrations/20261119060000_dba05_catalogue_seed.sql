-- S1-DBA-05: approved three-account seed and one-to-one Issue #47 reconciliation.
-- Depends on merged DBA-03; does not depend on or modify DBA-06.
-- The user approved three named accounts/emails in database/seeds/dba05-superadmins.json.
-- New accounts REQUIRE private SHA-256 setup proofs supplied transaction-locally
-- via hope.dba05_setup. Use the operator tool; no raw secret belongs in this file.
-- Run during a coordinated catalogue rollout; clients must reload catalogue codes.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Serialize with existing DEV-06/07 account/rights transactions. Local DDL locks
-- also stop readers/writers from seeing any intermediate parent/child identities.
SELECT pg_advisory_xact_lock(1213157445,6);
LOCK TABLE public.role, public.module, public.app_user, public.rights_catalogue,
  public.user_permission IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE _dba05_right_seed (
  legacy_code varchar(50) PRIMARY KEY,
  right_code varchar(50) NOT NULL UNIQUE,
  module_code text NOT NULL,
  description text NOT NULL
) ON COMMIT DROP;
INSERT INTO pg_temp._dba05_right_seed VALUES
  ('customer.add','customer.add','customer','Add Customer'),
  ('customer.edit','customer.edit','customer','Edit Customer'),
  ('customer.delete','customer.delete','customer','Delete Customer (Soft delete)'),
  ('product.add','product.add','product','Add Product'),
  ('product.edit','product.edit','product','Edit Product'),
  ('product.delete','product.delete','product','Delete Product'),
  ('price.add','price.add','product','Add Price'),
  ('price.edit','price.edit','product','Edit Price'),
  ('price.delete','price.delete','product','Delete Price'),
  ('job.add','job.add','human_resources','Add Job'),
  ('job.edit','job.edit','human_resources','Edit Job'),
  ('job.delete','job.delete','human_resources','Delete Job'),
  ('department.add','dept.add','human_resources','Add Department'),
  ('department.edit','dept.edit','human_resources','Edit Department'),
  ('department.delete','dept.delete','human_resources','Delete Department'),
  ('employee.add','emp.add','human_resources','Add Employee'),
  ('employee.edit','emp.edit','human_resources','Edit Employee'),
  ('employee.delete','emp.delete','human_resources','Delete Employee'),
  ('job_history.view','jobhistory.view','human_resources','View Job History'),
  ('job_history.add','jobhistory.add','human_resources','Add Job History'),
  ('job_history.edit','jobhistory.edit','human_resources','Edit Job History'),
  ('job_history.delete','jobhistory.delete','human_resources','Delete Job History'),
  ('sale.add','sale.add','sales','Add Sale'),
  ('sale.edit','sale.edit','sales','Edit Sale'),
  ('sale.delete','sale.delete','sales','Delete Sale'),
  ('sale_detail.view','saledetail.view','sales','View Sale Detail'),
  ('sale_detail.add','saledetail.add','sales','Add Sale Detail'),
  ('sale_detail.edit','saledetail.edit','sales','Edit Sale Detail'),
  ('sale_detail.delete','saledetail.delete','sales','Delete Sale Detail'),
  ('report.top_customers','report.top_customers','reports','Top Customers'),
  ('report.product_master_list','report.product_master','reports','Product Master List'),
  ('report.top_products','report.top_products','reports','Top Products'),
  ('report.active_employees','report.active_emp','reports','Active Employees'),
  ('report.all_employees','report.all_emp','reports','All Employees'),
  ('report.employee_job_history','report.emp_job_history','reports','Employee Job History'),
  ('report.top_sales','report.top_sales','reports','Top Sales');

DO $seed$
DECLARE fk_name text; fk_definition text;
BEGIN
  IF (SELECT count(*) FROM public.role)<>3 OR EXISTS (
    SELECT 1 FROM (VALUES('user'),('admin'),('superadmin')) e(code)
    WHERE NOT EXISTS(SELECT 1 FROM public.role r WHERE r.role_code=e.code AND NOT r.is_deleted)
  ) THEN RAISE EXCEPTION 'DBA-05 requires the three active DBA-03 roles; disabled roles are never reactivated'; END IF;

  IF EXISTS(SELECT 1 FROM public.module m WHERE m.module_code NOT IN ('customer','product','human_resources','sales','reports')
      OR m.is_deleted OR btrim(m.description)='') THEN
    RAISE EXCEPTION 'DBA-05 found an unexpected or disabled module; no existing module was overwritten';
  END IF;
  IF EXISTS(SELECT 1 FROM public.rights_catalogue r
    WHERE NOT EXISTS(SELECT 1 FROM pg_temp._dba05_right_seed s
      WHERE r.right_code IN (s.legacy_code,s.right_code) AND r.module_code=s.module_code
        AND (r.description=s.description OR (s.right_code='customer.delete' AND r.description='Delete Customer')))
      OR r.is_deleted) THEN
    RAISE EXCEPTION 'DBA-05 found a conflicting, unknown or disabled right; no rights were merged or reactivated';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp._dba05_right_seed s
    WHERE s.legacy_code<>s.right_code AND EXISTS(SELECT 1 FROM public.rights_catalogue WHERE right_code=s.legacy_code)
      AND EXISTS(SELECT 1 FROM public.rights_catalogue WHERE right_code=s.right_code)) THEN
    RAISE EXCEPTION 'Both old and issue codes exist for one action; DBA-05 refuses ambiguous permission merging';
  END IF;

  -- Verify the sole referencing FK, including its original non-deferrable
  -- NO ACTION behavior. Never disable FK checks or any RBAC/audit trigger.
  IF (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid='public.rights_catalogue'::regclass)<>1 THEN
    RAISE EXCEPTION 'Unexpected rights catalogue dependants; review before reconciliation';
  END IF;
  SELECT c.conname,pg_get_constraintdef(c.oid) INTO fk_name,fk_definition
    FROM pg_constraint c WHERE c.contype='f' AND c.conrelid='public.user_permission'::regclass
      AND c.confrelid='public.rights_catalogue'::regclass AND NOT c.condeferrable AND NOT c.condeferred
      AND c.convalidated AND c.confupdtype='a' AND c.confdeltype='a'
      AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='right_code')]::smallint[]
      AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='right_code')]::smallint[];
  IF fk_name IS NULL THEN RAISE EXCEPTION 'Unexpected user_permission right-code foreign-key contract'; END IF;

  INSERT INTO public.module(module_code,description) VALUES
    ('customer','Customer Management'),('product','Product Management'),('human_resources','Human Resources'),
    ('sales','Sales Management'),('reports','Reports') ON CONFLICT(module_code) DO NOTHING;

  IF EXISTS(SELECT 1 FROM public.rights_catalogue r JOIN pg_temp._dba05_right_seed s ON r.right_code=s.legacy_code
      WHERE s.legacy_code<>s.right_code) THEN
    -- Defer only this FK inside this transaction while BOTH sides are renamed.
    -- All associations (including revoked rows) retain user_id and is_deleted.
    EXECUTE format('ALTER TABLE public.user_permission ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE',fk_name);
    EXECUTE format('SET CONSTRAINTS public.%I DEFERRED',fk_name);
    UPDATE public.rights_catalogue r SET right_code=s.right_code
      FROM pg_temp._dba05_right_seed s WHERE r.right_code=s.legacy_code AND s.legacy_code<>s.right_code;
    UPDATE public.user_permission p SET right_code=s.right_code
      FROM pg_temp._dba05_right_seed s WHERE p.right_code=s.legacy_code AND s.legacy_code<>s.right_code;
    EXECUTE format('SET CONSTRAINTS public.%I IMMEDIATE',fk_name);
    EXECUTE format('ALTER TABLE public.user_permission ALTER CONSTRAINT %I NOT DEFERRABLE',fk_name);
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid='public.user_permission'::regclass AND conname=fk_name) IS DISTINCT FROM fk_definition THEN
    RAISE EXCEPTION 'Foreign-key definition was not restored';
  END IF;

  INSERT INTO public.rights_catalogue(right_code,module_code,description)
    SELECT right_code,module_code,description FROM pg_temp._dba05_right_seed
    ON CONFLICT(right_code) DO NOTHING;
  -- One issue caption explicitly adds the soft-delete annotation. Other existing
  -- valid descriptions/module labels are preserved; conflicting meanings fail.
  UPDATE public.rights_catalogue SET description='Delete Customer (Soft delete)'
    WHERE right_code='customer.delete' AND description='Delete Customer';

  IF (SELECT count(*) FROM public.module)<>5 OR (SELECT count(*) FROM public.rights_catalogue)<>36 OR EXISTS(
    SELECT 1 FROM pg_temp._dba05_right_seed s WHERE NOT EXISTS(
      SELECT 1 FROM public.rights_catalogue r WHERE r.right_code=s.right_code AND r.module_code=s.module_code
        AND r.description=s.description AND NOT r.is_deleted)) THEN
    RAISE EXCEPTION 'DBA-05 final exact catalogue verification failed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_permission p LEFT JOIN public.rights_catalogue r USING(right_code) WHERE r.right_code IS NULL) THEN
    RAISE EXCEPTION 'DBA-05 detected an orphaned permission association';
  END IF;
  RAISE NOTICE 'DBA-05 catalogue complete: five modules, 36 issue rights.';
END
$seed$;
-- Keep this public roster aligned with the approved JSON manifest. It contains
-- identities only, never credentials. Existing accounts are never promoted/reset.
CREATE TEMP TABLE _dba05_superadmin_seed (
  first_name text NOT NULL, last_name text NOT NULL, email text PRIMARY KEY
) ON COMMIT DROP;
INSERT INTO pg_temp._dba05_superadmin_seed VALUES
  ('Aldrich Rodolf','Agustin','drichagustin.3@gmail.com'),
  ('Ashley Nicole','Marticio','nicsmolina03@gmail.com'),
  ('Ricky Joe','Sanglay','rickyjoesanglay56@gmail.com');

DO $accounts$
DECLARE approved record; existing public.app_user%ROWTYPE;
  proofs jsonb; proof jsonb; digest text; expiry timestamptz;
BEGIN
  BEGIN
    proofs := coalesce(nullif(current_setting('hope.dba05_setup',true),''),'{}')::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Invalid private DBA-05 setup configuration';
  END;
  IF jsonb_typeof(proofs)<>'object' THEN RAISE EXCEPTION 'Private setup configuration must be an object'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(proofs) k(email)
      WHERE NOT EXISTS(SELECT 1 FROM pg_temp._dba05_superadmin_seed s WHERE s.email=k.email)) THEN
    RAISE EXCEPTION 'Private setup configuration contains an unapproved account';
  END IF;
  FOR approved IN SELECT * FROM pg_temp._dba05_superadmin_seed ORDER BY email LOOP
    SELECT * INTO existing FROM public.app_user WHERE email=approved.email;
    IF FOUND THEN
      IF existing.role<>'superadmin' OR existing.first_name<>approved.first_name OR existing.last_name<>approved.last_name THEN
        RAISE EXCEPTION 'Approved email conflicts with an existing account identity/role; manual review required';
      END IF;
      -- Preserve passwords, pending/blocked/deleted state, proofs and sessions.
      -- An unavailable existing Superadmin is not silently reactivated.
      IF existing.blocked OR existing.is_deleted OR existing.status<>'active' THEN
        RAISE NOTICE 'Existing approved Superadmin is unavailable; security state preserved';
      END IF;
      CONTINUE;
    END IF;
    proof := proofs->approved.email;
    IF proof IS NULL OR jsonb_typeof(proof)<>'object' OR
       NOT (proof ?& ARRAY['hash','expires_at']) OR
       (SELECT count(*) FROM jsonb_object_keys(proof))<>2 OR
       coalesce(proof->>'hash','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'New approved Superadmin requires a private setup digest and expiry; no account was made claimable by email';
    END IF;
    digest := proof->>'hash';
    BEGIN expiry := (proof->>'expires_at')::timestamptz;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid private setup expiry';
    END;
    IF expiry IS NULL OR expiry<=now()+interval '5 minutes' OR expiry>now()+interval '24 hours' THEN
      RAISE EXCEPTION 'New setup proof must expire between five minutes and 24 hours from now';
    END IF;
    IF EXISTS(SELECT 1 FROM public.app_user WHERE setup_token_hash=digest) THEN
      RAISE EXCEPTION 'Setup proofs must be unique per account';
    END IF;
    INSERT INTO public.app_user(first_name,last_name,email,role,status,blocked,
      password_hash,must_change_password,setup_token_hash,setup_token_expires_at)
      VALUES(approved.first_name,approved.last_name,approved.email,'superadmin','active',false,
        NULL,true,digest,expiry);
  END LOOP;
  RAISE NOTICE 'DBA-05 approved three-account roster verified; existing security state preserved.';
END
$accounts$;
COMMIT;
