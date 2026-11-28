# Sprint 3 Database Performance, Indexing & Backup/Restore Report (`[S3-DBA-06]`)

- **Task ID:** `[S3-DBA-06]`
- **Role:** Database Administrator (`hope-inc-erp` / `PushnPull/Push_n_Pull`)
- **Environment:** Supabase PostgreSQL (SQL Editor + Git workflow)
- **Tables Covered:** `public.job`, `public.department`, `public.employee`, `public.jobhistory`

---

## 1. Index Inventory & New Covering / Partial Indexes

### Existing Indexes Retained
- `department_pkey`: `UNIQUE BTREE (deptcode)`
- `idx_department_is_deleted_deptcode`: `BTREE (is_deleted, deptcode)`
- `employee_pkey`: `UNIQUE BTREE (empno)`
- `idx_employee_is_deleted_name`: `BTREE (is_deleted, lastname, firstname)`
- `job_pkey`: `UNIQUE BTREE (jobcode)`
- `idx_job_is_deleted_jobcode`: `BTREE (is_deleted, jobcode)`
- `jobhistory_pkey`: `UNIQUE BTREE (empno, jobcode, effdate)`
- `idx_jobhistory_empno_effdate_is_deleted`: `BTREE (empno, effdate DESC, is_deleted)`
- `uq_jobhistory_empno_effdate_active`: `UNIQUE BTREE (empno, effdate) WHERE (is_deleted = false)`

### New Covering & Partial Indexes Created for `[S3-DBA-06]`
```sql
CREATE INDEX IF NOT EXISTS idx_jobhistory_empno_effdate_active_cov
ON public.jobhistory USING btree (empno, effdate DESC)
INCLUDE (jobcode, deptcode, salary)
WHERE (is_deleted = false);

CREATE INDEX IF NOT EXISTS idx_employee_active_name_cov
ON public.employee USING btree (lastname, firstname, empno)
INCLUDE (gender, hiredate, sepdate)
WHERE (is_deleted = false);

CREATE INDEX IF NOT EXISTS idx_job_active_jobcode_cov
ON public.job USING btree (jobcode)
INCLUDE (jobdesc)
WHERE (is_deleted = false);

CREATE INDEX IF NOT EXISTS idx_department_active_deptcode_cov
ON public.department USING btree (deptcode)
INCLUDE (deptname)
WHERE (is_deleted = false);