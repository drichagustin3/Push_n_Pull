-- ============================================================
-- S2-DBA-04: Child-Record Delete & Soft-Delete Guard Verification
-- Verified against trg_block_hard_delete() and trg_check_children()
-- ============================================================

-- A. Hard-delete rejection on customer with dependent sales record
BEGIN;
INSERT INTO customer (custno, custname, address, payterm, is_deleted, stamp)
VALUES ('C-001', 'Sample Customer', 'Pasig City', 'Net 30', false, 'CREATED')
ON CONFLICT (custno) DO NOTHING;

INSERT INTO sales (transno, salesdate, custno, is_deleted, stamp)
SELECT 'ST-001', CURRENT_DATE, 'C-001', false, 'CREATED'
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE custno = 'C-001');

-- Expected: ERROR P0001 from trg_block_hard_delete()
DELETE FROM customer WHERE custno = 'C-001';
ROLLBACK;

-- B. Soft-delete rejection on customer with active sales record
BEGIN;
INSERT INTO customer (custno, custname, address, payterm, is_deleted, stamp)
VALUES ('C-001', 'Sample Customer', 'Pasig City', 'Net 30', false, 'CREATED')
ON CONFLICT (custno) DO NOTHING;

INSERT INTO sales (transno, salesdate, custno, is_deleted, stamp)
SELECT 'ST-002', CURRENT_DATE, 'C-001', false, 'CREATED'
WHERE NOT EXISTS (SELECT 1 FROM sales WHERE custno = 'C-001' AND NOT is_deleted);

-- Expected: ERROR P0001: Cannot delete customer row: 1 active related record(s) still exist.
UPDATE customer
SET is_deleted = true
WHERE custno = 'C-001';
ROLLBACK;

-- C. Soft-delete rejection on product with active salesdetail / pricehist
BEGIN;
INSERT INTO product (prodcode, description, unit, is_deleted, stamp)
VALUES ('PT1', 'Test Widget', 'pcs', false, 'CREATED')
ON CONFLICT (prodcode) DO NOTHING;

INSERT INTO sales (transno, salesdate, is_deleted, stamp)
VALUES ('ST-003', CURRENT_DATE, false, 'CREATED')
ON CONFLICT (transno) DO NOTHING;

INSERT INTO salesdetail (transno, prodcode, is_deleted, stamp)
VALUES ('ST-003', 'PT1', false, 'CREATED');

-- Expected: ERROR P0001: Cannot delete product row: 1 active related record(s) still exist.
UPDATE product
SET is_deleted = true
WHERE prodcode = 'PT1';
ROLLBACK;

-- D. Permitted soft-delete (no active dependents) + historical preservation check
BEGIN;
INSERT INTO customer (custno, custname, address, payterm, is_deleted, stamp)
VALUES ('CFREE', 'Free Customer', 'Pasig City', 'COD', false, 'CREATED');

UPDATE customer
SET is_deleted = true
WHERE custno = 'CFREE';

SELECT custno, is_deleted, stamp FROM customer WHERE custno = 'CFREE';
SELECT COUNT(*) AS historical_sales_count FROM sales;
SELECT COUNT(*) AS historical_salesdetail_count FROM salesdetail;
SELECT COUNT(*) AS historical_pricehist_count FROM pricehist;
ROLLBACK;