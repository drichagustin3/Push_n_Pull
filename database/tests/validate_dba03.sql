-- Run after the real migrations in a disposable local hopedb. All fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.rejects(command text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> ALL(string_to_array(expected_state, ',')) THEN RAISE EXCEPTION 'Unexpected SQLSTATE %: %', SQLSTATE, SQLERRM; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection: %', command; END IF;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=36 FROM rights_catalogue WHERE NOT is_deleted), '36 active rights');
SELECT pg_temp.assert_true((SELECT jsonb_object_agg(module_code,n) = '{"customer":3,"product":6,"human_resources":13,"sales":7,"reports":7}'::jsonb FROM (SELECT module_code,count(*) n FROM rights_catalogue GROUP BY module_code) counts), 'module distribution');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM role), 'three roles');
SELECT pg_temp.assert_true((SELECT count(*)=5 FROM module), 'five modules');
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('role','module','rights_catalogue','app_user','user_permission','auth_session','audit_log') AND relrowsecurity), 'RLS on all sensitive tables');
SELECT set_config('app.username', repeat('long_actor_', 8) || '@example.test', true);
INSERT INTO app_user(first_name,last_name,email,password_hash)
  VALUES ('Schema','Fixture','schema-fixture@example.test', '$2b$12$' || repeat('a',53)) RETURNING user_id AS fixture_id \gset
SELECT pg_temp.assert_true((SELECT status='pending' AND role='user' AND NOT blocked AND NOT is_deleted AND session_version=0 FROM app_user WHERE user_id=:fixture_id), 'safe registration defaults');
SELECT pg_temp.assert_true((SELECT stamp LIKE 'ADD long_actor_%' FROM app_user WHERE user_id=:fixture_id), 'actor stamp');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email) VALUES ('X','Y','schema-fixture@example.test')$q$, '23505');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email) VALUES ('X','Y','SCHEMA-FIXTURE@example.test')$q$, '23514');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email,status) VALUES ('X','Y','bad-status@example.test','blocked')$q$, '23514');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email,role) VALUES ('X','Y','bad-role@example.test','owner')$q$, '23514');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email,password_hash) VALUES ('X','Y','plaintext@example.test','plaintext')$q$, '23514');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email,password_hash) VALUES ('X','Y','weak-cost@example.test','$2b$04$' || repeat('a',53))$q$, '23514');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email,empno) VALUES ('X','Y','bad-employee@example.test','99999')$q$, '23503');
SELECT pg_temp.rejects($q$INSERT INTO app_user(first_name,last_name,email,setup_token_hash) VALUES ('X','Y','bad-token@example.test',repeat('a',64))$q$, '23514');
SELECT pg_temp.rejects($q$INSERT INTO rights_catalogue(right_code,module_code,description) VALUES ('bad.right','unknown','Bad')$q$, '23514');
INSERT INTO user_permission(user_id,right_code) VALUES (:fixture_id,'customer.add');
SELECT pg_temp.rejects(format('INSERT INTO user_permission(user_id,right_code) VALUES (%s,''customer.add'')',:fixture_id), '23505');
SELECT pg_temp.rejects($q$UPDATE role SET is_deleted=true WHERE role_code='user'$q$, '23514');
SELECT pg_temp.rejects($q$UPDATE module SET is_deleted=true WHERE module_code='customer'$q$, '23514');
SELECT pg_temp.rejects($q$UPDATE rights_catalogue SET is_deleted=true WHERE right_code='customer.add'$q$, '23514');
SELECT pg_temp.rejects(format('UPDATE app_user SET is_deleted=true WHERE user_id=%s',:fixture_id), '23514');
UPDATE user_permission SET is_deleted=true WHERE user_id=:fixture_id AND right_code='customer.add';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM user_permission_active WHERE user_id=:fixture_id), 'revoked assignment hidden');
UPDATE rights_catalogue SET is_deleted=true WHERE right_code='customer.add';
SELECT pg_temp.rejects(format('UPDATE user_permission SET is_deleted=false WHERE user_id=%s',:fixture_id), '23514');
UPDATE rights_catalogue SET is_deleted=false WHERE right_code='customer.add';
UPDATE user_permission SET is_deleted=false WHERE user_id=:fixture_id AND right_code='customer.add';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM user_permission_active WHERE user_id=:fixture_id), 'restore retains assignment identity');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM audit_log WHERE table_name='user_permission' AND record_key=:fixture_id || '|customer.add' AND action='DELETE'), 'revocation audited');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM audit_log WHERE table_name='user_permission' AND record_key=:fixture_id || '|customer.add' AND action='RESTORE'), 'restore audited');
UPDATE user_permission SET is_deleted=true WHERE user_id=:fixture_id;
UPDATE app_user SET is_deleted=true WHERE user_id=:fixture_id;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app_user_active WHERE user_id=:fixture_id), 'deleted user hidden');
SELECT pg_temp.rejects(format('UPDATE user_permission SET is_deleted=false WHERE user_id=%s',:fixture_id), '23514');
UPDATE app_user SET is_deleted=false WHERE user_id=:fixture_id;
UPDATE app_user SET blocked=true WHERE user_id=:fixture_id;
SELECT pg_temp.assert_true((SELECT session_version=3 FROM app_user WHERE user_id=:fixture_id), 'delete restore block increment versions');
UPDATE app_user SET blocked=false WHERE user_id=:fixture_id;
SELECT pg_temp.assert_true((SELECT session_version=4 FROM app_user WHERE user_id=:fixture_id), 'unblocking cannot resurrect an old version');
UPDATE app_user SET session_version=session_version+1, must_change_password=true WHERE user_id=:fixture_id;
SELECT pg_temp.assert_true((SELECT session_version=5 FROM app_user WHERE user_id=:fixture_id), 'explicit increment is not doubled');
SELECT pg_temp.rejects(format('UPDATE app_user SET session_version=0 WHERE user_id=%s',:fixture_id), '23514');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM audit_log WHERE new_values ?| array['password_hash','setup_token_hash','setup_token_expires_at'] OR old_values ?| array['password_hash','setup_token_hash','setup_token_expires_at']), 'credentials redacted');
SELECT pg_temp.assert_true((SELECT bool_and(action_by=current_setting('app.username')) FROM audit_log WHERE table_name='app_user' AND record_key=:'fixture_id'), 'untruncated authenticated audit actor');
SELECT pg_temp.rejects(format('DELETE FROM app_user WHERE user_id=%s',:fixture_id), '23514');
SELECT pg_temp.rejects('TRUNCATE user_permission','23514');
SELECT pg_temp.rejects('DELETE FROM audit_log','23514,P0001');
SELECT pg_temp.rejects('TRUNCATE audit_log','23514,P0001');
INSERT INTO auth_session(sid,sess,expire) VALUES ('schema-validation','{}',now()+interval '1 hour');
DELETE FROM auth_session WHERE sid='schema-validation';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM auth_session WHERE sid='schema-validation'), 'technical session rows remain deletable');
CREATE ROLE hope_dba03_probe NOLOGIN;
SET LOCAL ROLE hope_dba03_probe;
SELECT pg_temp.rejects('SELECT * FROM public.app_user','42501');
SELECT pg_temp.rejects('SELECT * FROM public.app_user_active','42501');
SELECT pg_temp.rejects('SELECT * FROM public.auth_session','42501');
RESET ROLE;
ROLLBACK;
\echo 'PASS: DBA-03 constraints, rights, soft delete/restore, revocation, audit redaction, RLS, and session cleanup'
