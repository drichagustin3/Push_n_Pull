#!/usr/bin/env node
// DBA operator tool, not application code. Never prints raw proofs or digests.
const { Client } = require('pg');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { connectionOptions, protectPrivate } = require('./dba05-safety.cjs');

async function provision() {
  const check = process.argv.length === 3 && process.argv[2] === '--check';
  if (!check && process.argv.length !== 2) throw new Error('Supported option: --check (read-only).');
  if (!check && process.env.DBA05_ALLOW_PROVISION !== '1') {
    throw new Error('DBA05_ALLOW_PROVISION=1 is required for provisioning.');
  }
  const root = path.resolve(__dirname, '../..');
  const options = connectionOptions(process.env, root);
  const privateBase = await fs.realpath(os.tmpdir());
  const realRoot = await fs.realpath(root);
  if (privateBase === realRoot || privateBase.startsWith(realRoot + path.sep)) {
    throw new Error('The private temporary directory must be outside the repository.');
  }
  const approved = JSON.parse(await fs.readFile(path.join(root, 'database/seeds/dba05-superadmins.json'), 'utf8'));
  const migration = await fs.readFile(path.join(root, 'supabase/migrations/20261119060000_dba05_catalogue_seed.sql'), 'utf8');
  if (approved.length !== 3 || new Set(approved.map((row) => row.email)).size !== 3) throw new Error('Invalid approved roster.');
  const statements = migration.replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, '');
  const client = new Client(options);
  let privateFile;
  let connected = false;
  try {
    await client.connect(); connected = true;
    if (options.ssl && (!client.connection.stream.encrypted || !client.connection.stream.authorized)) {
      throw new Error('Verified TLS is required.');
    }
    if (check) {
      await client.query('BEGIN READ ONLY');
      const identity = (await client.query('SELECT current_database() AS database, current_user AS user')).rows[0];
      if (identity.database !== options.database || (options.user && identity.user !== options.user)) throw new Error('Connected identity mismatch.');
      const tables = ['app_user','role','module','rights_catalogue','user_permission','audit_log','auth_session'];
      const objects = (await client.query(`SELECT c.relname, c.relrowsecurity AS rls,
        pg_get_userbyid(c.relowner)=current_user AS owned,
        has_table_privilege(c.oid,'SELECT') AS readable
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])`, [tables])).rows;
      if (objects.length !== tables.length || objects.some((row) => !row.readable)) throw new Error('Missing required tables or read privileges.');
      const counts = (await client.query(`SELECT
        (SELECT count(*)::int FROM public.module WHERE NOT is_deleted) AS modules,
        (SELECT count(*)::int FROM public.rights_catalogue WHERE NOT is_deleted) AS rights,
        (SELECT count(*)::int FROM public.role WHERE NOT is_deleted AND role_code IN ('user','admin','superadmin')) AS roles`)).rows[0];
      const accounts = (await client.query(`SELECT email,role,status,blocked,is_deleted,
        password_hash IS NOT NULL AS password_set,setup_token_hash IS NOT NULL AS proof_present,
        setup_token_expires_at>now() AS proof_unexpired FROM public.app_user WHERE email=ANY($1::text[])`, [approved.map((row) => row.email)])).rows;
      const exposure = (await client.query(`SELECT c.relname, r.rolname,
        (has_table_privilege(r.oid,c.oid,'SELECT') OR has_any_column_privilege(r.oid,c.oid,'SELECT')) AS can_select,
        (has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE') OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE')) AS can_mutate
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN pg_roles r WHERE n.nspname='public' AND c.relkind='r'
        AND r.rolname IN ('anon','authenticated') ORDER BY c.relname,r.rolname`)).rows;
      const publicGrants = (await client.query(`SELECT DISTINCT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_attribute col ON col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped
        CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)) || coalesce(col.attacl,'{}'::aclitem[])) a
        WHERE n.nspname='public' AND c.relkind='r' AND a.grantee=0 ORDER BY c.relname`)).rows;
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ host: options.host, port: options.port, ...identity,
        verifiedTLS: Boolean(options.ssl), tables: objects, counts, accounts, dataApiPrivileges: exposure, publicGrants }, null, 2));
      return;
    }
    const identity = (await client.query('SELECT current_database() AS database, current_user AS user')).rows[0];
    if (identity.database !== options.database || (options.user && identity.user !== options.user)) throw new Error('Connected identity mismatch.');
    // Credential/session material must not be reachable through Supabase's Data
    // API roles, even when an RLS policy currently appears restrictive. Do not
    // silently modify grants or policies from this operator tool.
    const unsafe = await client.query(`SELECT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN pg_roles r WHERE n.nspname='public'
      AND c.relname IN ('app_user','auth_session','password_reset_token','audit_log')
      AND r.rolname IN ('anon','authenticated')
      AND (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))
      UNION ALL
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE n.nspname='public' AND c.relname IN ('app_user','auth_session','password_reset_token','audit_log')
      AND a.grantee=0
      UNION ALL
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute col ON col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped
      CROSS JOIN LATERAL aclexplode(col.attacl) a
      WHERE n.nspname='public' AND c.relname IN ('app_user','auth_session','password_reset_token','audit_log')
      AND a.grantee=0
    ) AS exposed`);
    if (unsafe.rows[0].exposed) throw new Error('Sensitive tables have API/PUBLIC grants; separate privilege review required.');
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query('SELECT pg_advisory_xact_lock(1213157445,6)');
    const existing = new Set((await client.query('SELECT email FROM public.app_user WHERE email=ANY($1::text[])', [approved.map((row) => row.email)])).rows.map((row) => row.email));
    const proofs = {}, deliveries = [];
    for (const account of approved.filter((row) => !existing.has(row.email))) {
      const token = randomBytes(32).toString('hex');
      const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      proofs[account.email] = { hash: createHash('sha256').update(token).digest('hex'), expires_at };
      deliveries.push({ email: account.email, setup_token: token, expires_at });
    }
    // Save BEFORE COMMIT, so a disk failure cannot orphan a committed account.
    // Preserve this file if commit outcome is uncertain; never rotate an existing proof.
    if (deliveries.length) {
      const privateDir = await fs.mkdtemp(path.join(privateBase, 'hope-dba05-onboarding-'));
      protectPrivate(privateDir, true);
      privateFile = path.join(privateDir, 'private-delivery.json');
      await fs.writeFile(privateFile, '', { mode: 0o600, flag: 'wx' });
      protectPrivate(privateFile, false);
      await fs.writeFile(privateFile, JSON.stringify(deliveries, null, 2) + '\n', { flag: 'r+' });
    }
    // Only digests/expiry reach PostgreSQL; no raw proof enters SQL or audit JSON.
    // Parameter binding avoids interpolating private configuration into SQL text.
    await client.query("SELECT set_config('hope.dba05_setup',$1,true)", [JSON.stringify(proofs)]);
    await client.query(statements);
    await client.query('COMMIT');
    console.log('DBA-05 seed completed. Existing account credentials/security state preserved.');
    if (privateFile) console.log('Private delivery file (' + (process.platform === 'win32' ? 'owner-only ACL' : '0600') + ', outside Git): ' + privateFile);
    else console.log('No new accounts; no setup proofs generated.');
  } catch (error) {
    if (connected) await client.query('ROLLBACK').catch(() => {});
    if (privateFile) console.error('Private delivery file retained for operator review: ' + privateFile);
    // PostgreSQL detail/context may contain sensitive values. Do not print it.
    throw new Error('Provisioning or preflight failed safely; review target, table grants, account conflicts or setup configuration.');
  } finally { if (connected) await client.end(); }
}

provision().catch((error) => { console.error('DBA-05 failed. Check approved target, TLS, privileges and configuration; no proofs are printed.'); process.exitCode = 1; });
