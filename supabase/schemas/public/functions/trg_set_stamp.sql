CREATE OR REPLACE FUNCTION public.trg_set_stamp()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.stamp := audit_stamp('ADD');
    ELSIF (to_jsonb(OLD) - 'stamp') = (to_jsonb(NEW) - 'stamp') THEN
        NEW.stamp := OLD.stamp;                      -- nothing changed
    ELSIF NOT OLD.is_deleted AND NEW.is_deleted THEN
        NEW.stamp := audit_stamp('DELETE');
    ELSIF OLD.is_deleted AND NOT NEW.is_deleted THEN
        NEW.stamp := audit_stamp('RESTORE');
    ELSE
        NEW.stamp := audit_stamp('EDIT');
    END IF;
    RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."trg_set_stamp"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."trg_set_stamp"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_set_stamp"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_set_stamp"() TO "postgres";
