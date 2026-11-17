CREATE TABLE "public"."product" (
  "prodcode"    character varying(6)  NOT NULL,
  "description" character varying(30),
  "unit"        character varying(3),
  "is_deleted"  boolean               NOT NULL DEFAULT false,
  "stamp"       character varying(60),
  CONSTRAINT "product_pkey" PRIMARY KEY (prodcode),
  CONSTRAINT "unit_ck"
    CHECK (((unit)::text = ANY ((ARRAY['pc'::character varying, 'ea'::character varying, 'mtr'::character varying, 'pkg'::character varying, 'ltr'::character varying])::text[])))
);

CREATE TRIGGER product_aiu_audit
  AFTER INSERT OR UPDATE ON public.product
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('prodcode');

CREATE TRIGGER product_bd_block
  BEFORE DELETE ON public.product
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER product_biu_stamp
  BEFORE INSERT OR UPDATE ON public.product
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER product_bt_block
  BEFORE TRUNCATE ON public.product
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER product_bu_check
  BEFORE UPDATE ON public.product
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product" TO "service_role";

REVOKE ALL ON TABLE "public"."product" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product" TO "postgres";
