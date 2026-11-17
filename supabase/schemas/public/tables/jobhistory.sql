CREATE TABLE "public"."jobhistory" (
  "empno"      character varying(5)  NOT NULL,
  "jobcode"    character varying(4)  NOT NULL,
  "effdate"    date                  NOT NULL,
  "salary"     numeric(10,2),
  "deptcode"   character varying(4),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "jobhistory_deptcode_fkey" FOREIGN KEY (deptcode) REFERENCES public.department(deptcode),
  CONSTRAINT "jobhistory_empno_fkey" FOREIGN KEY (empno) REFERENCES public.employee(empno),
  CONSTRAINT "jobhistory_jobcode_fkey" FOREIGN KEY (jobcode) REFERENCES public.job(jobcode),
  CONSTRAINT "jobhistory_pkey" PRIMARY KEY (empno, jobcode, effdate),
  CONSTRAINT "salary_ck" CHECK ((salary >= 0.0))
);

CREATE TRIGGER jobhistory_aiu_audit
  AFTER INSERT OR UPDATE ON public.jobhistory
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('empno', 'jobcode', 'effdate');

CREATE TRIGGER jobhistory_bd_block
  BEFORE DELETE ON public.jobhistory
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER jobhistory_biu_stamp
  BEFORE INSERT OR UPDATE ON public.jobhistory
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER jobhistory_bt_block
  BEFORE TRUNCATE ON public.jobhistory
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER jobhistory_bu_check
  BEFORE UPDATE ON public.jobhistory
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobhistory" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobhistory" TO "service_role";

REVOKE ALL ON TABLE "public"."jobhistory" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."jobhistory" TO "postgres";
