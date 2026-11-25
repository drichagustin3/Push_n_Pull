"""Run the Department HTTP suite against a fresh loopback-only PostgreSQL cluster."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
SNAPSHOT = ROOT / "supabase" / "schemas" / "public"
DATABASE = "hope_department_test"


def main():
    pg_bin = os.environ.get("HOPE_TEST_PG_BIN")
    if not pg_bin:
        pg_bin = subprocess.check_output(["pg_config", "--bindir"], text=True).strip()
    pg_bin = Path(pg_bin)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = str(listener.getsockname()[1])

    env = {key: value for key, value in os.environ.items() if not key.upper().startswith("PG")}
    env.update(PGHOST="127.0.0.1", PGPORT=port, PGDATABASE=DATABASE,
               PGUSER="department_test", PGSSLMODE="disable", PGCLIENTENCODING="UTF8",
               DEPARTMENT_INTEGRATION="1", NODE_ENV="test")

    def run(program, *args, sql=None, quiet=False):
        executable = str(pg_bin / (program + (".exe" if os.name == "nt" else ""))) if program != "node" else program
        return subprocess.run([executable, *map(str, args)], cwd=ROOT, env=env, input=sql,
                              text=True, encoding="utf-8", check=True,
                              stdout=subprocess.DEVNULL if quiet else None)

    def apply(sql):
        run("psql", "-X", "-v", "ON_ERROR_STOP=1", sql=sql, quiet=True)

    with tempfile.TemporaryDirectory(prefix="hope-department-pg-") as tmp:
        data = Path(tmp) / "data"
        run("initdb", "-D", data, "-U", env["PGUSER"], "--auth=trust", "--encoding=UTF8", quiet=True)
        run("pg_ctl", "-D", data, "-l", Path(tmp) / "postgres.log", "-o",
            f"-p {port} -h 127.0.0.1 -c cluster_name=hope-department-disposable", "-w", "start")
        try:
            run("createdb", DATABASE)
            for migration in ["20261114121000_dba02_base_tables.sql", "20261116070000_dba03_rbac_schema.sql",
                              "20261117070000_dba04_password_reset_token.sql", "20261119070000_dba06_audit_trail.sql"]:
                run("psql", "-X", "-v", "ON_ERROR_STOP=1", "-f", MIGRATIONS / migration, quiet=True)
            # Add the existing snapshot fields to the base migration fixture. Keep its Job History FK and seed data.
            apply("""ALTER TABLE public.department ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
                       ADD COLUMN stamp varchar(60);
                     ALTER TABLE public.jobhistory ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;
                     UPDATE public.rights_catalogue SET right_code = replace(right_code, 'department.', 'dept.')
                       WHERE module_code = 'human_resources' AND right_code LIKE 'department.%';""")
            for function in ["audit_stamp", "trg_set_stamp", "trg_audit_log", "trg_block_hard_delete", "trg_check_children"]:
                apply((SNAPSHOT / "functions" / (function + ".sql")).read_text().split("\nGRANT ", 1)[0])
            department = (SNAPSHOT / "tables" / "department.sql").read_text()
            apply("CREATE TRIGGER " + department.split("CREATE TRIGGER ", 1)[1].split("\nGRANT ", 1)[0])
            apply((SNAPSHOT / "views" / "department_active.sql").read_text().split("\nGRANT ", 1)[0])
            run("node", "--test", "test/departments-postgres.test.js")
        finally:
            run("pg_ctl", "-D", data, "-m", "fast", "-w", "stop")


if __name__ == "__main__":
    main()
