-- [S2-DBA-01] Active customer & product views and performance indexes

CREATE OR REPLACE VIEW public.v_active_customer
WITH (security_invoker = on) AS
SELECT
  custno,
  custname,
  address,
  payterm,
  is_deleted,
  stamp
FROM public.customer
WHERE is_deleted = false;

CREATE OR REPLACE VIEW public.v_active_product
WITH (security_invoker = on) AS
SELECT
  prodcode,
  description,
  unit,
  is_deleted,
  stamp
FROM public.product
WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_customer_status_custname
  ON public.customer (is_deleted, custname);

CREATE INDEX IF NOT EXISTS idx_product_status_description
  ON public.product (is_deleted, description);

CREATE INDEX IF NOT EXISTS idx_pricehist_prodcode_effdate_status
  ON public.pricehist (prodcode, effdate, is_deleted);