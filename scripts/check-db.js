const { ConfigurationError, loadConfig } = require('../src/config/env');
const { createPool, verifyConnection } = require('../src/db/pool');

async function main() {
  let pool;
  try {
    pool = createPool(loadConfig().database);
    await verifyConnection(pool);
    console.log('Database connection verified.');
  } catch (error) {
    console.error(error instanceof ConfigurationError
      ? `Configuration error: ${error.message}`
      : 'Database connection failed. Check PostgreSQL availability and PG settings.');
    process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
  }
}

void main().catch(() => {
  console.error('Database connection cleanup failed.');
  process.exitCode = 1;
});
