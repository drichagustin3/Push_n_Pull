CREATE OR REPLACE FUNCTION public.audit_stamp (
  p_action text
)
  RETURNS text
  LANGUAGE sql
  STABLE
  AS $function$
    SELECT p_action || ' ' || audit_user() || ' ' ||
           to_char(now() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH12:MI AM');
$function$;

GRANT EXECUTE ON FUNCTION "public"."audit_stamp"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."audit_stamp"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."audit_stamp"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."audit_stamp"(text) TO "postgres";
