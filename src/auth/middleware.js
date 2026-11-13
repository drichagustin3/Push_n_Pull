const { checkAccount, findUser, needsSetup, unauthenticated } = require('./service');
const { invalidateSession, sessionUser } = require('./session');

function requireSession(pool, config, { allowRestricted = false } = {}) {
  return async (req, res, next) => {
    try {
      const saved = req.session;
      if (config.secure && !req.secure) throw unauthenticated();
      if (!saved?.user || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) throw unauthenticated();
      const user = await findUser(pool, saved.user.user_id);
      if (!user || user.session_version !== saved.version) throw unauthenticated();
      checkAccount(user);
      if (!saved.restricted && needsSetup(user)) throw unauthenticated();
      if (saved.restricted && (!needsSetup(user) || (saved.credential === 'token' && (user.setup_token_hash !== saved.setupTokenHash || !(new Date(user.setup_token_expires_at).getTime() > Date.now()))))) throw unauthenticated();
      req.auth = { user, version: saved.version, credential: saved.credential, setupTokenHash: saved.setupTokenHash };
      req.user = sessionUser(user);
      if (saved.restricted && !allowRestricted) {
        if (req.path === '/account') return res.redirect('/set-password');
        return res.status(403).json({ error: 'password_setup_required', message: 'Set your initial password before continuing.', redirect: '/set-password' });
      }
      // req.user is refreshed from PostgreSQL. Keep read-only requests from resaving
      // stale session snapshots after a concurrent logout.
      next();
    } catch (error) {
      if (error.status === 401 || error.status === 403) await invalidateSession(req, res, config);
      if ([401, 403].includes(error.status) && ['/account', '/set-password'].includes(req.path) && req.get('accept')?.includes('text/html')) return res.redirect('/login?terminated=1');
      next(error);
    }
  };
}

const requireAuth = (pool, config) => requireSession(pool, config);
module.exports = { requireAuth, requireSession };
