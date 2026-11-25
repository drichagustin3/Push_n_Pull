-- [S2-DBA-02] Effective-date price resolution view and RPC function
-- Aligned to live Supabase schema (lowercase columns + boolean is_deleted)

CREATE OR REPLACE VIEW public.v_product_current_price
WITH (security_invoker = on) AS
SELECT
  p.prodcode,
  p.description,
  p.unit,
  p.is_deleted,
  p.stamp,
  (
    SELECT ph.unitprice
    FROM public.pricehist ph
    WHERE ph.prodcode = p.prodcode
      AND ph.effdate <= CURRENT_DATE
      AND ph.is_deleted = false
    ORDER BY ph.effdate DESC
    LIMIT 1
  ) AS currentprice
FROM public.product p
WHERE p.is_deleted = false;

CREATE OR REPLACE FUNCTION public.get_products_price_as_of(
  target_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  prodcode VARCHAR,
  description VARCHAR,
  unit VARCHAR,
  is_deleted BOOLEAN,
  stamp VARCHAR,
  currentprice NUMERIC
)
LANGUAGE sql
SECURITY INVOKER
AS $$
  SELECT
    p.prodcode,
    p.description,
    p.unit,
    p.is_deleted,
    p.stamp,
    (
      SELECT ph.unitprice
      FROM public.pricehist ph
      WHERE ph.prodcode = p.prodcode
        AND ph.effdate <= target_date
        AND ph.is_deleted = false
      ORDER BY ph.effdate DESC
      LIMIT 1
    ) AS currentprice
  FROM public.product p
  WHERE p.is_deleted = false
  ORDER BY p.prodcode;
$$;