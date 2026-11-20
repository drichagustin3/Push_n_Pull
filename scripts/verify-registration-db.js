
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { createPool } = require('../src/db/pool');
const { registerUser } = require('../src/registration/service');

async function main() {
  if (process.env.PGDATABASE !== 'hopedb_auth_test') {
    throw new Error('Safety check failed: only hopedb_auth_test is allowed.');
  }

  const pool = createPool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: false,
  });

  const email = `registration-check-${Date.now()}@example.test`;
  const password = 'TestRegistration123!';
  let inserted = false;

  try {
    await registerUser(pool, {
      firstName: 'Registration',
      lastName: 'Verification',
      email,
      password,
    });

    inserted = true;

    const result = await pool.query(
      `SELECT role, status, blocked, password_hash
       FROM app_user
       WHERE email = $1 AND is_deleted = FALSE`,
      [email]
    );

    assert.equal(result.rowCount, 1);

    const user = result.rows[0];

    assert.equal(user.role, 'user');
    assert.equal(user.status, 'pending');
    assert.equal(user.blocked, false);
    assert.equal(await bcrypt.compare(password, user.password_hash), true);
    assert.equal(bcrypt.getRounds(user.password_hash), 12);
    assert.notEqual(user.password_hash, password);

    console.log('PASS: PostgreSQL stored the registered user.');
    console.log('PASS: Default role is user.');
    console.log('PASS: Account status is pending.');
    console.log('PASS: Account is not blocked.');
    console.log('PASS: Password is stored as a bcrypt hash.');
    console.log('PASS: Bcrypt cost factor is 12.');
  
  } finally {
    if (inserted) {
      await pool.query(
        "UPDATE app_user SET is_deleted = TRUE, status = 'inactive' WHERE email = $1 AND is_deleted = FALSE",
        [email]
      );
      console.log('Temporary test account cleaned up.');
    }

    await pool.end();
  }
}


main().catch((error) => {
  console.error('Registration database verification failed:', error.message);
  process.exitCode = 1;
});