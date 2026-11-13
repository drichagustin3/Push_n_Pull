const { createServer } = require('node:http');
const { createApp } = require('./app');
const { ConfigurationError, loadConfig } = require('./config/env');
const { createPool, verifyConnection } = require('./db/pool');

async function startServer({ config, pool }) {
  const server = createServer(createApp({ pool }));
  try {
    await verifyConnection(pool);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await pool.end();
    throw error;
  }

  let shutdownPromise;
  function shutdown() {
    // Repeated signals must not close the shared pool twice.
    shutdownPromise ??= (async () => {
      try {
        await new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      } finally {
        await pool.end();
      }
    })();
    return shutdownPromise;
  }

  return { server, shutdown };
}

async function main() {
  try {
    const config = loadConfig();
    const pool = createPool(config.database);
    const { shutdown } = await startServer({ config, pool });
    console.log(`HOPE ERP listening on port ${config.port}.`);

    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      const deadline = setTimeout(() => {
        console.error('Shutdown timed out.');
        process.exit(1);
      }, 10000);
      deadline.unref();
      try {
        await shutdown();
      } catch {
        console.error('Shutdown failed.');
        process.exitCode = 1;
      } finally {
        clearTimeout(deadline);
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
      }
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  } catch (error) {
    console.error(error instanceof ConfigurationError
      ? `Configuration error: ${error.message}`
      : 'Startup failed. Check database availability and HTTP port configuration.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = { startServer };
