-- ============================================================================
-- Migration: 011_jobhistory_unique_effdate_s3dba02.sql
-- Task: [S3-DBA-02] Job history validation (no duplicate effective dates)
-- ============================================================================

-- UP
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobhistory_empno_effdate_active
  ON public.jobhistory USING btree (empno, effdate)
  WHERE is_deleted = false;

-- Batch view from S3-DBA-01 remains available for employee listings:
-- public.v_employee_current_assignment

-- Single-employee current job lookup pattern (parameterized by :empno and :as_of_date):
-- SELECT
--   jh.empno,
--   jh.jobcode,
--   j.jobdesc,
--   jh.deptcode,
--   d.deptname,
--   jh.salary AS current_salary,
--   jh.effdate AS current_effdate
-- FROM public.jobhistory jh
-- JOIN public.job j
--   ON j.jobcode = jh.jobcode
--  AND j.is_deleted = false
-- LEFT JOIN public.department d
--   ON d.deptcode = jh.deptcode
--  AND d.is_deleted = false
-- WHERE jh.empno = :empno
--   AND jh.is_deleted = false
--   AND jh.effdate <= :as_of_date
-- ORDER BY jh.effdate DESC NULLS LAST
-- LIMIT 1;

-- DOWN
-- DROP INDEX IF EXISTS public.uq_jobhistory_empno_effdate_active;