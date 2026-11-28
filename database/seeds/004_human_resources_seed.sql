-- ============================================================================
-- Seed: 004_human_resources_seed.sql
-- Task: [S3-DBA-05] HR Demo Data (JOB, DEPARTMENT, EMPLOYEE, JOBHISTORY)
-- Reference: Student Guide §2.3 (sepDate vs Inactive) & §3.5 (Figures 15–22)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. JOB (J001 to J004 — fits jobcode varchar(4))
-- Insert all initially with is_deleted = false so trg_set_stamp() records ADD,
-- then transition J004 to is_deleted = true so trg_set_stamp() records DELETE.
-- ----------------------------------------------------------------------------
INSERT INTO public.job (jobcode, jobdesc, is_deleted)
VALUES
    ('J001', 'Software Engineer', false),
    ('J002', 'Sales Manager',     false),
    ('J003', 'HR Specialist',     false),
    ('J004', 'Accountant',        false)
ON CONFLICT (jobcode) DO UPDATE
SET jobdesc = EXCLUDED.jobdesc;

-- ----------------------------------------------------------------------------
-- 2. DEPARTMENT (D01 to D04 — fits deptcode varchar(3))
-- Insert all initially with is_deleted = false, then soft-delete D04.
-- ----------------------------------------------------------------------------
INSERT INTO public.department (deptcode, deptname, is_deleted)
VALUES
    ('D01', 'Engineering',     false),
    ('D02', 'Sales',           false),
    ('D03', 'Human Resources', false),
    ('D04', 'Finance',         false)
ON CONFLICT (deptcode) DO UPDATE
SET deptname = EXCLUDED.deptname;

-- ----------------------------------------------------------------------------
-- 3. EMPLOYEE (E-001 to E-004 — fits empno varchar(5))
-- E-004 carries sepdate = '2025-12-31' and transitions to is_deleted = true
-- (Inactive) per §2.3.
-- ----------------------------------------------------------------------------
INSERT INTO public.employee (
    empno,
    lastname,
    firstname,
    gender,
    birthdate,
    hiredate,
    sepdate,
    is_deleted
)
VALUES
    ('E-001', 'Santos', 'Maria', 'F', DATE '1990-05-12', DATE '2020-03-01', NULL,              false),
    ('E-002', 'Reyes',  'Juan',  'M', DATE '1988-11-03', DATE '2019-07-15', NULL,              false),
    ('E-003', 'Cruz',   'Ana',   'F', DATE '1995-02-20', DATE '2021-01-10', NULL,              false),
    ('E-004', 'Garcia', 'Pedro', 'M', DATE '1985-08-30', DATE '2018-05-01', DATE '2025-12-31', false)
ON CONFLICT (empno) DO UPDATE
SET lastname  = EXCLUDED.lastname,
    firstname = EXCLUDED.firstname,
    gender    = EXCLUDED.gender,
    birthdate = EXCLUDED.birthdate,
    hiredate  = EXCLUDED.hiredate,
    sepdate   = EXCLUDED.sepdate;

-- ----------------------------------------------------------------------------
-- 4. JOBHISTORY
-- Respects PK (empno, jobcode, effdate), hiredate <= effdate, salary >= 0.0,
-- and valid FKs to job, department, and employee.
-- ----------------------------------------------------------------------------
INSERT INTO public.jobhistory (
    empno,
    jobcode,
    effdate,
    salary,
    deptcode,
    is_deleted
)
VALUES
    -- E-001: Initial hire assignment + 2023 raise (latest effdate = current job)
    ('E-001', 'J001', DATE '2020-03-01', 45000.00, 'D01', false),
    ('E-001', 'J001', DATE '2023-01-01', 52000.00, 'D01', false),
    -- E-002: Sales Manager in Sales
    ('E-002', 'J002', DATE '2019-07-15', 48000.00, 'D02', false),
    -- E-003: HR Specialist in Human Resources
    ('E-003', 'J003', DATE '2021-01-10', 38000.00, 'D03', false),
    -- E-004: Historical Accountant assignment in Finance (preserved on soft-delete)
    ('E-004', 'J004', DATE '2018-05-01', 42000.00, 'D04', false)
ON CONFLICT (empno, jobcode, effdate) DO UPDATE
SET salary   = EXCLUDED.salary,
    deptcode = EXCLUDED.deptcode;

-- ----------------------------------------------------------------------------
-- 5. Apply Inactive (soft-deleted) status & DELETE audit stamps
-- ----------------------------------------------------------------------------
UPDATE public.employee
SET is_deleted = true
WHERE empno = 'E-004'
  AND is_deleted = false;

UPDATE public.jobhistory
SET is_deleted = true
WHERE empno = 'E-004'
  AND is_deleted = false;

UPDATE public.job
SET is_deleted = true
WHERE jobcode = 'J004'
  AND is_deleted = false;

UPDATE public.department
SET is_deleted = true
WHERE deptcode = 'D04'
  AND is_deleted = false;

COMMIT;