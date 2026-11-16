-- Local migrated hopedb only. All fixtures, including test DB role, roll back.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END $$;
CREATE FUNCTION pg_temp.rejects(command text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false;
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected_state THEN RAISE EXCEPTION 'Unexpected SQLSTATE %: %', SQLSTATE, SQLERRM; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection: %', command; END IF;
END $$;
INSERT INTO app_user(first_name,last_name,email)
  VALUES ('Reset','Schema fixture','reset-' || gen_random_uuid()::text || '@example.test') RETURNING user_id AS fixture_id \gset
INSERT INTO password_reset_token(user_id,token_hash)
  VALUES (:fixture_id, encode(sha256('dba04-active-fixture'::bytea),'hex')) RETURNING id AS active_id \gset
INSERT INTO password_reset_token(user_id,token_hash,created_at,expires_at)
  VALUES (:fixture_id, encode(sha256('dba04-expired-fixture'::bytea),'hex'), CURRENT_TIMESTAMP-interval '2 hours', CURRENT_TIMESTAMP-interval '1 hour') RETURNING id AS expired_id \gset
INSERT INTO password_reset_token(user_id,token_hash,is_used,used_at)
  VALUES (:fixture_id, encode(sha256('dba04-used-fixture'::bytea),'hex'), true, CURRENT_TIMESTAMP) RETURNING id AS used_id \gset
SELECT pg_temp.assert_true((SELECT NOT is_used AND used_at IS NULL AND expires_at-created_at=interval '1 hour' FROM password_reset_token WHERE id=:active_id), 'one-hour defaults and unused state');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM password_reset_token WHERE user_id=:fixture_id AND NOT is_used AND expires_at>clock_timestamp()), 'active excludes expired and redeemed tokens');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM password_reset_token WHERE user_id=:fixture_id), 'three distinct lifecycle fixtures');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM pg_constraint WHERE conrelid='password_reset_token'::regclass AND confrelid='app_user'::regclass AND contype='f' AND confdeltype='c'), 'FK with cascade metadata');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM pg_index WHERE indrelid='password_reset_token'::regclass AND indisunique AND pg_get_indexdef(indexrelid) LIKE '%(token_hash)%'), 'unique digest lookup index');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM pg_indexes WHERE tablename='password_reset_token' AND indexdef LIKE '%(user_id, is_used, expires_at)%'), 'invalidation composite index');
SELECT pg_temp.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid='password_reset_token'::regclass), 'RLS enabled');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash) VALUES (%s,NULL)',:fixture_id), '23502');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash) VALUES (%s,''raw-not-a-digest'')',:fixture_id), '23514');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash) VALUES (%s,repeat(''A'',64))',:fixture_id), '23514');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash) VALUES (%s,repeat(''a'',63))',:fixture_id), '23514');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash) SELECT %s,token_hash FROM password_reset_token WHERE id=%s',:fixture_id,:active_id), '23505');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash,expires_at) VALUES (%s,repeat(''b'',64),CURRENT_TIMESTAMP)',:fixture_id), '23514');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash,is_used) VALUES (%s,repeat(''b'',64),true)',:fixture_id), '23514');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash,used_at) VALUES (%s,repeat(''b'',64),CURRENT_TIMESTAMP)',:fixture_id), '23514');
SELECT pg_temp.rejects(format('INSERT INTO password_reset_token(user_id,token_hash,is_used,used_at) VALUES (%s,repeat(''b'',64),true,CURRENT_TIMESTAMP-interval ''1 second'')',:fixture_id), '23514');
SELECT pg_temp.rejects('INSERT INTO password_reset_token(user_id,token_hash) VALUES (-1,repeat(''b'',64))','23503');
SELECT pg_temp.rejects(format('UPDATE password_reset_token SET expires_at=expires_at+interval ''1 hour'' WHERE id=%s',:active_id),'23514');
SELECT pg_temp.rejects(format('UPDATE password_reset_token SET token_hash=repeat(''c'',64) WHERE id=%s',:active_id),'23514');
SELECT pg_temp.rejects(format('UPDATE password_reset_token SET user_id=-1 WHERE id=%s',:active_id),'23514');
SELECT pg_temp.rejects(format('UPDATE password_reset_token SET created_at=created_at-interval ''1 minute'' WHERE id=%s',:active_id),'23514');
CREATE TEMP TABLE reset_claims(id bigint);
WITH consumed AS (
  UPDATE password_reset_token SET is_used=true, used_at=clock_timestamp()
  WHERE id=:active_id AND NOT is_used AND expires_at>clock_timestamp() RETURNING id
) INSERT INTO reset_claims SELECT id FROM consumed;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM reset_claims),'first redemption succeeds');
WITH consumed AS (
  UPDATE password_reset_token SET is_used=true, used_at=clock_timestamp()
  WHERE id IN (:active_id,:expired_id,:used_id) AND NOT is_used AND expires_at>clock_timestamp() RETURNING id
) INSERT INTO reset_claims SELECT id FROM consumed;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM reset_claims),'replay, expired and used tokens yield no redemption');
SELECT pg_temp.rejects(format('UPDATE password_reset_token SET is_used=false,used_at=NULL WHERE id=%s',:active_id),'23514');
SELECT pg_temp.rejects(format('UPDATE password_reset_token SET used_at=used_at+interval ''1 minute'' WHERE id=%s',:active_id),'23514');
-- Invalidation is a separate atomic operation; no plaintext credential is needed.
INSERT INTO password_reset_token(user_id,token_hash) VALUES (:fixture_id,repeat('d',64));
UPDATE password_reset_token SET is_used=true, used_at=clock_timestamp()
  WHERE user_id=:fixture_id AND NOT is_used AND expires_at>clock_timestamp();
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM password_reset_token WHERE user_id=:fixture_id AND NOT is_used AND expires_at>clock_timestamp()),'bulk invalidation');
-- Keep DBA-03's soft-delete rules: FK cascade does not bypass its hard-delete guard.
SELECT pg_temp.rejects(format('DELETE FROM app_user WHERE user_id=%s',:fixture_id),'23514');
DELETE FROM password_reset_token WHERE user_id=:fixture_id;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM password_reset_token WHERE user_id=:fixture_id),'technical token cleanup allowed');
CREATE ROLE hope_dba04_probe NOLOGIN;
SET LOCAL ROLE hope_dba04_probe;
SELECT pg_temp.rejects('SELECT * FROM public.password_reset_token','42501');
SELECT pg_temp.rejects('SELECT nextval(''public.password_reset_token_id_seq'')','42501');
SELECT pg_temp.rejects('INSERT INTO public.password_reset_token(user_id,token_hash) VALUES (-1,repeat(''f'',64))','42501');
RESET ROLE;
INSERT INTO password_reset_token(user_id,token_hash) VALUES (:fixture_id,repeat('e',64));
GRANT SELECT ON public.password_reset_token TO hope_dba04_probe;
SET LOCAL ROLE hope_dba04_probe;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.password_reset_token),'RLS hides owner fixtures even with SELECT granted');
RESET ROLE;
ROLLBACK;
\echo 'PASS: DBA-04 token schema, defaults, constraints, indexes, lifecycle, replay, invalidation, FK and access checks'
