-- [S2-DBA-03] Data validation and integrity constraints for customer, product, and pricehist

BEGIN;

-- 1. Drop dependent views before altering column types on product and customer
DROP VIEW IF EXISTS public.v_product_current_price;
DROP VIEW IF EXISTS public.v_active_product;
DROP VIEW IF EXISTS public.v_active_customer;
DROP VIEW IF EXISTS public.product_active;
DROP VIEW IF EXISTS public.customer_active;

-- 2. Widen product.unit to varchar(5) and customer.payterm to varchar(10)
ALTER TABLE public.product
  ALTER COLUMN unit TYPE varchar(5);

ALTER TABLE public.customer
  ALTER COLUMN payterm TYPE varchar(10);

-- 3. Drop old unit_ck before normalizing existing rows
ALTER TABLE public.product
  DROP CONSTRAINT IF EXISTS unit_ck;

-- 4. Normalize existing product.unit and customer.payterm values
UPDATE public.product
SET unit = 'pcs'
WHERE unit IN ('pc', 'ea');

UPDATE public.customer
SET payterm = CASE payterm
  WHEN '30D' THEN 'Net 30'
  WHEN '45D' THEN 'Net 45'
  ELSE payterm
END
WHERE payterm IS NOT NULL;

-- 5. Recreate dependent views with original definitions and security_invoker setting
CREATE VIEW public.customer_active AS
  SELECT custno,
         custname,
         address,
         payterm,
         is_deleted,
         stamp
  FROM public.customer
  WHERE NOT is_deleted;

CREATE VIEW public.product_active AS
  SELECT prodcode,
         description,
         unit,
         is_deleted,
         stamp
  FROM public.product
  WHERE NOT is_deleted;

CREATE VIEW public.v_active_customer AS
  SELECT custno,
         custname,
         address,
         payterm,
         is_deleted,
         stamp
  FROM public.customer
  WHERE is_deleted = false;

CREATE VIEW public.v_active_product AS
  SELECT prodcode,
         description,
         unit,
         is_deleted,
         stamp
  FROM public.product
  WHERE is_deleted = false;

CREATE VIEW public.v_product_current_price
WITH (security_invoker = on) AS
  SELECT prodcode,
         description,
         unit,
         is_deleted,
         stamp,
         (
           SELECT ph.unitprice
           FROM public.pricehist ph
           WHERE ph.prodcode::text = p.prodcode::text
             AND ph.effdate <= CURRENT_DATE
             AND ph.is_deleted = false
           ORDER BY ph.effdate DESC
           LIMIT 1
         ) AS currentprice
  FROM public.product p
  WHERE is_deleted = false;

-- 6. Apply updated CHECK constraints
ALTER TABLE public.product
  ADD CONSTRAINT unit_ck
  CHECK (unit IN ('pcs', 'can', 'pair', 'meter', 'box', 'kg', 'set'));

ALTER TABLE public.customer
  DROP CONSTRAINT IF EXISTS pay_ck;

ALTER TABLE public.customer
  ADD CONSTRAINT pay_ck
  CHECK (payterm IN ('Net 15', 'Net 30', 'Net 45', 'COD', 'Prepaid'));

ALTER TABLE public.customer
  DROP CONSTRAINT IF EXISTS custname_not_blank_ck;

ALTER TABLE public.customer
  ADD CONSTRAINT custname_not_blank_ck
  CHECK (btrim(custname) <> '');

COMMIT;