-- S1-DBA-04: Migration: password reset token table (hashed, expiry, used flag).
-- Requires S1-DBA-03. No reset API, email delivery, account seeds or auth changes.
BEGIN;
DO $$
BEGIN
  IF to_regclass('public.app_user') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23503',
      MESSAGE='S1-DBA-04 requires S1-DBA-03 (public.app_user); apply the dependency first';
  END IF;
END $$;

CREATE TABLE public.password_reset_token (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.app_user(user_id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE
    CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '1 hour'),
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at timestamptz,
  CONSTRAINT password_reset_token_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT password_reset_token_used_ck CHECK (
    (NOT is_used AND used_at IS NULL) OR
    (is_used AND used_at IS NOT NULL AND used_at >= created_at)
  )
);
-- The token_hash UNIQUE constraint already supplies its lookup B-tree index.
CREATE INDEX password_reset_token_user_state_expiry_idx
  ON public.password_reset_token(user_id, is_used, expires_at);

-- Issuance metadata is immutable. Consume/revoke by setting is_used + used_at;
-- issue a fresh row instead of renewing or reactivating an existing credential.
CREATE FUNCTION public.password_reset_token_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id, NEW.user_id, NEW.token_hash, NEW.expires_at, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.user_id, OLD.token_hash, OLD.expires_at, OLD.created_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Reset token issuance metadata is immutable';
  END IF;
  IF OLD.is_used AND ROW(NEW.is_used, NEW.used_at) IS DISTINCT FROM ROW(OLD.is_used, OLD.used_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Consumed or revoked reset tokens cannot be reused';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER password_reset_token_guard BEFORE UPDATE ON public.password_reset_token
  FOR EACH ROW EXECUTE FUNCTION public.password_reset_token_guard();

-- Technical secrets: no browser access and no business audit payloads containing digests.
-- Expired/used rows may be physically cleaned up; app_user's existing delete guard stays intact.
ALTER TABLE public.password_reset_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_token FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.password_reset_token_id_seq FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      EXECUTE format('REVOKE ALL ON public.password_reset_token FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.password_reset_token_id_seq FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
