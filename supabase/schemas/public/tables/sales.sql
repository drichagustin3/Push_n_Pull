CREATE TABLE "public"."sales" (
  "transno"    character varying(8)  NOT NULL,
  "salesdate"  date,
  "custno"     character varying(5),
  "empno"      character varying(5),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "sales_custno_fkey" FOREIGN KEY (custno) REFERENCES public.customer(custno),
  CONSTRAINT "sales_empno_fkey" FOREIGN KEY (empno) REFERENCES public.employee(empno),
  CONSTRAINT "sales_pkey" PRIMARY KEY (transno)
);

CREATE TRIGGER sales_aiu_audit
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('transno');

CREATE TRIGGER sales_bd_block
  BEFORE DELETE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER sales_biu_stamp
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER sales_bt_block
  BEFORE TRUNCATE ON public.sales
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER sales_bu_check
  BEFORE UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales" TO "service_role";

REVOKE ALL ON TABLE "public"."sales" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales" TO "postgres";
