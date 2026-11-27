const express = require('express');
const path = require('node:path');
const { registrationRouter } = require('./registration/routes');
const { createSessionMiddleware } = require('./auth/session');
const { authRouter } = require('./auth/routes');
const { resetRouter } = require('./password-reset/routes');
const { usersRouter } = require('./users/routes');
const { workspaceRouter } = require('./workspace/routes');
const { customersRouter } = require('./customers/routes');
const { productsRouter } = require('./products/routes');
const { departmentsRouter } = require('./departments/routes');

function createApp({ pool, authConfig, sessionStore, resetConfig, resetOptions } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (authConfig) app.set('trust proxy', authConfig.trustProxy);
  app.use(express.json({ limit: '100kb' }));

  // Liveness only: database connectivity is checked separately during startup.
  app.get(['/health', '/api/health'], (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/register', registrationRouter(pool));
  app.get('/register', (req, res) => res.sendFile(path.resolve(__dirname, '../public/register.html')));
  app.get('/register.js', (req, res) => res.sendFile(path.resolve(__dirname, '../public/register.js')));
  app.get('/register.css', (req, res) => res.sendFile(path.resolve(__dirname, '../public/register.css')));
  app.get('/login', (req, res) => res.sendFile(path.resolve(__dirname, '../public/login.html')));
  app.get('/auth.js', (req, res) => res.sendFile(path.resolve(__dirname, '../public/auth.js')));
  if (authConfig) {
    app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'));
});
    const sessions = createSessionMiddleware(pool, authConfig, sessionStore);
    app.locals.closeAuthStore = () => sessions.store.close?.();
    app.use(authRouter(pool, authConfig, sessions.middleware));
    app.use(usersRouter(pool, authConfig, sessions.middleware));
    app.use(customersRouter(pool, authConfig, sessions.middleware));
    app.use(productsRouter(pool, authConfig, sessions.middleware));
    app.use(departmentsRouter(pool, authConfig, sessions.middleware));
    app.use(workspaceRouter(pool, authConfig, sessions.middleware));
  }

  if (resetConfig && authConfig) {
    const resets = resetRouter(pool, resetConfig, authConfig, resetOptions);
    app.locals.closePasswordReset = () => resets.close();
    app.locals.waitForResetDelivery = () => resets.idle();
    app.use(resets.router);
  }

  app.use(express.static(path.resolve(__dirname, '../public')));

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
