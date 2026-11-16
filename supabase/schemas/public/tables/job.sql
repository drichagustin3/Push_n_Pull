CREATE TABLE "public"."job" (
  "jobcode"    character varying(4)  NOT NULL,
  "jobdesc"    character varying(20),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "job_pkey" PRIMARY KEY (jobcode)
);

CREATE TRIGGER job_aiu_audit
  AFTER INSERT OR UPDATE ON public.job
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('jobcode');

CREATE TRIGGER job_bd_block
  BEFORE DELETE ON public.job
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER job_biu_stamp
  BEFORE INSERT OR UPDATE ON public.job
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER job_bt_block
  BEFORE TRUNCATE ON public.job
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER job_bu_check
  BEFORE UPDATE ON public.job
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."job" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."job" TO "service_role";

REVOKE ALL ON TABLE "public"."job" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."job" TO "postgres";
