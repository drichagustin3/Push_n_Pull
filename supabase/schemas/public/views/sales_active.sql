CREATE VIEW "public"."sales_active" AS  SELECT transno,
    salesdate,
    custno,
    empno,
    is_deleted,
    stamp
   FROM public.sales
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales_active" TO "service_role";

REVOKE ALL ON TABLE "public"."sales_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales_active" TO "postgres";
