CREATE VIEW "public"."salesdetail_active" AS  SELECT transno,
    prodcode,
    quantity,
    is_deleted,
    stamp
   FROM public.salesdetail
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."salesdetail_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."salesdetail_active" TO "service_role";

REVOKE ALL ON TABLE "public"."salesdetail_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."salesdetail_active" TO "postgres";
