"""Create a fresh local-only PostgreSQL cluster for Product catalog HTTP integration tests.

Never connects to an existing cluster, shares data, or generates onboarding proofs.
Requires POSIX, Python 3, PostgreSQL server/client tools and installed Node deps.
"""
import os, subprocess, tempfile, pathlib, shutil, sys
root=pathlib.Path(__file__).resolve().parents[2]
if os.name != 'posix':
    raise SystemExit('Use Codespaces/Linux for this disposable Unix-socket runner; never point it at Windows/Supabase.')
if not (root/'src/customers/mutations.js').is_file():
    raise SystemExit('Run this nine-action suite in the disposable combined Customer/Product checkout documented in docs/S2-DEV-08.md; Customer CRUD is not on the Product stack.')
pg_config=shutil.which('pg_config')
if not pg_config:
    raise SystemExit('Install PostgreSQL server/client tools, including pg_config, first.')
bindir=subprocess.check_output([pg_config,'--bindir'],text=True).strip()
for tool in ['initdb','pg_ctl','psql','pg_dump','createdb']:
    if not (pathlib.Path(bindir)/tool).is_file():
        raise SystemExit('PostgreSQL server/client tool is missing: '+tool)
base=pathlib.Path(tempfile.mkdtemp(prefix='hope-action-rights-test-'));base.chmod(0o700)
socket=base/'socket';socket.mkdir(mode=0o700);data=base/'data'
env={k:v for k,v in os.environ.items() if not k.startswith(('PG','VERCEL','DATABASE_URL'))}
env.update(PATH=bindir+os.pathsep+env['PATH'],PGHOST=str(socket),PGPORT='55463',PGUSER='product_review',PGDATABASE='hopedb_product_test',PGSSLMODE='disable',NODE_ENV='test')
def run(args,sql=None,log=None,extra=None):
 r=subprocess.run(args,input=sql,text=True,env={**env,**(extra or {})},cwd=root,capture_output=True)
 if log:(base/log).write_text(r.stdout+r.stderr)
 if r.returncode: raise RuntimeError('Failed '+str(args)+'; see '+str(base))
 return r.stdout
run(['initdb','-D',str(data),'--auth-local=trust','--auth-host=reject','-U',env['PGUSER']],log='init.log')
run(['pg_ctl','-D',str(data),'-l',str(base/'server.log'),'-o',f"-k {socket} -p 55463 -c listen_addresses=''",'-w','start'])
try:
 run(['createdb','base_schema_source'])
 migration=root/'supabase/migrations'
 run(['psql','-X','-v','ON_ERROR_STOP=1','-d','base_schema_source','-f',str(migration/'20261114121000_dba02_base_tables.sql')],log='base.log')
 schema=run(['pg_dump','--schema-only','--no-owner','--no-privileges','-d','base_schema_source'])
 run(['createdb','hopedb_product_test'])
 run(['psql','-X','-v','ON_ERROR_STOP=1'],schema,log='schema.log')
 for name in ['20261116070000_dba03_rbac_schema.sql','20261117070000_dba04_password_reset_token.sql','20261119070000_dba06_audit_trail.sql']:
  run(['psql','-X','-v','ON_ERROR_STOP=1','-f',str(migration/name)],log=name+'.log')
 missing=run(['psql','-X','-At','-v','ON_ERROR_STOP=1'],"SELECT table_name||'.'||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('product','pricehist') AND column_name IN ('is_deleted','stamp') ORDER BY table_name,column_name;",log='migration-only-columns.log')
 assert not missing.strip(), 'Unexpected contract change: review fixture setup before continuing'
 # Match the tracked product/price-history contract in THIS DISPOSABLE DB only.
 run(['psql','-X','-v','ON_ERROR_STOP=1'],"ALTER TABLE product ADD COLUMN is_deleted boolean NOT NULL DEFAULT false, ADD COLUMN stamp varchar(60); ALTER TABLE pricehist ADD COLUMN is_deleted boolean NOT NULL DEFAULT false, ADD COLUMN stamp varchar(60);",log='product-contract.log')
 # Existing authentication regression runs against its own fresh database.
 run(['createdb','hopedb_auth_test'])
 run(['psql','-X','-v','ON_ERROR_STOP=1','-d','hopedb_auth_test'],schema,log='auth-schema.log')
 for name in ['20261116070000_dba03_rbac_schema.sql','20261117070000_dba04_password_reset_token.sql','20261119070000_dba06_audit_trail.sql']:
  run(['psql','-X','-v','ON_ERROR_STOP=1','-d','hopedb_auth_test','-f',str(migration/name)],log='auth-'+name+'.log')
 run(['psql','-X','-v','ON_ERROR_STOP=1','-d','hopedb_auth_test'],"INSERT INTO employee(empno,firstname,lastname) VALUES('00001','Auth','Fixture');",log='auth-fixture.log')
 print(run(['node','--test','test/auth-postgres.test.js'],extra={'PGDATABASE':'hopedb_auth_test','AUTH_INTEGRATION':'1','AUTH_VERIFY_DBA04':'1'},log='auth-live.log'),flush=True)
 # Install tracked business audit functions only into this disposable fixture.
 for function in ['audit_stamp','trg_set_stamp','trg_audit_log']:
  sql=(root/'supabase/schemas/public/functions'/ (function+'.sql')).read_text().split('\nGRANT ')[0]
  run(['psql','-X','-v','ON_ERROR_STOP=1'],sql,log=function+'.log')
 run(['psql','-X','-v','ON_ERROR_STOP=1'],"CREATE TRIGGER product_biu_stamp BEFORE INSERT OR UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_set_stamp(); CREATE TRIGGER product_aiu_audit AFTER INSERT OR UPDATE ON product FOR EACH ROW EXECUTE FUNCTION trg_audit_log('prodcode');",log='triggers.log')
 print('Fresh disposable cluster, TCP disabled: '+str(base),flush=True)
 print(run(['node','--test','test/product-write-postgres.test.js'],extra={'PRODUCT_WRITE_INTEGRATION':'1'},log='products-live.log'),flush=True)
 print(run(['node','--test','test/product-state-postgres.test.js'],extra={'PRODUCT_STATE_INTEGRATION':'1'},log='states-live.log'),flush=True)
 print(run(['node','--test','test/price-history-postgres.test.js'],extra={'PRICE_HISTORY_INTEGRATION':'1'},log='price-history-live.log'),flush=True)
 print(run(['node','--test','test/action-rights-postgres.test.js'],extra={'ACTION_RIGHTS_INTEGRATION':'1'},log='action-rights-live.log'),flush=True)
 if '--browser' in sys.argv:
  if not env.get('HOPE_PLAYWRIGHT_MODULE'):
   raise RuntimeError('Set HOPE_PLAYWRIGHT_MODULE to an external Playwright installation for optional browser checks.')
  print(run(['node','database/tests/action_rights_browser.cjs'],extra={'ACTION_RIGHTS_INTEGRATION':'1'},log='browser.log'),flush=True)
finally:
 run(['pg_ctl','-D',str(data),'-m','fast','-w','stop'])
 print('Cluster stopped; logs: '+str(base),flush=True)
