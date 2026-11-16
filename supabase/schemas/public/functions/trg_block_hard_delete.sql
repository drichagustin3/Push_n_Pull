CREATE OR REPLACE FUNCTION public.trg_block_hard_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
    RAISE EXCEPTION 'Hard delete/truncate not allowed on %. Use UPDATE ... SET is_deleted = true.', TG_TABLE_NAME;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."trg_block_hard_delete"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."trg_block_hard_delete"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."trg_block_hard_delete"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."trg_block_hard_delete"() TO "postgres";
