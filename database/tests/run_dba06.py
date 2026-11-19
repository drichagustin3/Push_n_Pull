"""Run on an explicitly selected isolated local PostgreSQL database only.

PGHOST=/path/to/socket PGPORT=... PGUSER=... PGDATABASE=hopedb \
DBA06_ALLOW_LOCAL_TEST=1 python3 database/tests/run_dba06.py

Prerequisites: merged DBA-01 through DBA-04 migrations. Never use a shared DB.
Migration is applied to this disposable database; assertion fixtures roll back.
"""
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase/migrations/20261119070000_dba06_audit_trail.sql'


def psql(sql):
    return subprocess.run(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1'],
                          input=sql, text=True, capture_output=True, check=False)


def success(sql):
    result = psql(sql)
    if result.returncode:
        # No SQL/rows/credentials in diagnostics: assertion messages contain no secrets.
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def schema():
    dump = subprocess.check_output(['pg_dump', '--schema-only', '--no-owner', '--no-privileges'], text=True)
    # Recent pg_dump builds emit a new random psql restriction key on each dump.
    return '\n'.join(line for line in dump.splitlines()
                     if not line.startswith(('\\restrict ', '\\unrestrict ')))


def history():
    # Compare a digest of every complete stored row; never print their contents.
    return success("SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY audit_id),'')) FROM public.audit_log t")


def main():
    if os.environ.get('DBA06_ALLOW_LOCAL_TEST') != '1' or not os.environ.get('PGHOST', '').startswith('/'):
        raise SystemExit('Set DBA06_ALLOW_LOCAL_TEST=1 and PGHOST to an isolated local Unix socket.')
    if os.environ.get('PGDATABASE') != 'hopedb':
        raise SystemExit('This test requires the explicitly authorized isolated hopedb.')
    assert success('SELECT inet_server_addr() IS NULL') == 't', 'Expected Unix-socket-only connection'
    migration = MIGRATION.read_text()
    unchanged_objects = """SELECT jsonb_build_object(
      'functions',(SELECT jsonb_object_agg(p.oid::regprocedure::text,pg_get_functiondef(p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prokind='f'
          AND p.proname NOT IN ('audit_redact','log_audit_event')),
      'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgrelid,t.tgname)
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
          AND NOT t.tgisinternal AND t.tgname<>'rbac_40_audit'))"""
    preserved = success(unchanged_objects)
    data_query = """SELECT jsonb_object_agg(name,digest) FROM (
      SELECT 'role' name,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY role_code)::text,'')) digest FROM public.role t
      UNION ALL SELECT 'module',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY module_code)::text,'')) FROM public.module t
      UNION ALL SELECT 'rights',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY right_code)::text,'')) FROM public.rights_catalogue t
      UNION ALL SELECT 'users',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY user_id)::text,'')) FROM public.app_user t
      UNION ALL SELECT 'permissions',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY user_id,right_code)::text,'')) FROM public.user_permission t) s"""
    before_data = success(data_query)
    before_schema, before_history = schema(), history()
    # Refuse incompatible existing infrastructure instead of silently replacing it.
    for setup, expected_error in [
        ("ALTER TABLE public.audit_log RENAME COLUMN action_by TO incompatible_actor;", 'column/type contract'),
        ("CREATE TRIGGER duplicate_audit AFTER INSERT ON public.app_user FOR EACH ROW EXECUTE FUNCTION public.rbac_write_audit();", 'Overlapping audit writers'),
    ]:
        result = psql('BEGIN;\n' + setup + '\n' + migration)
        assert result.returncode != 0 and expected_error in result.stderr, 'Compatibility preflight failed to reject drift'
        assert schema() == before_schema and history() == before_history, 'Preflight failure left schema/history changes'
    print('PASS: incompatible schema and overlapping triggers rejected without persistent changes')
    # Fail after all DDL, before COMMIT; PostgreSQL must restore the prior schema.
    injected = migration.rsplit('COMMIT;', 1)[0] + 'SELECT 1/0;\nCOMMIT;\n'
    result = psql(injected)
    assert result.returncode != 0 and 'division by zero' in result.stderr, 'DDL failure injection did not reach end of migration'
    assert schema() == before_schema and history() == before_history, 'Failed migration changed schema/history'
    print('PASS: injected end-of-migration failure rolls back all DDL and preserves history')
    success(migration)
    installed_schema = schema()
    assert history() == before_history, 'Migration changed existing audit records'
    trigger_ids = success("SELECT string_agg(oid::text,',' ORDER BY tgrelid) FROM pg_trigger WHERE tgname='rbac_40_audit'")
    success(migration)
    assert schema() == installed_schema and history() == before_history, 'Rerun changed schema/history'
    assert trigger_ids == success("SELECT string_agg(oid::text,',' ORDER BY tgrelid) FROM pg_trigger WHERE tgname='rbac_40_audit'"), 'Rerun recreated correct triggers'
    assert success("SELECT count(*) FROM pg_trigger WHERE tgname='rbac_40_audit' AND tgfoid='public.log_audit_event()'::regprocedure AND tgtype=29") == '5'
    print('PASS: exact migration applies twice, preserves history and leaves five stable audit triggers')
    assert success(unchanged_objects) == preserved, 'Migration changed an unrelated function or trigger'
    print('PASS: existing context/stamp/compatibility functions and all unrelated triggers unchanged')
    for name in ['validate_dba06_audit.sql', 'validate_dba06_generic.sql']:
        before = history()
        success((ROOT / 'database/tests' / name).read_text())
        assert history() == before, f'{name} left fixture audit records behind'
        print(f'PASS: {name}; all fixtures rolled back')
    assert success(data_query) == before_data, 'Tests changed existing users, seeds or permission state'
    print('PASS: users, roles, modules, rights and permissions unchanged')
    print('PASS: DBA-06 database verification complete')


if __name__ == '__main__':
    main()
