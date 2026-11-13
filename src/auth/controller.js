const { authenticate, setInitialPassword, AuthError } = require('./service');
const { establishSession, invalidateSession } = require('./session');
const { loginInput, passwordInput } = require('./validation');

const publicUser = (user) => ({ id: String(user.user_id), email: user.email, status: user.status, requires_password_reset: user.must_change_password || !user.password_hash });

function authController(pool, config) {
  return {
    async login(req, res) {
      const input = loginInput(req.body);
      if (!input) throw new AuthError(400, 'validation_error', 'Provide an email and either a password or setup token.');
      const { user, restricted, credential } = await authenticate(pool, input);
      await establishSession(req, user, restricted, credential);
      res.json({ user: publicUser(user), message: restricted ? 'Password setup required before continuing.' : 'Login successful.', redirect: restricted ? '/set-password' : '/account' });
    },
    async setPassword(req, res) {
      const password = passwordInput(req.body);
      if (!password) throw new AuthError(400, 'validation_error', 'Passwords must match and contain at least 12 characters, uppercase, lowercase, and a digit; maximum 72 UTF-8 bytes.');
      const user = await setInitialPassword(pool, req.auth, password);
      await establishSession(req, user, false);
      res.json({ user: publicUser(user), message: 'Password updated successfully. Full session active.', redirect: '/account' });
    },
    async logout(req, res) {
      await invalidateSession(req, res, config);
      res.json({ message: 'Logged out successfully.' });
    },
    session(req, res) { res.json({ user: publicUser(req.auth.user), message: 'Session active.' }); },
  };
}

module.exports = { authController };
