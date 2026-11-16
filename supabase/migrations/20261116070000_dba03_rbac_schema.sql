-- S1-DBA-03: RBAC/account schema. No application code or credential seeds.
-- Depends on DBA-02 employee. auth_session explicitly authorized as a supporting table.
BEGIN;

-- Compatible with HopeDB_audit.sql.txt; preserve any already-installed audit_user().
CREATE TABLE IF NOT EXISTS public.audit_log (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name varchar(30) NOT NULL,
  action varchar(7) NOT NULL CHECK (action IN ('ADD','EDIT','DELETE','RESTORE')),
  record_key varchar(60), old_values jsonb, new_values jsonb,
  action_by text NOT NULL, action_at timestamptz NOT NULL DEFAULT now()
);
-- Verified email actors may exceed the reference's 50-character actor field.
ALTER TABLE public.audit_log ALTER COLUMN action_by TYPE text;
DO $outer$
BEGIN
  IF to_regprocedure('public.audit_user()') IS NULL THEN
    EXECUTE $ddl$CREATE FUNCTION public.audit_user() RETURNS text LANGUAGE sql STABLE AS
      $body$ SELECT coalesce(nullif(current_setting('app.username', true), ''), session_user::text) $body$ $ddl$;
  END IF;
END $outer$;

CREATE TABLE public.role (
  role_code text PRIMARY KEY CHECK (role_code IN ('user','admin','superadmin')),
  description text NOT NULL CHECK (btrim(description) <> ''),
  is_deleted boolean NOT NULL DEFAULT false, stamp text NOT NULL DEFAULT ''
);
CREATE TABLE public.module (
  module_code text PRIMARY KEY CHECK (module_code ~ '^[a-z][a-z_]*$'),
  description text NOT NULL CHECK (btrim(description) <> ''),
  is_deleted boolean NOT NULL DEFAULT false, stamp text NOT NULL DEFAULT ''
);
CREATE TABLE public.rights_catalogue (
  right_code varchar(50) PRIMARY KEY,
  module_code text NOT NULL REFERENCES public.module(module_code),
  description text NOT NULL CHECK (btrim(description) <> ''),
  is_deleted boolean NOT NULL DEFAULT false, stamp text NOT NULL DEFAULT ''
);
CREATE INDEX rights_catalogue_module_idx ON public.rights_catalogue(module_code);
CREATE TABLE public.app_user (
  user_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name varchar(100) NOT NULL CHECK (btrim(first_name) <> ''),
  last_name varchar(100) NOT NULL CHECK (btrim(last_name) <> ''),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  password_hash varchar(60) CHECK (password_hash IS NULL OR password_hash ~ '^\$2[ab]\$(1[2-9]|2[0-9]|3[01])\$[./A-Za-z0-9]{53}$'),
  role text NOT NULL DEFAULT 'user' REFERENCES public.role(role_code),
  blocked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive')),
  empno varchar(5) REFERENCES public.employee(empno),
  must_change_password boolean NOT NULL DEFAULT false,
  setup_token_hash varchar(64) CHECK (setup_token_hash IS NULL OR setup_token_hash ~ '^[a-f0-9]{64}$'),
  setup_token_expires_at timestamptz,
  session_version integer NOT NULL DEFAULT 0 CHECK (session_version >= 0),
  is_deleted boolean NOT NULL DEFAULT false, stamp text NOT NULL DEFAULT '',
  CHECK ((setup_token_hash IS NULL) = (setup_token_expires_at IS NULL)),
  CHECK (setup_token_hash IS NULL OR must_change_password OR password_hash IS NULL)
);
CREATE INDEX app_user_role_idx ON public.app_user(role);
CREATE INDEX app_user_empno_idx ON public.app_user(empno);
CREATE TABLE public.user_permission (
  user_id bigint NOT NULL REFERENCES public.app_user(user_id),
  right_code varchar(50) NOT NULL REFERENCES public.rights_catalogue(right_code),
  is_deleted boolean NOT NULL DEFAULT false, stamp text NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, right_code)
);
CREATE INDEX user_permission_right_idx ON public.user_permission(right_code);

