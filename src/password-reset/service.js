const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcrypt');

class InvalidResetToken extends Error {}
const digestToken = (token) => createHash('sha256').update(token).digest('hex');
const eligible = (user) => user && user.status === 'active' && !user.blocked && !user.is_deleted;

async function issueReset(pool, email) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('SELECT user_id,email,status,blocked,is_deleted FROM app_user WHERE email=$1 FOR UPDATE', [email])).rows[0];
    if (!eligible(user)) { await client.query('COMMIT'); return null; }
    const token = randomBytes(32).toString('hex');
    await client.query('UPDATE password_reset_token SET is_used=TRUE,used_at=clock_timestamp() WHERE user_id=$1 AND NOT is_used', [user.user_id]);
    const row = (await client.query("INSERT INTO password_reset_token(user_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour') RETURNING id", [user.user_id, digestToken(token)])).rows[0];
    await client.query('COMMIT');
    return { id: row.id, email: user.email, token };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function deliverReset(pool, email, mailer, logger) {
  const reset = await issueReset(pool, email);
  if (!reset) return;
  try { await mailer.send(reset.email, reset.token); }
  catch {
    logger.error('Password reset delivery failed.');
    // A delivery failure never leaves the newly issued credential usable.
    await pool.query('UPDATE password_reset_token SET is_used=TRUE,used_at=clock_timestamp() WHERE id=$1 AND NOT is_used', [reset.id]);
  }
}

async function completeReset(pool, token, password) {
  const digest = digestToken(token);
  const candidate = (await pool.query('SELECT id,user_id FROM password_reset_token WHERE token_hash=$1 AND NOT is_used AND expires_at>clock_timestamp()', [digest])).rows[0];
  if (!candidate) throw new InvalidResetToken();
  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Match request issuance's user -> token lock order to avoid deadlocks.
    const user = (await client.query('SELECT user_id,email,status,blocked,is_deleted FROM app_user WHERE user_id=$1 FOR UPDATE', [candidate.user_id])).rows[0];
    if (!eligible(user)) throw new InvalidResetToken();
    const current = (await client.query('SELECT id FROM password_reset_token WHERE id=$1 AND token_hash=$2 AND NOT is_used AND expires_at>clock_timestamp() FOR UPDATE', [candidate.id, digest])).rows[0];
    if (!current) throw new InvalidResetToken();
    await client.query("SELECT set_config('app.username',$1,true)", [user.email]);
    await client.query('UPDATE app_user SET password_hash=$1,must_change_password=FALSE,setup_token_hash=NULL,setup_token_expires_at=NULL,session_version=session_version+1 WHERE user_id=$2', [hash, user.user_id]);
    await client.query('UPDATE password_reset_token SET is_used=TRUE,used_at=clock_timestamp() WHERE user_id=$1 AND NOT is_used', [user.user_id]);
    await client.query("DELETE FROM auth_session WHERE sess->'user'->>'user_id'=$1", [String(user.user_id)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { InvalidResetToken, digestToken, deliverReset, completeReset };
