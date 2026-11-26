-- ============================================================
-- S2-DBA-05: Demo Data Seed for customer, product, pricehist
-- ============================================================
BEGIN;

-- 1. Customer Demo Dataset (§3.3, Figure 9)
INSERT INTO customer (custno, custname, address, payterm, is_deleted, stamp)
VALUES
  ('C-001', 'Acme Corporation', '123 Main St, Metro City', 'Net 30', false, 'CREATED system 2026-10-01 9:00 AM'),
  ('C-002', 'Globex Industries', '456 Oak Ave, Harbor Town', 'Net 45', false, 'CREATED system 2026-10-02 10:15 AM'),
  ('C-003', 'Initech LLC', '789 Pine Rd, Silicon Valley', 'COD', false, 'EDITED user1 2026-10-13 1:01 PM'),
  ('C-004', 'Umbrella Corp', '1 Raccoon City Blvd', 'Prepaid', true, 'DELETED user2 2026-10-13 1:01 PM'),
  ('C-005', 'Stark Enterprises', '200 Park Avenue, New York', 'Net 15', false, 'EDITED user1 2026-10-13 1:01 PM')
ON CONFLICT (custno) DO NOTHING;

-- 2. Product Demo Dataset (§3.4, Figure 11)
INSERT INTO product (prodcode, description, unit, is_deleted, stamp)
VALUES
  ('P-001', 'Industrial Widget A', 'pcs', false, 'CREATED system 2026-10-01 9:00 AM'),
  ('P-002', 'Steel Bracket Heavy', 'pcs', false, 'CREATED system 2026-10-02 10:00 AM'),
  ('P-003', 'Lubricant Oil 5L', 'can', false, 'EDITED user1 2026-10-13 1:01 PM'),
  ('P-004', 'Safety Gloves XL', 'pair', true, 'DELETED user2 2026-10-13 1:01 PM'),
  ('P-005', 'Copper Wire 2.5mm', 'meter', false, 'CREATED system 2026-10-05 3:00 PM')
ON CONFLICT (prodcode) DO NOTHING;

-- 3. Price History Demo Dataset (§3.4, Figure 12)
-- unitp_ck enforces unitprice > 0; P-004 intentionally has no price history
INSERT INTO pricehist (prodcode, effdate, unitprice, is_deleted)
VALUES
  ('P-001', DATE '2026-09-01', 10.50, false),
  ('P-001', DATE '2026-10-01', 12.75, false),
  ('P-002', DATE '2026-10-01', 24.50, false),
  ('P-003', DATE '2026-02-01', 18.00, false),
  ('P-005', DATE '2026-10-01', 2.35, false)
ON CONFLICT (effdate, prodcode) DO NOTHING;

COMMIT;