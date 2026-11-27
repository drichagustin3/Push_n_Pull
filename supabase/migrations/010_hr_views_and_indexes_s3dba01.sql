-- ============================================================================
-- [S3-DBA-01] UP MIGRATION
-- Creates active HR views, current job/department assignment view,
-- and B-tree indexes on employee, job, department, and jobhistory.
-- ============================================================================

-- 1. Active HR Views (is_deleted = false; keeps sepdate distinct from soft-delete)
CREATE OR REPLACE VIEW public.v_active_employees AS
SELECT
  e.empno,
  e.lastname,
  e.firstname,
  e.gender,
  e.birthdate,
  e.hiredate,
  e.sepdate,
  (e.sepdate IS NOT NULL) AS is_separated,
  'Active'::varchar(8) AS status,
  e.stamp
FROM public.employee e
WHERE e.is_deleted = false;

CREATE OR REPLACE VIEW public.v_active_jobs AS
SELECT
  j.jobcode,
  j.jobdesc,
  'Active'::varchar(8) AS status,
  j.stamp
FROM public.job j
WHERE j.is_deleted = false;

CREATE OR REPLACE VIEW public.v_active_departments AS
SELECT
  d.deptcode,
  d.deptname,
  'Active'::varchar(8) AS status,
  d.stamp
FROM public.department d
WHERE d.is_deleted = false;

CREATE OR REPLACE VIEW public.v_active_jobhistory AS
SELECT
  jh.empno,
  jh.jobcode,
  jh.effdate,
  jh.salary,
  jh.deptcode,
  'Active'::varchar(8) AS status,
  jh.stamp
FROM public.jobhistory jh
WHERE jh.is_deleted = false;

-- 2. Current Job & Department Assignment View (latest active jobhistory <= CURRENT_DATE)
CREATE OR REPLACE VIEW public.v_employee_current_assignment AS
SELECT DISTINCT ON (e.empno)
  e.empno,
  e.lastname,
  e.firstname,
  e.hiredate,
  e.sepdate,
  (e.sepdate IS NOT NULL) AS is_separated,
  jh.effdate AS current_effdate,
  jh.jobcode,
  j.jobdesc,
  jh.deptcode,
  d.deptname,
  jh.salary AS current_salary
FROM public.employee e
LEFT JOIN public.jobhistory jh
  ON jh.empno = e.empno
 AND jh.is_deleted = false
 AND jh.effdate <= CURRENT_DATE
LEFT JOIN public.job j
  ON j.jobcode = jh.jobcode
 AND j.is_deleted = false
LEFT JOIN public.department d
  ON d.deptcode = jh.deptcode
 AND d.is_deleted = false
WHERE e.is_deleted = false
ORDER BY
  e.empno,
  jh.effdate DESC NULLS LAST;

-- 3. Performance B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_employee_is_deleted_name
  ON public.employee (is_deleted, lastname, firstname);

CREATE INDEX IF NOT EXISTS idx_job_is_deleted_jobcode
  ON public.job (is_deleted, jobcode);

CREATE INDEX IF NOT EXISTS idx_department_is_deleted_deptcode
  ON public.department (is_deleted, deptcode);

CREATE INDEX IF NOT EXISTS idx_jobhistory_empno_effdate_is_deleted
  ON public.jobhistory (empno, effdate DESC, is_deleted);


-- ============================================================================
-- [S3-DBA-01] DOWN MIGRATION
-- Run only when rolling back [S3-DBA-01].
-- ============================================================================
/*
DROP VIEW IF EXISTS public.v_employee_current_assignment;
DROP VIEW IF EXISTS public.v_active_jobhistory;
DROP VIEW IF EXISTS public.v_active_departments;
DROP VIEW IF EXISTS public.v_active_jobs;
DROP VIEW IF EXISTS public.v_active_employees;

DROP INDEX IF EXISTS public.idx_jobhistory_empno_effdate_is_deleted;
DROP INDEX IF EXISTS public.idx_department_is_deleted_deptcode;
DROP INDEX IF EXISTS public.idx_job_is_deleted_jobcode;
DROP INDEX IF EXISTS public.idx_employee_is_deleted_name;
*/