-- ============================================================================
-- Migration: 012_app_user_empno_and_hr_checks_s3dba03.sql
-- Task: [S3-DBA-03] Link app_user.empno to employee & enforce HR domain checks
-- ============================================================================

-- UP
-- Already present in Supabase:
--   app_user.app_user_empno_fkey (empno -> employee.empno, allowing NULL)
--   employee.gender_ck (gender IN ('M', 'F'))
--   jobhistory.salary_ck (salary >= 0.0)
--   jobhistory.effdate (NOT NULL, type date)

ALTER TABLE public.employee
  ADD CONSTRAINT employee_birthdate_before_hiredate_ck
    CHECK (birthdate IS NULL OR hiredate IS NULL OR birthdate < hiredate),
  ADD CONSTRAINT employee_sepdate_after_hiredate_ck
    CHECK (sepdate IS NULL OR hiredate IS NULL OR sepdate >= hiredate);

-- DOWN
-- ALTER TABLE public.employee DROP CONSTRAINT IF EXISTS employee_birthdate_before_hiredate_ck;
-- ALTER TABLE public.employee DROP CONSTRAINT IF EXISTS employee_sepdate_after_hiredate_ck;