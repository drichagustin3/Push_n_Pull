CREATE TABLE "public"."employee" (
  "empno"      character varying(5)  NOT NULL,
  "lastname"   character varying(15),
  "firstname"  character varying(15),
  "gender"     character(1),
  "birthdate"  date,
  "hiredate"   date,
  "sepdate"    date,
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "employee_pkey" PRIMARY KEY (empno),
  CONSTRAINT "gender_ck" CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar])))
);

CREATE TRIGGER employee_aiu_audit
  AFTER INSERT OR UPDATE ON public.employee
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('empno');

CREATE TRIGGER employee_bd_block
  BEFORE DELETE ON public.employee
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER employee_biu_stamp
  BEFORE INSERT OR UPDATE ON public.employee
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER employee_bt_block
  BEFORE TRUNCATE ON public.employee
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER employee_bu_check
  BEFORE UPDATE ON public.employee
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."employee" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."employee" TO "service_role";

REVOKE ALL ON TABLE "public"."employee" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."employee" TO "postgres";
