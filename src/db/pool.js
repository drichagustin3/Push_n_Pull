const { Pool } = require('pg');

function createPool(databaseConfig, logger = console) {
  const pool = new Pool(databaseConfig);
  // pg removes failed idle clients. Handle the event without logging driver details.
  pool.on('error', () => logger.error('An idle database connection failed.'));
  return pool;
}

async function verifyConnection(pool) {
  await pool.query('SELECT 1');
}

module.exports = { createPool, verifyConnection };
