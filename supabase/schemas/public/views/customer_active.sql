CREATE VIEW "public"."customer_active" AS  SELECT custno,
    custname,
    address,
    payterm,
    is_deleted,
    stamp
   FROM public.customer
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_active" TO "service_role";

REVOKE ALL ON TABLE "public"."customer_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer_active" TO "postgres";
