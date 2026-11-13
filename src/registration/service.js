const bcrypt = require('bcrypt');

async function registerUser(pool, { firstName, lastName, email, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  // One atomic insert; the unique email constraint resolves concurrent requests.
  // session_user identifies the actual DB actor for this anonymous registration.
  await pool.query(`
    INSERT INTO app_user
      (first_name, last_name, email, password_hash, role, blocked, status, stamp)
    VALUES ($1, $2, $3, $4, 'user', FALSE, 'pending',
      'CREATED ' || session_user || ' ' ||
      to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD HH24:MI:SS'))
  `, [firstName, lastName, email, passwordHash]);
}

module.exports = { registerUser };
