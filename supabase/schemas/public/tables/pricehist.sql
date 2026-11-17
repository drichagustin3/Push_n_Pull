CREATE TABLE "public"."pricehist" (
  "effdate"    date                  NOT NULL,
  "prodcode"   character varying(6)  NOT NULL,
  "unitprice"  numeric(10,2),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "pricehist_pkey" PRIMARY KEY (effdate, prodcode),
  CONSTRAINT "unitp_ck" CHECK ((unitprice > (0)::numeric)),
  CONSTRAINT "pricehist_prodcode_fkey" FOREIGN KEY (prodcode) REFERENCES public.product(prodcode)
);

CREATE TRIGGER pricehist_aiu_audit
  AFTER INSERT OR UPDATE ON public.pricehist
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('effdate', 'prodcode');

CREATE TRIGGER pricehist_bd_block
  BEFORE DELETE ON public.pricehist
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER pricehist_biu_stamp
  BEFORE INSERT OR UPDATE ON public.pricehist
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER pricehist_bt_block
  BEFORE TRUNCATE ON public.pricehist
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER pricehist_bu_check
  BEFORE UPDATE ON public.pricehist
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pricehist" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pricehist" TO "service_role";

REVOKE ALL ON TABLE "public"."pricehist" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pricehist" TO "postgres";
