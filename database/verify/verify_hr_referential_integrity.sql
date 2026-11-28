-- [S3-DBA-04] Verification script for HR referential integrity, delete guards, and employee restore checks.
-- Uses a DO block with subtransactions (BEGIN ... EXCEPTION) and ends with ROLLBACK so zero test data persists.

BEGIN;

DO $$
DECLARE
    v_jh_count INT;
    v_emp_stamp TEXT;
BEGIN
    -- Seed isolated fixture records
    INSERT INTO public.department (deptcode, deptname, is_deleted)
    VALUES ('D99', 'Verify Dept', false);

    INSERT INTO public.job (jobcode, jobdesc, is_deleted)
    VALUES ('J99', 'Verify Job', false);

    INSERT INTO public.employee (empno, lastname, firstname, gender, birthdate, hiredate, is_deleted)
    VALUES ('E99', 'Verify', 'Tester', 'F', DATE '1995-05-05', DATE '2023-01-10', false);

    INSERT INTO public.jobhistory (empno, jobcode, effdate, salary, deptcode, is_deleted)
    VALUES ('E99', 'J99', DATE '2023-01-10', 45000.00, 'D99', false);

    -- Test 1: Hard delete on JOB must fail
    BEGIN
        DELETE FROM public.job WHERE jobcode = 'J99';
        RAISE EXCEPTION 'TEST 1 FAILED: Hard delete on job should have been blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'Hard delete/truncate not allowed on job%' THEN
            RAISE;
        END IF;
        RAISE NOTICE 'PASS Test 1: Hard delete on job blocked (%)', SQLERRM;
    END;

    -- Test 2: Hard delete on DEPARTMENT must fail
    BEGIN
        DELETE FROM public.department WHERE deptcode = 'D99';
        RAISE EXCEPTION 'TEST 2 FAILED: Hard delete on department should have been blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'Hard delete/truncate not allowed on department%' THEN
            RAISE;
        END IF;
        RAISE NOTICE 'PASS Test 2: Hard delete on department blocked (%)', SQLERRM;
    END;

    -- Test 3: Hard delete on EMPLOYEE must fail
    BEGIN
        DELETE FROM public.employee WHERE empno = 'E99';
        RAISE EXCEPTION 'TEST 3 FAILED: Hard delete on employee should have been blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'Hard delete/truncate not allowed on employee%' THEN
            RAISE;
        END IF;
        RAISE NOTICE 'PASS Test 3: Hard delete on employee blocked (%)', SQLERRM;
    END;

    -- Test 4: Soft delete on JOB with active JOBHISTORY must fail
    BEGIN
        UPDATE public.job SET is_deleted = true WHERE jobcode = 'J99';
        RAISE EXCEPTION 'TEST 4 FAILED: Soft delete on job with active jobhistory should have been blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'Cannot delete job row:%' THEN
            RAISE;
        END IF;
        RAISE NOTICE 'PASS Test 4: Soft delete on job with active jobhistory blocked (%)', SQLERRM;
    END;

    -- Test 5: Soft delete on DEPARTMENT with active JOBHISTORY must fail
    BEGIN
        UPDATE public.department SET is_deleted = true WHERE deptcode = 'D99';
        RAISE EXCEPTION 'TEST 5 FAILED: Soft delete on department with active jobhistory should have been blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'Cannot delete department row:%' THEN
            RAISE;
        END IF;
        RAISE NOTICE 'PASS Test 5: Soft delete on department with active jobhistory blocked (%)', SQLERRM;
    END;

    -- Test 6: Soft delete on EMPLOYEE succeeds, stamps DELETE, and preserves JOBHISTORY intact
    UPDATE public.employee SET is_deleted = true WHERE empno = 'E99';

    SELECT count(*) INTO v_jh_count
      FROM public.jobhistory
     WHERE empno = 'E99' AND NOT is_deleted;

    SELECT stamp INTO v_emp_stamp
      FROM public.employee
     WHERE empno = 'E99';

    IF v_jh_count <> 1 THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Expected 1 preserved jobhistory row, got %', v_jh_count;
    END IF;
    RAISE NOTICE 'PASS Test 6: Employee soft-delete preserved jobhistory (count=%, stamp=%)', v_jh_count, v_emp_stamp;

    -- Test 7: Restore EMPLOYEE succeeds when referenced DEPARTMENT and JOB are active
    UPDATE public.employee SET is_deleted = false WHERE empno = 'E99';

    SELECT stamp INTO v_emp_stamp
      FROM public.employee
     WHERE empno = 'E99';
    RAISE NOTICE 'PASS Test 7: Employee restore succeeded with active department & job (stamp=%)', v_emp_stamp;

    -- Test 8: Restore EMPLOYEE fails when referenced DEPARTMENT is inactive
    UPDATE public.employee SET is_deleted = true WHERE empno = 'E99';
    UPDATE public.jobhistory SET is_deleted = true WHERE empno = 'E99';
    UPDATE public.department SET is_deleted = true WHERE deptcode = 'D99';
    UPDATE public.jobhistory SET is_deleted = false WHERE empno = 'E99';

    BEGIN
        UPDATE public.employee SET is_deleted = false WHERE empno = 'E99';
        RAISE EXCEPTION 'TEST 8 FAILED: Employee restore should fail when department is inactive';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'Cannot restore employee E99: referenced department D99%' THEN
            RAISE;
        END IF;
        RAISE NOTICE 'PASS Test 8: Employee restore blocked when department inactive (%)', SQLERRM;
    END;

    -- Test 9: Restore EMPLOYEE fails when referenced JOB is inactive
    UPDATE public.jobhistory SET is_deleted = true WHERE empno = 'E99';
    UPDATE public.department SET is_deleted = false WHERE deptcode = 'D99';
    UPDATE public.job SET is_deleted = true WHERE jobcode = 'J99';
    UPDATE public.jobhistory SET is_deleted = false WHERE empno = 'E99';

    BEGIN
        UPDATE public.employee SET is_deleted = false WHERE empno = 'E99';
        RAISE EXCEPTION 'TEST 9 FAILED: Employee restore should fail when job is inactive';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE 'Cannot restore employee E99: referenced job J99%' THEN
            RAISE;
        END IF;
        RAISE NOTICE 'PASS Test 9: Employee restore blocked when job inactive (%)', SQLERRM;
    END;
END $$;

ROLLBACK;