const { createServer } = require('node:http');
const { createApp } = require('./app');
const { ConfigurationError, loadConfig } = require('./config/env');
const { createPool, verifyConnection } = require('./db/pool');
const { readAuthConfig } = require('./auth/config');
const { verifyAuthSchema } = require('./auth/service');

async function startServer({ config, pool }) {
  let server;
  let app;
  try {
    await verifyConnection(pool);
    if (config.auth) await verifyAuthSchema(pool);
    app = createApp({ pool, authConfig: config.auth });
    server = createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    try { await app?.locals.closeAuthStore?.(); } finally { await pool.end(); }
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
        try { await app.locals.closeAuthStore?.(); } finally { await pool.end(); }
      }
    })();
    return shutdownPromise;
  }

  return { server, shutdown };
}

async function main() {
  try {
    const config = loadConfig();
    config.auth = readAuthConfig(process.env, config.nodeEnv);
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
      : 'Startup failed. Check database schema, availability, and HTTP port configuration.');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = { startServer };
