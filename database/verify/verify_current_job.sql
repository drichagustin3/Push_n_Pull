-- ============================================================================
-- Verification Script: database/verify/verify_current_job.sql
-- Task: [S3-DBA-02] Current job derivation, batch parity, and duplicate effdate guard
-- ============================================================================

BEGIN;

-- 1. Seed temporary departments, jobs, employees, and promotion/transfer history
INSERT INTO public.department (deptcode, deptname, is_deleted, stamp) VALUES
  ('D1', 'Engineering', false, 'CREATED verify s3dba02'),
  ('D2', 'Product Ops', false, 'CREATED verify s3dba02');

INSERT INTO public.job (jobcode, jobdesc, is_deleted, stamp) VALUES
  ('J1', 'Junior Dev', false, 'CREATED verify s3dba02'),
  ('J2', 'Mid Dev', false, 'CREATED verify s3dba02'),
  ('J3', 'Lead Dev', false, 'CREATED verify s3dba02');

INSERT INTO public.employee (empno, lastname, firstname, gender, birthdate, hiredate, sepdate, is_deleted, stamp) VALUES
  ('E1', 'Santos', 'Maria', 'F', '1992-04-10', '2021-01-10', NULL, false, 'CREATED verify s3dba02'),
  ('E2', 'Reyes', 'Juan', 'M', '1990-09-22', '2020-06-01', '2025-12-31', false, 'CREATED verify s3dba02'),
  ('E3', 'Garcia', 'Pedro', 'M', '1989-02-14', '2019-03-15', NULL, true, 'DELETED verify s3dba02');

INSERT INTO public.jobhistory (empno, jobcode, effdate, salary, deptcode, is_deleted, stamp) VALUES
  ('E1', 'J1', '2021-01-10', 35000, 'D1', false, 'CREATED verify s3dba02'),
  ('E1', 'J2', '2022-07-01', 48000, 'D1', false, 'PROMO verify s3dba02'),
  ('E1', 'J3', '2024-01-15', 65000, 'D2', false, 'TRANSFER verify s3dba02'),
  ('E1', 'J3', '2029-01-01', 90000, 'D2', false, 'FUTURE verify s3dba02'),
  ('E2', 'J1', '2020-06-01', 38000, 'D1', false, 'CREATED verify s3dba02');

-- 2. Single-employee current job lookup for E1 as of 2024-06-01 (should pick J3 / D2 on 2024-01-15)
SELECT
  jh.empno,
  jh.jobcode,
  j.jobdesc,
  jh.deptcode,
  d.deptname,
  jh.salary AS current_salary,
  jh.effdate AS current_effdate
FROM public.jobhistory jh
JOIN public.job j
  ON j.jobcode = jh.jobcode
 AND j.is_deleted = false
LEFT JOIN public.department d
  ON d.deptcode = jh.deptcode
 AND d.is_deleted = false
WHERE jh.empno = 'E1'
  AND jh.is_deleted = false
  AND jh.effdate <= DATE '2024-06-01'
ORDER BY jh.effdate DESC NULLS LAST
LIMIT 1;

-- 3. Batch view parity check against current assignment view
SELECT
  ca.empno,
  ca.jobcode,
  ca.jobdesc,
  ca.deptcode,
  ca.deptname,
  ca.current_salary,
  ca.current_effdate,
  ca.is_separated
FROM public.v_employee_current_assignment ca
ORDER BY ca.empno;

-- 4. Duplicate effective date guard test (should fail with 23505 unique_violation)
-- Uncomment the lines below in SQL Editor to test rejection explicitly:
-- SAVEPOINT before_dup_test;
-- INSERT INTO public.jobhistory (empno, jobcode, effdate, salary, deptcode, is_deleted, stamp)
-- VALUES ('E1', 'J1', '2024-01-15', 70000, 'D1', false, 'DUP EFFDATE test');
-- ROLLBACK TO SAVEPOINT before_dup_test;

ROLLBACK;