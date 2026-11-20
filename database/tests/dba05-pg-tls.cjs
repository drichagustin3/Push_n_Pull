const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Client } = require('pg');
const fs = require('node:fs');

test('Disposable PostgreSQL TLS: encryption, trusted CA and hostname verification', {
  skip: process.env.DBA05_TLS_TEST !== '1' ? 'Requires isolated loopback TLS cluster and test CA.' : false,
}, async () => {
  assert.ok(process.env.PGHOST?.startsWith('/') && process.env.PGDATABASE === 'hopedb');
  const ca = fs.readFileSync(process.env.DBA05_TEST_CA,'utf8');
  const options = {host:'127.0.0.1',port:Number(process.env.PGPORT),database:'hopedb',
    user:process.env.PGUSER,connectionTimeoutMillis:3000};
  const db = new Client({...options,ssl:{ca,rejectUnauthorized:true,servername:'localhost'}});
  try {
    await db.connect();
    assert.equal(db.connection.stream.authorized,true);
    assert.equal((await db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
  } finally { await db.end(); }
  for (const ssl of [{ca,rejectUnauthorized:true,servername:'wrong.example'},
    {rejectUnauthorized:true,servername:'localhost'}]) {
    const invalid = new Client({...options,ssl});
    try { await assert.rejects(invalid.connect()); } finally { await invalid.end(); }
  }
});
