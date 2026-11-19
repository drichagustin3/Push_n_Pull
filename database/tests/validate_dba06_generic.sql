-- DBA-06 generic-writer coverage; all fixture tables, rows and triggers roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_audit(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Generic audit verification failed: %',message; END IF;
END $$;
CREATE TEMP TABLE dba06_generic (
  tenant text, sequence_no integer, label text, is_deleted boolean NOT NULL DEFAULT false,
  password_hash text, reset_token_hash text, session_id text, credentials jsonb,
  metadata jsonb, PRIMARY KEY(tenant,sequence_no)
);
CREATE TRIGGER verify_generic AFTER INSERT OR UPDATE OR DELETE ON dba06_generic
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TEMP TABLE dba06_no_pk (label text);
CREATE TRIGGER verify_generic AFTER INSERT ON dba06_no_pk FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TEMP TABLE dba06_secret_key (token_hash text PRIMARY KEY);
CREATE TRIGGER verify_generic AFTER INSERT ON dba06_secret_key FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();
CREATE TEMP TABLE dba06_plain (code integer PRIMARY KEY,label text);
CREATE TRIGGER verify_generic AFTER INSERT OR UPDATE OR DELETE ON dba06_plain
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DO $test$
DECLARE event public.audit_log%ROWTYPE; n bigint; original_count bigint;
BEGIN
  PERFORM set_config('app.username','dba06-generic@example.test',true);
  INSERT INTO dba06_generic(tenant,sequence_no,label,password_hash,reset_token_hash,session_id,credentials,metadata)
    VALUES('tenant',1,'Before','synthetic password material','synthetic reset material','synthetic session material',
      '{"private":"synthetic credential material"}',
      '{"visible":true,"nested":{"passwordHash":"synthetic","safe":1},"items":[{"accessToken":"synthetic","safe":null}]}');
  SELECT * INTO event FROM public.audit_log WHERE table_name='dba06_generic' AND record_key='tenant|1' ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='ADD' AND event.action_by=public.audit_user()
    AND event.old_values IS NULL AND event.new_values->>'label'='Before', 'generic insert and discovered composite PK');
  PERFORM pg_temp.assert_audit(NOT(event.new_values ?| ARRAY['password_hash','reset_token_hash','session_id','credentials'])
    AND event.new_values->'metadata'='{"visible":true,"nested":{"safe":1},"items":[{"safe":null}]}'::jsonb,
    'recursive object/array secret redaction');

  SELECT count(*) INTO n FROM public.audit_log;
  UPDATE dba06_generic SET password_hash='changed synthetic material' WHERE tenant='tenant' AND sequence_no=1;
  SELECT * INTO event FROM public.audit_log ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log)=n+1 AND event.action='EDIT'
    AND NOT(event.old_values ? 'password_hash') AND NOT(event.new_values ? 'password_hash'),
    'sensitive-only changes remain auditable without values');
  UPDATE dba06_generic SET label='After' WHERE tenant='tenant' AND sequence_no=1;
  SELECT * INTO event FROM public.audit_log ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.old_values->>'label'='Before' AND event.new_values->>'label'='After', 'generic update state');
  UPDATE dba06_generic SET is_deleted=true WHERE tenant='tenant' AND sequence_no=1;
  SELECT * INTO event FROM public.audit_log ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='DELETE' AND NOT(event.old_values ? 'password_hash')
    AND NOT(event.new_values ? 'password_hash'),'generic soft-delete redaction');
  UPDATE dba06_generic SET is_deleted=false WHERE tenant='tenant' AND sequence_no=1;
  SELECT * INTO event FROM public.audit_log ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='RESTORE' AND NOT(event.old_values ? 'reset_token_hash')
    AND NOT(event.new_values ? 'reset_token_hash'),'generic restore redaction');
  DELETE FROM dba06_generic WHERE tenant='tenant' AND sequence_no=1;
  SELECT * INTO event FROM public.audit_log ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='DELETE' AND event.old_values->>'label'='After'
    AND event.new_values IS NULL AND NOT(event.old_values ?| ARRAY['password_hash','reset_token_hash','session_id','credentials']),
    'permitted hard delete captures only scrubbed OLD state');

  -- Tables with no soft-delete field use EDIT, not account-status assumptions.
  INSERT INTO dba06_plain VALUES(1,NULL);
  UPDATE dba06_plain SET label='visible' WHERE code=1;
  SELECT * INTO event FROM public.audit_log ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='EDIT', 'plain table without is_deleted');
  UPDATE dba06_plain SET label=NULL WHERE code=1;
  SELECT count(*) INTO n FROM public.audit_log;
  UPDATE dba06_plain SET label=NULL WHERE code=1;
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log)=n,'NULL-safe no-op comparison');

  SELECT count(*) INTO original_count FROM public.audit_log;
  BEGIN INSERT INTO dba06_no_pk VALUES('unsafe');
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='missing PK was accepted';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  BEGIN INSERT INTO dba06_secret_key VALUES('synthetic secret');
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='sensitive PK was accepted';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  BEGIN INSERT INTO dba06_generic(tenant,sequence_no) VALUES('ambiguous|key',2);
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='ambiguous PK was accepted';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  BEGIN INSERT INTO dba06_generic(tenant,sequence_no) VALUES(repeat('x',61),2);
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='oversized PK was accepted';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log)=original_count
    AND NOT EXISTS(SELECT FROM dba06_no_pk) AND NOT EXISTS(SELECT FROM dba06_secret_key)
    AND NOT EXISTS(SELECT FROM dba06_generic),'invalid identities fail mutation and audit atomically');
  RAISE NOTICE 'PASS: reusable PK discovery, hard delete, recursive redaction, sensitive-only updates, NULL/no-op and invalid-key rollback';
END
$test$;
ROLLBACK;
