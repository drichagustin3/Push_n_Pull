#!/usr/bin/env node
// DBA operator tool, not application code. Never prints raw proofs or digests.
const { Client } = require('pg');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function provision() {
  if (process.env.DBA05_ALLOW_PROVISION !== '1' || !process.env.PGHOST || process.env.PGDATABASE !== 'hopedb') {
    throw new Error('Explicit PGHOST/PGDATABASE=hopedb and DBA05_ALLOW_PROVISION=1 are required.');
  }
  const root = path.resolve(__dirname, '../..');
  const privateBase = await fs.realpath(os.tmpdir());
  const realRoot = await fs.realpath(root);
  if (privateBase === realRoot || privateBase.startsWith(realRoot + path.sep)) {
    throw new Error('The private temporary directory must be outside the repository.');
  }
  const approved = JSON.parse(await fs.readFile(path.join(root, 'database/seeds/dba05-superadmins.json'), 'utf8'));
  const migration = await fs.readFile(path.join(root, 'supabase/migrations/20261119060000_dba05_catalogue_seed.sql'), 'utf8');
  if (approved.length !== 3 || new Set(approved.map((row) => row.email)).size !== 3) throw new Error('Invalid approved roster.');
  const statements = migration.replace(/^BEGIN;$/m, '').replace(/COMMIT;\s*$/, '');
  const client = new Client({ connectionTimeoutMillis: 5000 });
  let privateFile;
  let connected = false;
  try {
    await client.connect(); connected = true;
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
      await fs.chmod(privateDir, 0o700);
      privateFile = path.join(privateDir, 'private-delivery.json');
      await fs.writeFile(privateFile, JSON.stringify(deliveries, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    }
    // Only digests/expiry reach PostgreSQL; no raw proof enters SQL or audit JSON.
    // Parameter binding avoids interpolating private configuration into SQL text.
    await client.query("SELECT set_config('hope.dba05_setup',$1,true)", [JSON.stringify(proofs)]);
    await client.query(statements);
    await client.query('COMMIT');
    console.log('DBA-05 seed completed. Existing account credentials/security state preserved.');
    if (privateFile) console.log('Private delivery file (0600, outside Git): ' + privateFile);
    else console.log('No new accounts; no setup proofs generated.');
  } catch (error) {
    if (connected) await client.query('ROLLBACK').catch(() => {});
    if (privateFile) console.error('Private delivery file retained for operator review: ' + privateFile);
    // PostgreSQL detail/context may contain sensitive values. Do not print it.
    throw new Error('Provisioning failed safely; review account conflicts or setup configuration.');
  } finally { if (connected) await client.end(); }
}

provision().catch((error) => { console.error(error.message); process.exitCode = 1; });
