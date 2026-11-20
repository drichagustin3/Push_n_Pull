const { requireAuth } = require('../auth/middleware');
const { invalidateSession } = require('../auth/session');
const { AuthError } = require('../auth/service');
const { loadAccess, forbidden } = require('./service');

function createAuthorization(pool, config) {
  const authenticate = requireAuth(pool, config);
  const guard = (allowed) => (req, res, next) => authenticate(req, res, (error) => {
    if (error) return next(error);
    void (async () => {
      try {
        req.access = await loadAccess(pool, req.auth);
        if (!allowed(req.access)) throw forbidden();
        next();
      } catch (failure) {
        if (failure instanceof AuthError && failure.code !== 'forbidden') {
          try { await invalidateSession(req, res, config); } catch { return next(new Error('Session invalidation failed.')); }
        }
        next(failure);
      }
    })();
  });
  return {
    requireAccess: guard(() => true),
    requireRole: (...roles) => guard((access) => roles.includes(access.user.role)),
    requireModuleAccess: (code) => guard((access) => access.modules.has(code)),
    requireRight: (code) => guard((access) => access.rights.has(code)),
  };
}
module.exports = { createAuthorization };
