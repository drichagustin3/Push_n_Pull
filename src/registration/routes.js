const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { validateRequest } = require('./validation');
const { registrationController } = require('./controller');

function registrationRouter(pool) {
  const router = Router();
  router.post('/', rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many registration attempts. Please try again later.' },
  }), (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json.' });
    next();
  }, validateRequest, registrationController(pool));
  return router;
}

module.exports = { registrationRouter };
