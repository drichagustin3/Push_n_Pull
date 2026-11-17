CREATE VIEW "public"."pricehist_active" AS  SELECT effdate,
    prodcode,
    unitprice,
    is_deleted,
    stamp
   FROM public.pricehist
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pricehist_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pricehist_active" TO "service_role";

REVOKE ALL ON TABLE "public"."pricehist_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pricehist_active" TO "postgres";
