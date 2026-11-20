const { isStrongPassword } = require('../security/password');
const { InvalidResetToken, deliverReset, completeReset } = require('./service');

const GENERIC_MESSAGE = 'If an active account exists for that email, a reset link has been sent.';
const objectBody = (body, keys) => body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every((key) => keys.includes(key));

function createResetController(pool, mailer, queue, logger) {
  return {
    async request(req, res) {
  const body = req.body;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!objectBody(body, ['email']) || email.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  try {
    const accepted = await queue.enqueueAndWait(
      () => deliverReset(pool, email, mailer, logger)
    );

    if (!accepted) logger.error('Password reset delivery queue is unavailable.');
  } catch {
    logger.error('Password reset request processing failed.');
  }

  res.json({ message: GENERIC_MESSAGE });
},
    async complete(req, res) {
      const body = req.body;
      if (!objectBody(body, ['token', 'newPassword', 'confirmPassword']) || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return res.status(400).json({ error: 'Invalid or expired password reset token' });
      if (!isStrongPassword(body.newPassword) || body.newPassword !== body.confirmPassword) return res.status(400).json({ error: 'Passwords must match and contain at least 12 characters, uppercase, lowercase, and a digit; maximum 72 UTF-8 bytes.' });
      try {
        await completeReset(pool, body.token, body.newPassword);
        res.json({ message: 'Password updated. Please sign in with your new password.' });
      } catch (error) {
        if (error instanceof InvalidResetToken) return res.status(400).json({ error: 'Invalid or expired password reset token' });
        logger.error('Password reset completion failed.');
        res.status(500).json({ error: 'Password reset is temporarily unavailable. Try again later.' });
      }
    },
  };
}

module.exports = { createResetController, GENERIC_MESSAGE };
