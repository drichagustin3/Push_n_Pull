CREATE VIEW "public"."employee_active" AS  SELECT empno,
    lastname,
    firstname,
    gender,
    birthdate,
    hiredate,
    sepdate,
    is_deleted,
    stamp
   FROM public.employee
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."employee_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."employee_active" TO "service_role";

REVOKE ALL ON TABLE "public"."employee_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."employee_active" TO "postgres";
