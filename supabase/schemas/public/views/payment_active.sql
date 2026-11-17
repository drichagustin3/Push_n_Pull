CREATE VIEW "public"."payment_active" AS  SELECT orno,
    paydate,
    amount,
    transno,
    is_deleted,
    stamp
   FROM public.payment
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment_active" TO "service_role";

REVOKE ALL ON TABLE "public"."payment_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment_active" TO "postgres";
