CREATE OR REPLACE FUNCTION public.audit_user()
  RETURNS text
  LANGUAGE sql
  STABLE
  AS $function$
    SELECT COALESCE(NULLIF(current_setting('app.username', true), ''),
                    session_user::text);
$function$;

GRANT EXECUTE ON FUNCTION "public"."audit_user"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."audit_user"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."audit_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_user"() TO "postgres";
