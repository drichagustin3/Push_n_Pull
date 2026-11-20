
# Authentication and Password Reset Test Results

## 1. Test Overview

| Item | Details |
|---|---|
| Project | HOPE, Inc. ERP |
| Test Area | Registration, Authentication, and Password Reset |
| Test Environment | Local development environment |
| Database | PostgreSQL 18 |
| Test Framework | Node.js Test Runner |
| Test Date | November 20, 2026 |

## 2. Overall Test Summary

| Test Group | Passed | Failed |
|---|---:|---:|
| Unit Tests | 42 | 0 |
| Authentication PostgreSQL Integration | 1 | 0 |
| Password Reset PostgreSQL Integration | 11 | 0 |
| **Total** | **54** | **0** |

**Overall Result: PASS**

All 54 executed tests passed with no failures.


## 3. Registration Test Results

| Test ID | Test Scenario | Expected Result | Status |
|---|---|---|---|
| TC-REG-01 | Register with valid user information | Registration succeeds and the database assigns the default User role | PASS* |
| TC-REG-02 | Register using an existing email | System rejects the duplicate email with HTTP 409 Conflict | PASS* |
| TC-REG-03 | Submit malformed email or short password | System rejects invalid input with a descriptive error | PASS* |
| TC-REG-04 | Verify password storage | Password is stored as a salted bcrypt hash, not plaintext | PASS* |

*These cases passed in the registration unit-test suite. Database-level verification should be recorded separately if required by the acceptance criteria.

**Additional PostgreSQL verification:** The registration service was executed against the dedicated `hopedb_auth_test` database. The inserted account was verified to have the default `user` role, `pending` status, `blocked = false`, and a salted bcrypt password hash using cost factor 12. All checks passed. The temporary account was successfully cleaned up using soft deletion.

## 4. Authentication Test Results

| Test ID | Test Scenario | Expected Result | Status |
|---|---|---|---|
| TC-AUTH-01 | Log in using valid credentials | Authentication succeeds and a session cookie is created | PASS |
| TC-AUTH-02 | Log in using an incorrect password | Login is rejected without revealing whether the account exists | PASS |
| TC-AUTH-03 | Attempt login using a blocked account | Login is rejected and a blocked-account message is displayed | PASS |
| TC-AUTH-04 | Log out and access a protected endpoint | Session is destroyed and the protected endpoint returns HTTP 401 | PASS |

**Integration Evidence:** The PostgreSQL authentication integration test passed, verifying session persistence, revocation, and concurrent one-time setup.

## 5. Password Reset Test Results

| Test ID | Test Scenario | Expected Result | Status |
|---|---|---|---|
| TC-RST-01 | Request a password reset | A reset token is generated and stored in the password_reset_token table | PASS |
| TC-RST-02 | Complete password reset using a valid token | Password is updated and the old password is no longer accepted | PASS |
| TC-RST-03 | Submit an expired reset token | System rejects the expired token | PASS |
| TC-RST-04 | Reuse an already consumed reset token | System rejects the previously used token | PASS |

**Integration Evidence:** The password-reset PostgreSQL integration suite completed successfully with 11 passing tests and zero failures. The test used a local SMTP server to verify email-related behavior without sending real emails.

## 6. Test Execution Evidence

The following commands were executed during testing.

### 6.1 Unit Tests

Command:

```powershell
node --test test/registration.test.js test/auth.test.js test/password-reset.test.js
```

Result:
- Tests: 42
- Passed: 42
- Failed: 0
- Skipped: 0

### 6.2 Authentication PostgreSQL Integration Test

Command:

```powershell
$env:PGDATABASE = 'hopedb_auth_test'
$env:AUTH_INTEGRATION = '1'
$env:AUTH_VERIFY_DBA04 = '1'
node --env-file=.env --test test/auth-postgres.test.js
```

Result:
- Tests: 1
- Passed: 1
- Failed: 0
- Skipped: 0

### 6.3 Password Reset PostgreSQL Integration Test

Command:

```powershell
$env:RESET_INTEGRATION = '1'
node --env-file=.env --test test/password-reset-postgres.test.js
```

Result:
- Tests: 11
- Passed: 11
- Failed: 0
- Skipped: 0

## 7. Test Environment and Database

| Component | Configuration |
|---|---|
| Runtime | Node.js |
| Database | PostgreSQL 18 |
| Database Driver | node-postgres (pg) |
| Test Framework | Node.js built-in test runner |
| Authentication Sessions | express-session and connect-pg-simple |
| Password Hashing | bcrypt |
| Email Testing | Local SMTP test server |
| Test Database | hopedb_auth_test |

A separate local test database named `hopedb_auth_test` was used for PostgreSQL integration testing to avoid modifying the main development database.

The required database migrations were applied to the test database before integration tests were executed.

**## 8. Test Limitations and Notes**

1. Unit tests use mocked dependencies where applicable. They verify application behavior but do not independently prove every database operation.
2. PostgreSQL integration tests provide additional evidence for database-backed authentication and password-reset behavior.
3. The password-reset integration test uses a local SMTP server. No actual email was sent to an external recipient.
4. The test results apply to the local development environment and do not represent a production deployment test.
5. Registration-specific database requirements were verified successfully against the dedicated local PostgreSQL test database. The default role, pending status, unblocked account state, and bcrypt hash persistence were confirmed. The temporary test account was cleaned up using soft deletion.

## 9. Overall Test Conclusion

The authentication and password-reset test execution completed successfully.

A total of 54 tests were executed across the unit and PostgreSQL integration test suites.

| Result | Count |
|---|---:|
| Total Tests | 54 |
| Passed | 54 |
| Failed | 0 |
| Skipped | 0 |

**Final Status: PASS**

The executed tests provide evidence that the registration, authentication, session-management, and password-reset functionality behaves as expected under the tested scenarios.

Further database-level verification of registration-specific acceptance criteria and production-environment testing may be performed as additional validation.

---

**Prepared for:** HOPE, Inc. ERP Project  
**Test Date:** November 20, 2026