-- Technical session rows expire and must be physically removed by the store.
CREATE TABLE public.auth_session (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX auth_session_expire_idx ON public.auth_session(expire);

CREATE FUNCTION public.rbac_block_hard_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = TG_TABLE_NAME || ' is protected against hard deletion/truncation';
END $$;
CREATE TRIGGER rbac_audit_protect BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.rbac_block_hard_delete();
CREATE TRIGGER rbac_audit_protect_truncate BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.rbac_block_hard_delete();

CREATE FUNCTION public.rbac_revoke_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.session_version < OLD.session_version THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'session_version cannot decrease';
  END IF;
  IF ROW(NEW.email, NEW.role, NEW.blocked, NEW.status, NEW.is_deleted, NEW.password_hash,
         NEW.must_change_password, NEW.setup_token_hash, NEW.setup_token_expires_at)
     IS DISTINCT FROM
     ROW(OLD.email, OLD.role, OLD.blocked, OLD.status, OLD.is_deleted, OLD.password_hash,
         OLD.must_change_password, OLD.setup_token_hash, OLD.setup_token_expires_at) THEN
    NEW.session_version := greatest(NEW.session_version, OLD.session_version + 1);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rbac_10_version BEFORE UPDATE ON public.app_user
  FOR EACH ROW EXECUTE FUNCTION public.rbac_revoke_sessions();

-- Parent row SHARE locks serialize assignment/restore against parent soft deletion.
CREATE FUNCTION public.rbac_check_links() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.is_deleted THEN
    CASE TG_TABLE_NAME
      WHEN 'app_user' THEN
        PERFORM 1 FROM public.role WHERE role_code = NEW.role AND NOT is_deleted FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Role is unavailable'; END IF;
      WHEN 'rights_catalogue' THEN
        PERFORM 1 FROM public.module WHERE module_code = NEW.module_code AND NOT is_deleted FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Module is unavailable'; END IF;
      WHEN 'user_permission' THEN
        PERFORM 1 FROM public.app_user WHERE user_id=NEW.user_id AND NOT is_deleted FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Account is unavailable'; END IF;
        PERFORM 1 FROM public.rights_catalogue WHERE right_code=NEW.right_code AND NOT is_deleted FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Right is unavailable'; END IF;
      ELSE NULL;
    END CASE;
  END IF;
  IF TG_OP='UPDATE' AND NEW.is_deleted AND NOT OLD.is_deleted THEN
    CASE TG_TABLE_NAME
      WHEN 'role' THEN
        IF EXISTS (SELECT 1 FROM public.app_user WHERE role=OLD.role_code AND NOT is_deleted) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Role has active accounts'; END IF;
      WHEN 'module' THEN
        IF EXISTS (SELECT 1 FROM public.rights_catalogue WHERE module_code=OLD.module_code AND NOT is_deleted) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Module has active rights'; END IF;
      WHEN 'rights_catalogue' THEN
        IF EXISTS (SELECT 1 FROM public.user_permission WHERE right_code=OLD.right_code AND NOT is_deleted) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Right has active assignments'; END IF;
      WHEN 'app_user' THEN
        IF EXISTS (SELECT 1 FROM public.user_permission WHERE user_id=OLD.user_id AND NOT is_deleted) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Account has active assignments'; END IF;
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.rbac_set_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE action text;
BEGIN
  IF TG_OP='INSERT' THEN action := 'ADD';
  ELSIF NEW.is_deleted AND NOT OLD.is_deleted THEN action := 'DELETE';
  ELSIF NOT NEW.is_deleted AND OLD.is_deleted THEN action := 'RESTORE';
  ELSE action := 'EDIT'; END IF;
  NEW.stamp := action || ' ' || public.audit_user() || ' ' ||
    to_char(current_timestamp AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS');
  RETURN NEW;
END $$;

CREATE FUNCTION public.rbac_write_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_row jsonb; after_row jsonb; action text; record_key text;
BEGIN
  -- Never persist password/token material or session contents in audit history.
  after_row := to_jsonb(NEW) - 'password_hash' - 'setup_token_hash' - 'setup_token_expires_at';
  IF TG_OP='UPDATE' THEN
    before_row := to_jsonb(OLD) - 'password_hash' - 'setup_token_hash' - 'setup_token_expires_at';
    IF (to_jsonb(OLD) - 'stamp') = (to_jsonb(NEW) - 'stamp') THEN RETURN NULL; END IF;
  END IF;
  action := CASE WHEN TG_OP='INSERT' THEN 'ADD'
    WHEN NEW.is_deleted AND NOT OLD.is_deleted THEN 'DELETE'
    WHEN NOT NEW.is_deleted AND OLD.is_deleted THEN 'RESTORE' ELSE 'EDIT' END;
  record_key := CASE TG_TABLE_NAME
    WHEN 'role' THEN after_row->>'role_code'
    WHEN 'module' THEN after_row->>'module_code'
    WHEN 'rights_catalogue' THEN after_row->>'right_code'
    WHEN 'app_user' THEN after_row->>'user_id'
    ELSE (after_row->>'user_id') || '|' || (after_row->>'right_code') END;
  INSERT INTO public.audit_log(table_name, action, record_key, old_values, new_values, action_by)
    VALUES(TG_TABLE_NAME, action, record_key, before_row, after_row, public.audit_user());
  RETURN NULL;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['role','module','rights_catalogue','app_user','user_permission'] LOOP
    EXECUTE format('CREATE TRIGGER rbac_20_links BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rbac_check_links()', tbl);
    EXECUTE format('CREATE TRIGGER rbac_30_stamp BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rbac_set_stamp()', tbl);
    EXECUTE format('CREATE TRIGGER rbac_40_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rbac_write_audit()', tbl);
    EXECUTE format('CREATE TRIGGER rbac_no_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.rbac_block_hard_delete()', tbl);
    EXECUTE format('CREATE TRIGGER rbac_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.rbac_block_hard_delete()', tbl);
    EXECUTE format('CREATE VIEW public.%I WITH (security_invoker=true) AS SELECT * FROM public.%I WHERE NOT is_deleted', tbl || '_active', tbl);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

INSERT INTO public.role(role_code, description) VALUES ('user','User'),('admin','Admin'),('superadmin','Superadmin');
INSERT INTO public.module(module_code, description) VALUES
 ('customer','Customer'),('product','Product'),('human_resources','Human Resources'),('sales','Sales'),('reports','Reports');
INSERT INTO public.rights_catalogue(right_code, module_code, description) VALUES
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
  ('report.top_sales','reports','Top Sales');

-- Backend owner/trusted DB role only; no direct Supabase browser access or default grants.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_session ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.role, public.module, public.rights_catalogue, public.app_user,
  public.user_permission, public.auth_session, public.audit_log FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.app_user_user_id_seq, public.audit_log_audit_id_seq FROM PUBLIC;
DO $$
DECLARE api_role text; obj text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      FOREACH obj IN ARRAY ARRAY['role','module','rights_catalogue','app_user','user_permission',
        'auth_session','audit_log','role_active','module_active','rights_catalogue_active','app_user_active','user_permission_active'] LOOP
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', obj, api_role);
      END LOOP;
      EXECUTE format('REVOKE ALL ON SEQUENCE public.app_user_user_id_seq, public.audit_log_audit_id_seq FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
