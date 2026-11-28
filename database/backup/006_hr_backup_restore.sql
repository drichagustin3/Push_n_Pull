-- ============================================================================
-- Task: [S3-DBA-06] Indexes and Backup/Restore Procedure
-- File: database/backup/006_hr_backup_restore.sql
-- Scope: Human Resources tables (public.job, public.department,
--        public.employee, public.jobhistory)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Create Point-in-Time Snapshot Backup Schema
-- Run this block in Supabase SQL Editor prior to destructive testing or changes.
-- ----------------------------------------------------------------------------
BEGIN;

CREATE SCHEMA IF NOT EXISTS hr_backup_s3_dba_06;

DROP TABLE IF EXISTS hr_backup_s3_dba_06.jobhistory;
DROP TABLE IF EXISTS hr_backup_s3_dba_06.employee;
DROP TABLE IF EXISTS hr_backup_s3_dba_06.department;
DROP TABLE IF EXISTS hr_backup_s3_dba_06.job;

CREATE TABLE hr_backup_s3_dba_06.job        AS TABLE public.job;
CREATE TABLE hr_backup_s3_dba_06.department AS TABLE public.department;
CREATE TABLE hr_backup_s3_dba_06.employee   AS TABLE public.employee;
CREATE TABLE hr_backup_s3_dba_06.jobhistory AS TABLE public.jobhistory;

COMMIT;

-- Verify backup snapshot row counts match live HR tables
SELECT 'backup_job' AS tbl, count(*) AS row_count FROM hr_backup_s3_dba_06.job
UNION ALL
SELECT 'backup_department', count(*) FROM hr_backup_s3_dba_06.department
UNION ALL
SELECT 'backup_employee', count(*) FROM hr_backup_s3_dba_06.employee
UNION ALL
SELECT 'backup_jobhistory', count(*) FROM hr_backup_s3_dba_06.jobhistory;


-- ----------------------------------------------------------------------------
-- STEP 2: Restore Live HR Tables from Snapshot (Preserves app_user & Stamps)
-- Uses DELETE in child-to-parent order instead of TRUNCATE ... CASCADE so
-- referencing tables such as public.app_user are not truncated.
-- ----------------------------------------------------------------------------
BEGIN;

ALTER TABLE public.jobhistory DISABLE TRIGGER USER;
ALTER TABLE public.employee   DISABLE TRIGGER USER;
ALTER TABLE public.job        DISABLE TRIGGER USER;
ALTER TABLE public.department DISABLE TRIGGER USER;

DELETE FROM public.jobhistory;
DELETE FROM public.employee;
DELETE FROM public.department;
DELETE FROM public.job;

INSERT INTO public.job (jobcode, jobdesc, is_deleted, stamp)
SELECT jobcode, jobdesc, is_deleted, stamp
FROM hr_backup_s3_dba_06.job;

INSERT INTO public.department (deptcode, deptname, is_deleted, stamp)
SELECT deptcode, deptname, is_deleted, stamp
FROM hr_backup_s3_dba_06.department;

INSERT INTO public.employee (empno, lastname, firstname, gender, birthdate, hiredate, sepdate, is_deleted, stamp)
SELECT empno, lastname, firstname, gender, birthdate, hiredate, sepdate, is_deleted, stamp
FROM hr_backup_s3_dba_06.employee;

INSERT INTO public.jobhistory (empno, jobcode, effdate, salary, deptcode, is_deleted, stamp)
SELECT empno, jobcode, effdate, salary, deptcode, is_deleted, stamp
FROM hr_backup_s3_dba_06.jobhistory;

ALTER TABLE public.jobhistory ENABLE TRIGGER USER;
ALTER TABLE public.employee   ENABLE TRIGGER USER;
ALTER TABLE public.job        ENABLE TRIGGER USER;
ALTER TABLE public.department ENABLE TRIGGER USER;

ANALYZE public.employee, public.job, public.department, public.jobhistory;

COMMIT;


-- ----------------------------------------------------------------------------
-- STEP 3: Post-Restore Verification Queries
-- ----------------------------------------------------------------------------
SELECT 'job' AS tbl,
       count(*) AS total,
       count(*) FILTER (WHERE NOT is_deleted) AS active_count,
       count(*) FILTER (WHERE is_deleted) AS inactive_count
FROM public.job
UNION ALL
SELECT 'department',
       count(*),
       count(*) FILTER (WHERE NOT is_deleted),
       count(*) FILTER (WHERE is_deleted)
FROM public.department
UNION ALL
SELECT 'employee',
       count(*),
       count(*) FILTER (WHERE NOT is_deleted),
       count(*) FILTER (WHERE is_deleted)
FROM public.employee
UNION ALL
SELECT 'jobhistory',
       count(*),
       count(*) FILTER (WHERE NOT is_deleted),
       count(*) FILTER (WHERE is_deleted)
FROM public.jobhistory;

SELECT empno, jobcode, effdate, salary, deptcode, is_deleted, stamp
FROM public.jobhistory
WHERE empno IN ('E-001', 'E-004')
ORDER BY empno, effdate;


-- ----------------------------------------------------------------------------
-- STEP 4: Optional Cleanup of Temporary Backup Schema
-- Run after verification completes if you do not want the snapshot left behind.
-- ----------------------------------------------------------------------------
-- DROP SCHEMA IF EXISTS hr_backup_s3_dba_06 CASCADE;