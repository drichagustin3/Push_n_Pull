-- [S3-DBA-04] HR referential integrity, soft-delete preservation, and employee restore guards
-- Preserves existing hard-delete blocks (*_bd_block -> trg_block_hard_delete) and stamp triggers (*_biu_stamp -> trg_set_stamp).

CREATE OR REPLACE FUNCTION public.trg_check_children()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_n INT := 0;
    v_latest_jobcode VARCHAR;
    v_latest_deptcode VARCHAR;
    v_job_deleted BOOLEAN;
    v_dept_deleted BOOLEAN;
BEGIN
    -- 1. Restore integrity check (OLD.is_deleted = true -> NEW.is_deleted = false)
    IF OLD.is_deleted AND NOT NEW.is_deleted THEN
        IF TG_TABLE_NAME = 'employee' THEN
            SELECT jh.jobcode, jh.deptcode
              INTO v_latest_jobcode, v_latest_deptcode
              FROM public.jobhistory jh
             WHERE jh.empno = NEW.empno
               AND NOT jh.is_deleted
             ORDER BY jh.effdate DESC
             LIMIT 1;

            IF v_latest_jobcode IS NOT NULL THEN
                SELECT j.is_deleted
                  INTO v_job_deleted
                  FROM public.job j
                 WHERE j.jobcode = v_latest_jobcode;

                IF NOT FOUND OR v_job_deleted THEN
                    RAISE EXCEPTION 'Cannot restore employee %: referenced job % is missing or inactive.',
                        NEW.empno, v_latest_jobcode;
                END IF;
            END IF;

            IF v_latest_deptcode IS NOT NULL THEN
                SELECT d.is_deleted
                  INTO v_dept_deleted
                  FROM public.department d
                 WHERE d.deptcode = v_latest_deptcode;

                IF NOT FOUND OR v_dept_deleted THEN
                    RAISE EXCEPTION 'Cannot restore employee %: referenced department % is missing or inactive.',
                        NEW.empno, v_latest_deptcode;
                END IF;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- 2. Soft-delete child checks (NOT OLD.is_deleted -> NEW.is_deleted)
    IF NOT (NEW.is_deleted AND NOT OLD.is_deleted) THEN
        RETURN NEW;
    END IF;

    CASE TG_TABLE_NAME
        WHEN 'employee' THEN
            -- Soft-deleting an employee preserves historical jobhistory and sales rows intact.
            v_n := 0;
        WHEN 'department' THEN
            SELECT count(*) INTO v_n
              FROM public.jobhistory
             WHERE deptcode = OLD.deptcode
               AND NOT is_deleted;
        WHEN 'job' THEN
            SELECT count(*) INTO v_n
              FROM public.jobhistory
             WHERE jobcode = OLD.jobcode
               AND NOT is_deleted;
        WHEN 'customer' THEN
            SELECT count(*) INTO v_n
              FROM public.sales
             WHERE custno = OLD.custno
               AND NOT is_deleted;
        WHEN 'sales' THEN
            SELECT count(*) INTO v_n FROM (
                SELECT 1 FROM public.salesdetail WHERE transno = OLD.transno AND NOT is_deleted
                UNION ALL
                SELECT 1 FROM public.payment     WHERE transno = OLD.transno AND NOT is_deleted
            ) c;
        WHEN 'product' THEN
            SELECT count(*) INTO v_n FROM (
                SELECT 1 FROM public.salesdetail WHERE prodcode = OLD.prodcode AND NOT is_deleted
                UNION ALL
                SELECT 1 FROM public.pricehist   WHERE prodcode = OLD.prodcode AND NOT is_deleted
            ) c;
        ELSE
            NULL;
    END CASE;

    IF v_n > 0 THEN
        RAISE EXCEPTION 'Cannot delete % row: % active related record(s) still exist.', TG_TABLE_NAME, v_n;
    END IF;

    RETURN NEW;
END;
$function$;