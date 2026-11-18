const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);

const COOKIE_NAME = 'session_id';
const FULL_TTL = 8 * 60 * 60 * 1000;
const SETUP_TTL = 10 * 60 * 1000;
const cookieOptions = (config) => ({ path: '/', httpOnly: true, secure: config.secure, sameSite: 'strict' });

function createSessionMiddleware(pool, config, store) {
  const persistentStore = store || new PgStore({
    pool, tableName: 'auth_session', createTableIfMissing: false, disableTouch: true,
    errorLog: () => console.error('Session storage maintenance failed.'),
  });
  return {
    store: persistentStore,
    middleware: session({
      name: COOKIE_NAME, secret: config.secret, store: persistentStore,
      resave: false, saveUninitialized: false, rolling: false,
      cookie: { ...cookieOptions(config), maxAge: FULL_TTL },
    }),
  };
}

const call = (target, method) => new Promise((resolve, reject) => target[method]((error) => error ? reject(error) : resolve()));

function sessionUser(user) {
  return { user_id: String(user.user_id), username: user.email, role: user.role, empno: user.empno ?? null };
}

async function establishSession(req, user, restricted, credential = 'password') {
  await call(req.session, 'regenerate');
  req.session.user = sessionUser(user);
  req.session.version = user.session_version;
  req.session.restricted = restricted;
  req.session.credential = credential;
  req.session.setupTokenHash = credential === 'token' ? user.setup_token_hash : null;
  const ttl = restricted ? SETUP_TTL : FULL_TTL;
  req.session.expiresAt = Date.now() + ttl;
  req.session.cookie.maxAge = ttl;
  try {
    await call(req.session, 'save');
  } catch (error) {
    // Prevent express-session retrying the failed save while formatting the error response.
    try { await call(req.session, 'destroy'); } finally { req.session = null; }
    throw error;
  }
}

async function invalidateSession(req, res, config) {
  res.clearCookie(COOKIE_NAME, cookieOptions(config));
  if (req.session) await call(req.session, 'destroy');
}

module.exports = { createSessionMiddleware, establishSession, invalidateSession, sessionUser };
