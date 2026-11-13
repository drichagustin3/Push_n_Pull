const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const path = require('node:path');
const { authController } = require('./controller');
const { requireAuth, requireSession } = require('./middleware');
const { AuthError } = require('./service');

function authRouter(pool, config, sessionMiddleware) {
  const router = Router();
  const controller = authController(pool, config);
  const restricted = requireSession(pool, config, { allowRestricted: true });
  const full = requireAuth(pool, config);
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'rate_limit_exceeded', message: 'Too many authentication attempts. Try again later.' } });
  const postGuard = (req, res, next) => {
    if (req.get('origin') !== config.origin) return res.status(403).json({ error: 'invalid_origin', message: 'Request origin is not allowed.' });
    if (config.secure && !req.secure) return res.status(400).json({ error: 'https_required', message: 'A secure HTTPS connection is required.' });
    if (!req.is('application/json')) return res.status(415).json({ error: 'unsupported_media_type', message: 'Content-Type must be application/json.' });
    next();
  };
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post(['/api/v1/auth/login', '/login'], postGuard, limiter, sessionMiddleware, controller.login);
  router.post(['/api/v1/auth/set-password', '/set-password'], postGuard, limiter, sessionMiddleware, restricted, controller.setPassword);
  // Logout can destroy expired/restricted sessions too; it never grants access.
  router.post(['/api/v1/auth/logout', '/logout'], postGuard, sessionMiddleware, controller.logout);
  router.get('/api/v1/auth/session', sessionMiddleware, full, controller.session);
  router.get('/set-password', sessionMiddleware, restricted, (req, res) => res.sendFile(path.resolve(__dirname, '../../public/set-password.html')));
  router.get('/account', sessionMiddleware, full, (req, res) => res.sendFile(path.resolve(__dirname, '../../public/account.html')));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const expected = error instanceof AuthError;
    res.status(expected ? error.status : 500).json({ error: expected ? error.code : 'authentication_unavailable', message: expected ? error.message : 'Authentication is temporarily unavailable. Try again later.' });
  });
  return router;
}

module.exports = { authRouter };
