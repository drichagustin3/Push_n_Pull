"""Create a fresh local-only PostgreSQL cluster for Customer HTTP integration tests.

Never connects to an existing cluster, shares data, or generates onboarding proofs.
Requires POSIX, Python 3, PostgreSQL server/client tools and installed Node deps.
"""
import os, subprocess, tempfile, pathlib, shutil
root=pathlib.Path(__file__).resolve().parents[2]
if os.name != 'posix':
    raise SystemExit('Use Codespaces/Linux for this disposable Unix-socket runner; never point it at Windows/Supabase.')
pg_config=shutil.which('pg_config')
if not pg_config:
    raise SystemExit('Install PostgreSQL server/client tools, including pg_config, first.')
bindir=subprocess.check_output([pg_config,'--bindir'],text=True).strip()
for tool in ['initdb','pg_ctl','psql','pg_dump','createdb']:
    if not (pathlib.Path(bindir)/tool).is_file():
        raise SystemExit('PostgreSQL server/client tool is missing: '+tool)
base=pathlib.Path(tempfile.mkdtemp(prefix='hope-customer-list-test-'));base.chmod(0o700)
socket=base/'socket';socket.mkdir(mode=0o700);data=base/'data'
env={k:v for k,v in os.environ.items() if not k.startswith(('PG','VERCEL','DATABASE_URL'))}
env.update(PATH=bindir+os.pathsep+env['PATH'],PGHOST=str(socket),PGPORT='55463',PGUSER='customer_review',PGDATABASE='hopedb_customer_test',PGSSLMODE='disable',NODE_ENV='test')
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
 run(['createdb','hopedb_customer_test'])
 run(['psql','-X','-v','ON_ERROR_STOP=1'],schema,log='schema.log')
 for name in ['20261116070000_dba03_rbac_schema.sql','20261117070000_dba04_password_reset_token.sql','20261119070000_dba06_audit_trail.sql']:
  run(['psql','-X','-v','ON_ERROR_STOP=1','-f',str(migration/name)],log=name+'.log')
 # Match the user-verified customer contract in THIS DISPOSABLE DB only.
 run(['psql','-X','-v','ON_ERROR_STOP=1'],"ALTER TABLE customer ADD COLUMN is_deleted boolean NOT NULL DEFAULT false, ADD COLUMN stamp varchar(60);",log='customer-contract.log')
 print('Fresh disposable cluster, TCP disabled: '+str(base),flush=True)
 print(run(['node','--test','test/customers-postgres.test.js'],extra={'CUSTOMERS_INTEGRATION':'1'},log='customers-live.log'),flush=True)
finally:
 run(['pg_ctl','-D',str(data),'-m','fast','-w','stop'])
 print('Cluster stopped; logs: '+str(base),flush=True)
