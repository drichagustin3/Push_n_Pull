CREATE TABLE "public"."customer" (
  "custno"     character varying(5)  NOT NULL,
  "custname"   character varying(20),
  "address"    character varying(50),
  "payterm"    character varying(3),
  "is_deleted" boolean               NOT NULL DEFAULT false,
  "stamp"      character varying(60),
  CONSTRAINT "customer_pkey" PRIMARY KEY (custno),
  CONSTRAINT "pay_ck" CHECK (((payterm)::text = ANY ((ARRAY['COD'::character varying, '30D'::character varying, '45D'::character varying])::text[])))
);

CREATE TRIGGER customer_aiu_audit
  AFTER INSERT OR UPDATE ON public.customer
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_log('custno');

CREATE TRIGGER customer_bd_block
  BEFORE DELETE ON public.customer
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER customer_biu_stamp
  BEFORE INSERT OR UPDATE ON public.customer
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_stamp();

CREATE TRIGGER customer_bt_block
  BEFORE TRUNCATE ON public.customer
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_block_hard_delete();

CREATE TRIGGER customer_bu_check
  BEFORE UPDATE ON public.customer
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_children();

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer" TO "service_role";

REVOKE ALL ON TABLE "public"."customer" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customer" TO "postgres";
