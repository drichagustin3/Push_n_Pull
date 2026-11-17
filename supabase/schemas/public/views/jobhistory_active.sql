CREATE VIEW "public"."jobhistory_active" AS  SELECT empno,
    jobcode,
    effdate,
    salary,
    deptcode,
    is_deleted,
    stamp
   FROM public.jobhistory
  WHERE (NOT is_deleted);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobhistory_active" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobhistory_active" TO "service_role";

REVOKE ALL ON TABLE "public"."jobhistory_active" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobhistory_active" TO "postgres";
