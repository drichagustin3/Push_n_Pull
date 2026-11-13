const { registerUser } = require('./service');

function registrationController(pool) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!pool) return res.status(503).json({ error: 'Registration is temporarily unavailable.' });
    try {
      await registerUser(pool, req.registration);
      res.status(201).json({
        message: 'Registration submitted. An administrator must approve your account before you can sign in.',
        status: 'pending',
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }
      res.status(500).json({ error: 'Registration failed. Please try again later.' });
    }
  };
}

module.exports = { registrationController };
