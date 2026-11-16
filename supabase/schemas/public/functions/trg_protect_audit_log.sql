CREATE OR REPLACE FUNCTION public.trg_protect_audit_log()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only.';
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."trg_protect_audit_log"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."trg_protect_audit_log"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_protect_audit_log"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_protect_audit_log"() TO "postgres";
