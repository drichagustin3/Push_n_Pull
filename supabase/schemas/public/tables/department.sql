CREATE TABLE "public"."department" (
  "deptcode"   character varying(3)  NOT NULL,
  "deptname"   character varying(20),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "department_pkey" PRIMARY KEY (deptcode)
);

CREATE TRIGGER department_aiu_audit
  AFTER INSERT OR UPDATE ON public.department
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('deptcode');

CREATE TRIGGER department_bd_block
  BEFORE DELETE ON public.department
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER department_biu_stamp
  BEFORE INSERT OR UPDATE ON public.department
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER department_bt_block
  BEFORE TRUNCATE ON public.department
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER department_bu_check
  BEFORE UPDATE ON public.department
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department" TO "service_role";

REVOKE ALL ON TABLE "public"."department" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."department" TO "postgres";
