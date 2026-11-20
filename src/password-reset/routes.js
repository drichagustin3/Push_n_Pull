const { Router } = require('express');
const path = require('node:path');
const { rateLimit } = require('express-rate-limit');
const { createResetMailer } = require('./mail');
const { createDeliveryQueue } = require('./queue');
const { createResetController, GENERIC_MESSAGE } = require('./controller');

function resetRouter(pool, config, authConfig, { logger = console, mailer = createResetMailer(config, logger) } = {}) {
  const router = Router();
  const queue = createDeliveryQueue(logger);
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Too many password reset attempts. Try again later.' } });
  const guard = (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('origin') !== authConfig.origin || (authConfig.secure && !req.secure)) return res.status(403).json({ error: 'Request origin or transport is not allowed.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    next();
  };
  const controller = createResetController(pool, mailer, queue, logger);
  router.post(['/forgot-password', '/api/auth/forgot-password'], guard, limiter, controller.request);
  router.post(['/reset-password', '/api/auth/reset-password'], guard, limiter, controller.complete);
  router.get(['/forgot-password', '/reset-password'], (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" });
    res.sendFile(path.resolve(__dirname, `../../public/${req.path.slice(1)}.html`));
  });
  return { router, idle: () => queue.idle(), async close() { await queue.close(); mailer.close?.(); } };
}

module.exports = { resetRouter, GENERIC_MESSAGE };
