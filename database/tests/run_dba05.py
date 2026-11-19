"""DBA-05 destructive-scenario verification on an explicitly disposable local DB.

The test creates synthetic accounts/associations for preservation assertions and
applies the seed. Approved team identities are used only in this disposable DB. An empty-catalogue test DB
is also created in the same isolated cluster. Use only a dedicated local cluster:
PGHOST=/isolated/socket PGPORT=... PGUSER=... PGDATABASE=hopedb \
DBA05_ALLOW_LOCAL_TEST=1 python3 database/tests/run_dba05.py
"""
import os
import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / 'supabase/migrations/20261119060000_dba05_catalogue_seed.sql'


def query(sql, database=None):
    env = os.environ.copy()
    if database:
        env['PGDATABASE'] = database
    return subprocess.run(['psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1'], input=sql,
                          env=env, text=True, capture_output=True, check=False)


def success(sql, database=None):
    result = query(sql, database)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def schema():
    dump = subprocess.check_output(['pg_dump', '--schema-only'], text=True)
    return '\n'.join(line for line in dump.splitlines()
                     if not line.startswith(('\\restrict ', '\\unrestrict ')))


def digest(table, order, where='true', database=None):
    # No stored row or credential content is ever printed.
    return success(f"SELECT md5(coalesce(string_agg(to_jsonb(t)::text,',' ORDER BY {order}),'')) FROM public.{table} t WHERE {where}", database)


