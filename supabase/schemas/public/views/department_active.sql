CREATE VIEW "public"."department_active" AS  SELECT deptcode,
    deptname,
    is_deleted,
    stamp
   FROM public.department
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department_active" TO "service_role";

REVOKE ALL ON TABLE "public"."department_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department_active" TO "postgres";
