-- S1-DBA-06. Depends on DBA-03, not the unmerged DBA-05 seed task.
-- Keep the merged audit columns/actions and app.username email/text contract.
-- No data rewrites, grants, credential seeds or changes to hard-delete guards.
BEGIN;

DO $preflight$
DECLARE tbl text; expected_pk text[]; actual_pk text[]; writer oid;
BEGIN
  IF to_regprocedure('public.audit_user()') IS NULL OR
     (SELECT prorettype FROM pg_proc WHERE oid=to_regprocedure('public.audit_user()')) <> 'text'::regtype THEN
    RAISE EXCEPTION 'DBA-06 requires the DBA-03 audit_user() RETURNS text contract';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('audit_id','bigint'::regtype),('table_name','character varying'::regtype),
      ('action','character varying'::regtype),('record_key','character varying'::regtype),
      ('old_values','jsonb'::regtype),('new_values','jsonb'::regtype),
      ('action_by','text'::regtype),('action_at','timestamp with time zone'::regtype)
    ) AS expected(name,type_oid)
    WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
      WHERE a.attrelid=to_regclass('public.audit_log') AND a.attname=expected.name
        AND a.atttypid=expected.type_oid AND NOT a.attisdropped)
  ) THEN RAISE EXCEPTION 'DBA-06 requires the merged audit_log column/type contract; no table was recreated'; END IF;

  -- Refuse unexpected coverage rather than removing unrelated or duplicate triggers.
  FOREACH tbl IN ARRAY ARRAY['role','module','rights_catalogue','app_user','user_permission'] LOOP
    expected_pk := CASE tbl WHEN 'role' THEN ARRAY['role_code'] WHEN 'module' THEN ARRAY['module_code']
      WHEN 'rights_catalogue' THEN ARRAY['right_code'] WHEN 'app_user' THEN ARRAY['user_id']
      ELSE ARRAY['user_id','right_code'] END;
    SELECT array_agg(a.attname::text ORDER BY k.ord) INTO actual_pk
      FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
      WHERE i.indrelid=to_regclass('public.' || tbl) AND i.indisprimary AND k.ord<=i.indnkeyatts;
    IF actual_pk IS DISTINCT FROM expected_pk THEN
      RAISE EXCEPTION 'Unexpected or missing primary key on public.%', tbl;
    END IF;
    SELECT tgfoid INTO writer FROM pg_trigger
      WHERE tgrelid=to_regclass('public.' || tbl) AND tgname='rbac_40_audit'
        AND NOT tgisinternal AND tgenabled='O' AND tgtype IN (21,29) AND tgnargs=0;
    IF writer IS NULL OR (writer IS DISTINCT FROM to_regprocedure('public.rbac_write_audit()')
                         AND writer IS DISTINCT FROM to_regprocedure('public.log_audit_event()')) THEN
      RAISE EXCEPTION 'Unexpected or missing rbac_40_audit trigger on public.%', tbl;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
       WHERE t.tgrelid=to_regclass('public.' || tbl) AND NOT t.tgisinternal
         AND t.tgname<>'rbac_40_audit' AND p.proname IN ('rbac_write_audit','trg_audit_log','log_audit_event')) THEN
      RAISE EXCEPTION 'Overlapping audit writers on public.%; resolve coverage before applying DBA-06', tbl;
    END IF;
  END LOOP;
END
$preflight$;

