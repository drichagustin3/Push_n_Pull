CREATE TABLE "public"."payment" (
  "orno"       character varying(8)  NOT NULL,
  "paydate"    date,
  "amount"     numeric(10,2),
  "transno"    character varying(8),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "payment_pkey" PRIMARY KEY (orno),
  CONSTRAINT "payment_transno_fkey" FOREIGN KEY (transno) REFERENCES public.sales(transno)
);

CREATE TRIGGER payment_aiu_audit
  AFTER INSERT OR UPDATE ON public.payment
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('orno');

CREATE TRIGGER payment_bd_block
  BEFORE DELETE ON public.payment
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER payment_biu_stamp
  BEFORE INSERT OR UPDATE ON public.payment
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER payment_bt_block
  BEFORE TRUNCATE ON public.payment
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER payment_bu_check
  BEFORE UPDATE ON public.payment
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment" TO "service_role";

REVOKE ALL ON TABLE "public"."payment" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payment" TO "postgres";
