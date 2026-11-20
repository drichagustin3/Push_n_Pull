-- S1-DBA-06 behavioral verification of the established audit contract.
-- Run only against an isolated migrated local database. Fixtures and DDL roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_audit(ok boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Audit verification failed: %', message; END IF;
END $$;

DO $test$
DECLARE
  target bigint;
  key text;
  before_count bigint;
  initial_stamp text;
  event public.audit_log%ROWTYPE;
  bad_context text;
BEGIN
  PERFORM set_config('app.username', '  dba06-actor@example.test  ', true);
  PERFORM pg_temp.assert_audit(public.audit_user()='dba06-actor@example.test', 'transaction actor');
  INSERT INTO public.app_user(first_name,last_name,email,status)
    VALUES('DBA06','Disposable', 'dba06-' || txid_current() || '@example.test','active') RETURNING user_id INTO target;
  SELECT * INTO event FROM public.audit_log WHERE table_name='app_user' AND record_key=target::text ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='ADD' AND event.action_by=public.audit_user()
    AND event.old_values IS NULL AND event.new_values->>'first_name'='DBA06'
    AND event.action_at=current_timestamp, 'insert state, key, actor and timestamp');

  UPDATE public.app_user SET last_name='Changed' WHERE user_id=target;
  SELECT * INTO event FROM public.audit_log WHERE table_name='app_user' AND record_key=target::text ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='EDIT' AND event.old_values->>'last_name'='Disposable'
    AND event.new_values->>'last_name'='Changed', 'update before/after state');

  -- Safe synthetic digest: no real token exists, and no credential value is printed.
  UPDATE public.app_user SET must_change_password=true,setup_token_hash=md5(random()::text)||md5(random()::text),
    setup_token_expires_at=now()+interval '1 hour' WHERE user_id=target;
  SELECT * INTO event FROM public.audit_log WHERE table_name='app_user' AND record_key=target::text ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(NOT (event.old_values ?| ARRAY['password_hash','setup_token_hash','setup_token_expires_at'])
    AND NOT (event.new_values ?| ARRAY['password_hash','setup_token_hash','setup_token_expires_at']), 'account secrets absent from audit JSON');

  key := target::text || '|customer.add';
  INSERT INTO public.user_permission(user_id,right_code) VALUES(target,'customer.add');
  SELECT * INTO event FROM public.audit_log WHERE table_name='user_permission' AND record_key=key ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='ADD' AND event.action_by=public.audit_user()
    AND event.new_values->>'user_id'=target::text AND event.new_values->>'right_code'='customer.add', 'permission grant, actor and composite key');
  SELECT stamp INTO initial_stamp FROM public.user_permission WHERE user_id=target AND right_code='customer.add';
  PERFORM pg_temp.assert_audit(initial_stamp LIKE 'ADD dba06-actor@example.test %', 'permission stamp actor/action/time');

  SELECT count(*) INTO before_count FROM public.audit_log;
  UPDATE public.user_permission SET is_deleted=is_deleted WHERE user_id=target AND right_code='customer.add';
  UPDATE public.app_user SET stamp=stamp WHERE user_id=target;
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log)=before_count, 'no duplicate events for no-op or explicit stamp touch');

  UPDATE public.user_permission SET is_deleted=true WHERE user_id=target AND right_code='customer.add';
  SELECT * INTO event FROM public.audit_log WHERE table_name='user_permission' AND record_key=key ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='DELETE' AND event.old_values->>'is_deleted'='false'
    AND event.new_values->>'is_deleted'='true', 'soft delete classification');
  UPDATE public.user_permission SET is_deleted=false WHERE user_id=target AND right_code='customer.add';
  SELECT * INTO event FROM public.audit_log WHERE table_name='user_permission' AND record_key=key ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='RESTORE', 'restore classification');
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log WHERE table_name='user_permission' AND record_key=key)=3,
    'exactly one event per grant/revoke/restore');

  SELECT count(*) INTO before_count FROM public.audit_log;
  BEGIN
    UPDATE public.app_user SET first_name='MustRollback' WHERE user_id=target;
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='controlled rollback';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log)=before_count
    AND (SELECT first_name FROM public.app_user WHERE user_id=target)='DBA06', 'mutation and audit rollback together');

  BEGIN
    DELETE FROM public.user_permission WHERE user_id=target AND right_code='customer.add';
    RAISE EXCEPTION 'Hard-delete protection failed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log)=before_count, 'blocked hard delete produces no event');

  -- Exercise the remaining approved trigger targets without persistent seed changes.
  INSERT INTO public.module(module_code,description) VALUES('dba_audit_fixture','Audit fixture');
  INSERT INTO public.rights_catalogue(right_code,module_code,description)
    VALUES('dba06.verify','dba_audit_fixture','Audit fixture');
  UPDATE public.rights_catalogue SET is_deleted=true WHERE right_code='dba06.verify';
  UPDATE public.module SET is_deleted=true WHERE module_code='dba_audit_fixture';
  UPDATE public.module SET is_deleted=false WHERE module_code='dba_audit_fixture';
  UPDATE public.rights_catalogue SET is_deleted=false WHERE right_code='dba06.verify';
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log WHERE table_name='module'
    AND record_key='dba_audit_fixture' AND action_by=public.audit_user())=3,'module trigger coverage');
  PERFORM pg_temp.assert_audit((SELECT count(*) FROM public.audit_log WHERE table_name='rights_catalogue'
    AND record_key='dba06.verify' AND action_by=public.audit_user())=3,'catalogue trigger coverage');
  UPDATE public.role SET description=description || ' audit fixture' WHERE role_code='user';
  SELECT * INTO event FROM public.audit_log WHERE table_name='role' AND record_key='user' ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action='EDIT' AND event.action_by=public.audit_user()
    AND event.new_values->>'description'=(event.old_values->>'description') || ' audit fixture','role trigger coverage');

  PERFORM set_config('app.username','',true);
  PERFORM pg_temp.assert_audit(public.audit_user()=session_user::text,'documented database-login fallback');
  UPDATE public.app_user SET last_name='DatabaseOperation' WHERE user_id=target;
  SELECT * INTO event FROM public.audit_log WHERE table_name='app_user' AND record_key=target::text ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action_by=session_user::text,'system mutation uses documented database actor fallback');
  -- The actor contract is text (email/username), not a bigint cast.
  PERFORM set_config('app.username','not-a-numeric-id',true);
  PERFORM pg_temp.assert_audit(public.audit_user()='not-a-numeric-id','text context cannot cause numeric casting failures');
  UPDATE public.app_user SET last_name='TextContext' WHERE user_id=target;
  SELECT * INTO event FROM public.audit_log WHERE table_name='app_user' AND record_key=target::text ORDER BY audit_id DESC LIMIT 1;
  PERFORM pg_temp.assert_audit(event.action_by='not-a-numeric-id','text context mutation has no unsafe numeric cast');
  FOREACH bad_context IN ARRAY ARRAY['', '   ', E'forged\nactor', E'forged\tactor', repeat('x',255)] LOOP
    PERFORM set_config('app.username',bad_context,true);
    UPDATE public.app_user SET last_name='Fallback '||length(bad_context)::text WHERE user_id=target;
    PERFORM pg_temp.assert_audit(public.audit_user()=session_user::text,'invalid/empty context has safe database fallback');
    SELECT * INTO event FROM public.audit_log WHERE table_name='app_user' AND record_key=target::text ORDER BY audit_id DESC LIMIT 1;
    PERFORM pg_temp.assert_audit(event.action_by=session_user::text,'invalid context cannot forge a persisted actor');
  END LOOP;
  RAISE NOTICE 'PASS: actor, insert/update, composite key, redaction, no-op, grant/revoke/restore, hard-delete guard and rollback';
END
$test$;
ROLLBACK;
DO $$
BEGIN
  IF public.audit_user() <> session_user::text THEN
    RAISE EXCEPTION 'Transaction-local actor leaked to the next transaction';
  END IF;
  RAISE NOTICE 'PASS: transaction-local context does not leak';
END $$;
