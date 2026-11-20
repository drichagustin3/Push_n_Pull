
const express = require('express');
const { readConfig } = require('./config/env');
const { createPool, verifyConnection } = require('./db/pool');
const { readAuthConfig } = require('./auth/config');
const { verifyAuthSchema } = require('./auth/service');
const { readResetConfig } = require('./password-reset/config');
const { createApp } = require('./app');

let appPromise;

async function initializeApp() {
  const config = readConfig(process.env);
  const authConfig = readAuthConfig(process.env, config.nodeEnv);

  // Vercel's edge proxy is the trusted forwarding hop.

  const resetConfig = readResetConfig(process.env, config.nodeEnv, authConfig);
  const pool = createPool(config.database);

  await verifyConnection(pool);
  await verifyAuthSchema(pool);

  await pool.query(
    'SELECT id,user_id,token_hash,expires_at,is_used,created_at,used_at FROM password_reset_token LIMIT 0'
  );

  return createApp({ pool, authConfig, resetConfig });
}

const handler = express();
handler.disable('x-powered-by');

handler.use(async (req, res, next) => {
  try {
    appPromise ??= initializeApp();
    const app = await appPromise;

if (process.env.VERCEL === '1') {
  Object.defineProperty(req, 'secure', {
    configurable: true,
    value: req.get('x-forwarded-proto') === 'https',
  });
}

app(req, res, next);
  } catch {
    console.error('HOPE ERP initialization failed.');
    res.status(503).json({
      error: 'service_unavailable',
      message: 'The application is temporarily unavailable. Try again later.',
    });
  }
});

module.exports = handler;