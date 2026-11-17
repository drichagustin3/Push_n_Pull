CREATE TABLE "public"."audit_log" (
  "audit_id"   bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "table_name" character varying(30)    NOT NULL,
  "action"     character varying(7)     NOT NULL,
  "record_key" character varying(60),
  "old_values" jsonb,
  "new_values" jsonb,
  "action_by"  character varying(50)    NOT NULL,
  "action_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "audit_log_action_check"
    CHECK (((action)::text = ANY ((ARRAY['ADD'::character varying, 'EDIT'::character varying, 'DELETE'::character varying, 'RESTORE'::character varying])::text[]))),
  CONSTRAINT "audit_log_pkey" PRIMARY KEY (audit_id)
);

CREATE TRIGGER audit_log_protect_row
  BEFORE DELETE OR UPDATE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_audit_log();

CREATE TRIGGER audit_log_protect_truncate
  BEFORE TRUNCATE ON public.audit_log
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_protect_audit_log();

REVOKE ALL ON SEQUENCE "public"."audit_log_audit_id_seq" FROM "anon";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_audit_id_seq" TO "anon";

REVOKE ALL ON SEQUENCE "public"."audit_log_audit_id_seq" FROM "authenticated";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_audit_id_seq" TO "authenticated";

REVOKE ALL ON SEQUENCE "public"."audit_log_audit_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_audit_id_seq" TO "postgres";

REVOKE ALL ON SEQUENCE "public"."audit_log_audit_id_seq" FROM "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."audit_log_audit_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_log" TO "anon", "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_log" TO "service_role";

REVOKE ALL ON TABLE "public"."audit_log" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_log" TO "postgres";
