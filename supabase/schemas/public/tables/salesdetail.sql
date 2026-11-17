CREATE TABLE "public"."salesdetail" (
  "transno"    character varying(8)  NOT NULL,
  "prodcode"   character varying(6)  NOT NULL,
  "quantity"   numeric(10,2),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "quantity_ck" CHECK ((quantity >= 0.0)),
  CONSTRAINT "salesdetail_pkey" PRIMARY KEY (transno, prodcode),
  CONSTRAINT "salesdetail_prodcode_fkey" FOREIGN KEY (prodcode) REFERENCES public.product(prodcode),
  CONSTRAINT "salesdetail_transno_fkey" FOREIGN KEY (transno) REFERENCES public.sales(transno)
);

CREATE TRIGGER salesdetail_aiu_audit
  AFTER INSERT OR UPDATE ON public.salesdetail
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('transno', 'prodcode');

CREATE TRIGGER salesdetail_bd_block
  BEFORE DELETE ON public.salesdetail
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER salesdetail_biu_stamp
  BEFORE INSERT OR UPDATE ON public.salesdetail
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER salesdetail_bt_block
  BEFORE TRUNCATE ON public.salesdetail
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER salesdetail_bu_check
  BEFORE UPDATE ON public.salesdetail
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."salesdetail" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."salesdetail" TO "service_role";

REVOKE ALL ON TABLE "public"."salesdetail" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."salesdetail" TO "postgres";
