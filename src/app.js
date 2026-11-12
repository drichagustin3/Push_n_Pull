const express = require('express');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Liveness only: database connectivity is checked separately during startup.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

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
