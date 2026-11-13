const express = require('express');
const path = require('node:path');
const { registrationRouter } = require('./registration/routes');
const { createSessionMiddleware } = require('./auth/session');
const { authRouter } = require('./auth/routes');

function createApp({ pool, authConfig, sessionStore } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (authConfig) app.set('trust proxy', authConfig.trustProxy);
  app.use(express.json({ limit: '100kb' }));

  // Liveness only: database connectivity is checked separately during startup.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/register', registrationRouter(pool));
  app.get('/register', (req, res) => res.sendFile(path.resolve(__dirname, '../public/register.html')));
  app.get('/register.js', (req, res) => res.sendFile(path.resolve(__dirname, '../public/register.js')));
  app.get('/register.css', (req, res) => res.sendFile(path.resolve(__dirname, '../public/register.css')));
  app.get('/login', (req, res) => res.sendFile(path.resolve(__dirname, '../public/login.html')));
  app.get('/auth.js', (req, res) => res.sendFile(path.resolve(__dirname, '../public/auth.js')));
  if (authConfig) {
    const sessions = createSessionMiddleware(pool, authConfig, sessionStore);
    app.locals.closeAuthStore = () => sessions.store.close?.();
    app.use(authRouter(pool, authConfig, sessions.middleware));
  }

  // Add future task routes above these terminal handlers.
  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body is too large.' });
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = { createApp };