def main():
    if os.environ.get('DBA05_ALLOW_LOCAL_TEST') != '1' or not os.environ.get('PGHOST', '').startswith('/'):
        raise SystemExit('Use an explicitly isolated local Unix socket and DBA05_ALLOW_LOCAL_TEST=1.')
    if os.environ.get('PGDATABASE') != 'hopedb':
        raise SystemExit('Select the isolated hopedb explicitly.')
    assert success('SELECT inet_server_addr() IS NULL') == 't'
    assert success("SELECT to_regprocedure('public.log_audit_event()') IS NULL") == 't', 'Use merged schema without unmerged DBA-06'
    assert success('SELECT count(*) FROM public.app_user') == '0', 'Start with a fresh disposable migrated DB, not existing accounts'
    raw_migration = MIGRATION.read_text()
    roster = json.loads((ROOT / 'database/seeds/dba05-superadmins.json').read_text())
    assert len(roster)==3 and len({r['email'] for r in roster})==3
    for row in roster:
        assert f"('{row['first_name']}','{row['last_name']}','{row['email']}')" in raw_migration
    emails = ','.join("'"+row['email']+"'" for row in roster)
    not_approved = f'email NOT IN ({emails})'
    # Test-only digests: no raw setup proof is embedded in SQL or test output.
    proofs = {row['email']: {'hash': secrets.token_hex(32),
              'expires_at': (datetime.now(timezone.utc)+timedelta(hours=1)).isoformat()} for row in roster}
    def configure(configuration):
        encoded = json.dumps(configuration).replace("'", "''")
        return raw_migration.replace('BEGIN;', "BEGIN;\nDO $config$ BEGIN PERFORM set_config('hope.dba05_setup','"+encoded+"',true); END $config$;",1)
    migration = configure(proofs)
    mappings = re.findall(r"\('([^']+)','([^']+)','([^']+)','([^']+)'\)", migration)
    assert len(mappings) == 36
    changed = [(old,new) for old,new,_,_ in mappings if old != new]
    assert len(changed) == 18
    values = ','.join(f"('{old}','{new}')" for old,new in changed)
    mapping_cte = f'WITH mapping(old,new) AS (VALUES {values}) '
    # Synthetic hashes/proofs are generated solely for state-preservation tests.
    success("""INSERT INTO public.app_user(first_name,last_name,email,role,status,blocked,is_deleted,
      password_hash,must_change_password,setup_token_hash,setup_token_expires_at,empno)
      VALUES('DBA05','Synthetic','dba05-active@example.test','user','active',false,false,
        '$2b$12$'||repeat('a',53),true,repeat('a',64),now()+interval '1 hour','00001'),
        ('DBA05','Synthetic','dba05-blocked@example.test','superadmin','inactive',true,false,NULL,false,NULL,NULL,NULL),
        ('DBA05','Synthetic','dba05-deleted@example.test','user','pending',false,true,NULL,false,NULL,NULL,NULL);
      INSERT INTO public.user_permission(user_id,right_code,is_deleted)
        SELECT u.user_id,r.right_code,(row_number() OVER (PARTITION BY u.user_id ORDER BY r.right_code)%2=0 OR u.blocked)
        FROM public.app_user u CROSS JOIN public.rights_catalogue r WHERE NOT u.is_deleted;
      INSERT INTO public.user_permission(user_id,right_code,is_deleted)
        SELECT user_id,'department.add',true FROM public.app_user WHERE is_deleted;
      INSERT INTO public.auth_session(sid,sess,expire) VALUES('dba05-synthetic-session','{"fixture":true}',now()+interval '1 hour');
      INSERT INTO public.password_reset_token(user_id,token_hash)
        SELECT user_id,repeat(md5(random()::text),2) FROM public.app_user WHERE NOT blocked AND NOT is_deleted;""")
    preserved = {table: digest(table, order, not_approved if table=='app_user' else 'true') for table,order in [
        ('app_user','user_id'),('auth_session','sid'),('password_reset_token','id'),('role','role_code'),('module','module_code')]}
    before_schema = schema()
    history_id = success('SELECT max(audit_id) FROM public.audit_log')
    history = digest('audit_log','audit_id',f'audit_id<={history_id}')
    expected_permissions = success(mapping_cte + "SELECT jsonb_agg(jsonb_build_array(user_id,coalesce(mapping.new,p.right_code),is_deleted) ORDER BY user_id,coalesce(mapping.new,p.right_code)) FROM public.user_permission p LEFT JOIN mapping ON p.right_code=mapping.old")
    original_permission_count = success('SELECT count(*) FROM public.user_permission')
    renamed_permission_count = int(success(mapping_cte + 'SELECT count(*) FROM public.user_permission p JOIN mapping ON p.right_code=mapping.old'))
    snapshot_tables = [('role','role_code'),('module','module_code'),('rights_catalogue','right_code'),
                       ('app_user','user_id'),('user_permission','user_id,right_code'),
                       ('auth_session','sid'),('password_reset_token','id'),('audit_log','audit_id')]
    before_state = {name: digest(name,order) for name,order in snapshot_tables}
    def unchanged_after_failure():
        assert {name: digest(name,order) for name,order in snapshot_tables} == before_state, 'Failed transaction left partial data changes'

    for setup, expected in [
        ("INSERT INTO public.rights_catalogue(right_code,module_code,description) VALUES('dept.add','human_resources','Add Department');", 'Both old and issue codes'),
        ("UPDATE public.rights_catalogue SET description='Conflicting action' WHERE right_code='department.add';", 'conflicting, unknown or disabled'),
        ("UPDATE public.user_permission SET is_deleted=true WHERE right_code='department.add'; UPDATE public.rights_catalogue SET is_deleted=true WHERE right_code='department.add';", 'conflicting, unknown or disabled'),
    ]:
        result = query('BEGIN;\n' + setup + '\n' + migration)
        assert result.returncode and expected in result.stderr, 'Conflict preflight did not fail as expected'
        assert schema() == before_schema and digest('audit_log','audit_id',f'audit_id<={history_id}') == history
        unchanged_after_failure()
    print('PASS: duplicate identities, conflicting descriptions and disabled rights fail without persistent changes')
    for candidate,expected in [
        (raw_migration,'requires a private setup digest'),
        (configure({**proofs, 'unapproved@example.test': next(iter(proofs.values()))}), 'unapproved account'),
        (configure({email:{**value,'expires_at':'2000-01-01T00:00:00Z'} for email,value in proofs.items()}),'must expire'),
        (configure({email:{**value,'hash':'a'*64} for email,value in proofs.items()}),'unique per account'),
    ]:
        result=query(candidate)
        assert result.returncode and expected in result.stderr, 'Unsafe setup configuration was accepted'
        assert schema()==before_schema
        unchanged_after_failure()
    print('PASS: missing/expired/reused setup proofs and unapproved provisioning configuration fail atomically')
    injected = migration.rsplit('COMMIT;',1)[0] + 'SELECT 1/0;\nCOMMIT;\n'
    result = query(injected)
    assert result.returncode and 'division by zero' in result.stderr, 'Rollback injection did not reach the end'
    assert schema() == before_schema, 'Failure did not restore FK/schema'
    assert digest('audit_log','audit_id',f'audit_id<={history_id}') == history
    assert success('SELECT count(*) FROM public.rights_catalogue WHERE right_code=\'department.add\'') == '1'
    unchanged_after_failure()
    print('PASS: injected failure rolls back catalogue/permission changes, audit additions and FK deferrability')
    success(migration)
    assert schema() == before_schema, 'Migration left a schema/function/trigger/grant change'
    success((ROOT / 'database/tests/validate_dba05_issue_catalogue.sql').read_text())
    assert success('SELECT count(*) FROM public.rights_catalogue WHERE NOT is_deleted') == '36'
    print('PASS: migration applies; exact 36 issue codes/action descriptions/mappings and five modules verified')
    actual_permissions = success('SELECT jsonb_agg(jsonb_build_array(user_id,right_code,is_deleted) ORDER BY user_id,right_code) FROM public.user_permission')
    assert actual_permissions == expected_permissions
    assert success('SELECT count(*) FROM public.user_permission') == original_permission_count
    assert success('SELECT count(*) FROM public.user_permission p LEFT JOIN public.rights_catalogue r USING(right_code) WHERE r.right_code IS NULL') == '0'
    for table,order in [('app_user','user_id'),('auth_session','sid'),('password_reset_token','id'),('role','role_code'),('module','module_code')]:
        assert digest(table,order,not_approved if table=='app_user' else 'true') == preserved[table], f'{table} changed'
    assert digest('audit_log','audit_id',f'audit_id<={history_id}') == history
    print('PASS: all active/revoked/deleted-user associations preserved one-to-one; no orphans or account/security/session/history changes')
    assert success(f"SELECT count(*) FROM public.app_user WHERE email IN ({emails}) AND role='superadmin' AND status='active' AND NOT blocked AND NOT is_deleted AND password_hash IS NULL AND must_change_password AND setup_token_hash IS NOT NULL") == '3'
    assert success('SELECT count(*) FROM public.app_user') == '6'
    assert int(success(f'SELECT count(*) FROM public.audit_log WHERE audit_id>{history_id}')) == 18 + renamed_permission_count + 1 + 3, 'Unexpected duplicate/missing reconciliation audit events'
    assert success(f"SELECT count(*) FROM public.audit_log WHERE audit_id>{history_id} AND NOT (action='EDIT' OR (action='ADD' AND table_name='app_user'))") == '0'
    assert success(f"SELECT count(*) FROM public.audit_log WHERE audit_id>{history_id} AND table_name NOT IN ('rights_catalogue','user_permission','app_user')") == '0'
    audit_after = digest('audit_log','audit_id')
    permissions_after = digest('user_permission','user_id,right_code')
    rights_after = digest('rights_catalogue','right_code')
    account_after = digest('app_user','user_id')
    success(raw_migration)
    assert digest('app_user','user_id')==account_after
    assert schema() == before_schema and digest('audit_log','audit_id') == audit_after
    assert digest('user_permission','user_id,right_code') == permissions_after and digest('rights_catalogue','right_code') == rights_after
    print('PASS: exact rerun is a complete data/audit no-op; original non-deferrable FK restored')
    # Test inserts into an empty catalogue using the exact same merged schema.
    empty_db = 'hopedb_dba05_empty'
    subprocess.run(['createdb',empty_db],check=True)
    success(before_schema,empty_db)
    success("INSERT INTO public.role(role_code,description) VALUES('user','User'),('admin','Admin'),('superadmin','Superadmin');",empty_db)
    success(migration,empty_db)
    success(raw_migration,empty_db)
    success((ROOT / 'database/tests/validate_dba05_issue_catalogue.sql').read_text(),empty_db)
    assert success('SELECT count(*) FROM public.app_user',empty_db) == '3'
    print('PASS: missing modules/rights and exactly three approved accounts inserted; no placeholder identities')
    # A settled or unavailable approved account must never be reset/reactivated.
    success(f"UPDATE public.app_user SET password_hash='$2b$12$'||repeat('b',53),must_change_password=false,setup_token_hash=NULL,setup_token_expires_at=NULL,blocked=true,status='inactive',is_deleted=true WHERE email='{roster[0]['email']}'")
    settled = digest('app_user','user_id')
    settled_audit = digest('audit_log','audit_id')
    success(raw_migration)
    assert digest('app_user','user_id')==settled and digest('audit_log','audit_id')==settled_audit
    result=query(f"BEGIN; UPDATE public.app_user SET role='user' WHERE email='{roster[1]['email']}';\n"+raw_migration)
    assert result.returncode and 'existing account identity/role' in result.stderr
    assert digest('app_user','user_id')==settled and digest('audit_log','audit_id')==settled_audit
    print('PASS: existing password/block/status/deleted state preserved; conflicting existing account is never promoted')
    print('PASS: approved three-person roster seeded; issue wording still says five and shared deployment remains unperformed')


if __name__ == '__main__':
    main()