-- Recursive key-based redaction covers existing account fields and nested future
-- payloads. Safe control flags remain useful metadata; secret values never do.
-- Future sensitive columns must follow these conventions or extend this filter
-- in a later migration with tests before attaching the generic writer.
CREATE OR REPLACE FUNCTION public.audit_redact(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $redact$
DECLARE result jsonb; name text; normalized text; value jsonb;
BEGIN
  IF payload IS NULL THEN RETURN NULL; END IF;
  CASE jsonb_typeof(payload)
    WHEN 'object' THEN
      result := '{}'::jsonb;
      FOR name,value IN SELECT * FROM jsonb_each(payload) LOOP
        normalized := regexp_replace(lower(name),'[^a-z0-9]','','g');
        IF normalized NOT IN ('mustchangepassword','sessionversion') AND
           (normalized ~ '(password|token|secret|credential|session|recoverycode)' OR normalized IN ('sid','sess','otp')) THEN
          CONTINUE;
        END IF;
        result := result || jsonb_build_object(name,public.audit_redact(value));
      END LOOP;
      RETURN result;
    WHEN 'array' THEN
      result := '[]'::jsonb;
      FOR value IN SELECT * FROM jsonb_array_elements(payload) LOOP
        result := result || jsonb_build_array(public.audit_redact(value));
      END LOOP;
      RETURN result;
    ELSE RETURN payload;
  END CASE;
END
$redact$;

-- Generic AFTER ROW writer; PostgreSQL's actual primary key determines identity.
-- Existing scalar / pipe-delimited composite record_key conventions stay intact.
-- No SECURITY DEFINER: missing audit privileges fail the business transaction.
CREATE OR REPLACE FUNCTION public.log_audit_event() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $audit$
DECLARE
  before_row jsonb; after_row jsonb; identity_row jsonb;
  operation text; key_name text; key_value text; identity_key text;
BEGIN
  IF TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' OR TG_NARGS<>0 THEN
    RAISE EXCEPTION 'log_audit_event requires an AFTER ROW trigger with no arguments';
  END IF;
  IF TG_TABLE_NAME IN ('audit_log','auth_session','password_reset_token') THEN
    RAISE EXCEPTION 'Business audit writer cannot audit history or technical credential tables';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN before_row := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN after_row := to_jsonb(NEW); END IF;
  IF TG_OP='UPDATE' AND (before_row-'stamp') IS NOT DISTINCT FROM (after_row-'stamp') THEN RETURN NULL; END IF;
  operation := CASE WHEN TG_OP='INSERT' THEN 'ADD' WHEN TG_OP='DELETE' THEN 'DELETE'
    WHEN coalesce(before_row->'is_deleted','false'::jsonb)='false'::jsonb AND after_row->'is_deleted'='true'::jsonb THEN 'DELETE'
    WHEN before_row->'is_deleted'='true'::jsonb AND after_row->'is_deleted'='false'::jsonb THEN 'RESTORE'
    ELSE 'EDIT' END;
  identity_row := coalesce(after_row,before_row);
  FOR key_name IN
    SELECT a.attname FROM pg_index i
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
      WHERE i.indrelid=TG_RELID AND i.indisprimary AND k.ord<=i.indnkeyatts ORDER BY k.ord
  LOOP
    -- Fail closed without including a sensitive or ambiguous key in diagnostics.
    IF NOT (public.audit_redact(jsonb_build_object(key_name,NULL)) ? key_name) THEN
      RAISE EXCEPTION 'Audit record identity cannot contain a sensitive field';
    END IF;
    key_value := identity_row->>key_name;
    IF key_value IS NULL OR position('|' IN key_value)>0 THEN
      RAISE EXCEPTION 'Audit primary-key value is missing or incompatible with record_key encoding';
    END IF;
    identity_key := concat_ws('|',identity_key,key_value);
  END LOOP;
  IF identity_key IS NULL OR length(identity_key)>60 OR length(TG_TABLE_NAME)>30 THEN
    RAISE EXCEPTION 'Audited relation requires a primary key and identity within the existing audit_log limits';
  END IF;
  INSERT INTO public.audit_log(table_name,action,record_key,old_values,new_values,action_by)
    VALUES(TG_TABLE_NAME,operation,identity_key,public.audit_redact(before_row),public.audit_redact(after_row),public.audit_user());
  RETURN NULL;
END
$audit$;

DO $attach$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['role','module','rights_catalogue','app_user','user_permission'] LOOP
    -- Keep existing names, stamp/link/version triggers, and delete/truncate guards.
    -- A rerun leaves an already-correct installation alone.
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.' || tbl)
        AND tgname='rbac_40_audit' AND tgfoid='public.log_audit_event()'::regprocedure AND tgtype=29) THEN
      EXECUTE format('DROP TRIGGER rbac_40_audit ON public.%I',tbl);
      EXECUTE format('CREATE TRIGGER rbac_40_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()',tbl);
    END IF;
  END LOOP;
END
$attach$;
COMMIT;
