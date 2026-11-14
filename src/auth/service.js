const bcrypt = require('bcrypt');
const { createHash, timingSafeEqual, randomBytes } = require('node:crypto');

const columns = `user_id, email, role, empno, password_hash, blocked, status,
  must_change_password, setup_token_hash, setup_token_expires_at, session_version`;
// Unknown accounts still incur a bcrypt comparison using a process-local dummy hash.
let dummyHash;
const getDummyHash = () => (dummyHash ??= bcrypt.hash(randomBytes(32).toString('hex'), 12));

class AuthError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const invalid = () => new AuthError(401, 'invalid_credentials', 'Invalid email or password.');
const unauthenticated = () => new AuthError(401, 'unauthenticated', 'Please sign in again.');

function checkAccount(user) {
  if (user.blocked || user.status === 'blocked') throw new AuthError(403, 'account_blocked', 'Your account has been blocked. Contact an administrator.');
  if (user.status === 'pending') throw new AuthError(403, 'account_pending', 'Your account is awaiting approval.');
  if (user.status !== 'active') throw new AuthError(403, 'account_inactive', 'Your account is not active.');
}

const needsSetup = (user) => user.must_change_password || !user.password_hash;
function validSetupToken(user, token) {
  if (!user || !needsSetup(user) || typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(user.setup_token_hash || '') || !(new Date(user.setup_token_expires_at).getTime() > Date.now())) return false;
  return timingSafeEqual(Buffer.from(user.setup_token_hash, 'hex'), createHash('sha256').update(token).digest());
}

async function findUser(pool, id) {
  const result = await pool.query(`SELECT ${columns} FROM app_user WHERE user_id = $1`, [id]);
  return result.rows[0];
}

async function verifyAuthSchema(pool) {
  await pool.query(`SELECT ${columns} FROM app_user LIMIT 0`);
  await pool.query('SELECT sid, sess, expire FROM auth_session LIMIT 0');
}

async function authenticate(pool, { email, password, setup_token: token }) {
  const result = await pool.query(`SELECT ${columns} FROM app_user WHERE email = $1`, [email]);
  const user = result.rows[0];
  const matches = password !== undefined
    ? await bcrypt.compare(password, user?.password_hash || await getDummyHash())
    : validSetupToken(user, token);
  if (!user || !matches || (password !== undefined && !user.password_hash)) throw invalid();
  checkAccount(user);
  return { user, restricted: needsSetup(user), credential: password !== undefined ? 'password' : 'token' };
}

async function setInitialPassword(pool, auth, password) {
  if (!needsSetup(auth.user)) throw new AuthError(409, 'password_already_set', 'Initial password setup is already complete.');
  if (auth.user.password_hash && await bcrypt.compare(password, auth.user.password_hash)) {
    throw new AuthError(400, 'validation_error', 'Choose a different password from your temporary password.');
  }
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT ${columns} FROM app_user WHERE user_id = $1 FOR UPDATE`, [auth.user.user_id]);
    const current = result.rows[0];
    if (!current || current.session_version !== auth.version || !needsSetup(current)) throw unauthenticated();
    checkAccount(current);
    if (auth.credential === 'token' && (current.setup_token_hash !== auth.setupTokenHash || !(new Date(current.setup_token_expires_at).getTime() > Date.now()))) throw unauthenticated();
    // Transaction-local identity supports audit_user() without leaking actors across pooled requests.
    await client.query("SELECT set_config('app.username', $1, true)", [current.email]);
    const updated = await client.query(`UPDATE app_user SET password_hash = $1,
      must_change_password = FALSE, setup_token_hash = NULL, setup_token_expires_at = NULL,
      session_version = session_version + 1,
      stamp = 'PASSWORD SET ' || email || ' ' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS')
      WHERE user_id = $2 RETURNING ${columns}`, [hash, current.user_id]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { AuthError, authenticate, checkAccount, findUser, needsSetup, setInitialPassword, unauthenticated, verifyAuthSchema };
