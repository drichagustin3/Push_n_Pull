BEGIN;

-- Remove existing test fixtures for clean, idempotent execution
DELETE FROM users 
WHERE email IN (
  'superadmin@hope-erp.com',
  'admin@hope-erp.com',
  'admin2@hope-erp.com',
  'staff@hope-erp.com',
  'pending@hope-erp.com',
  'blocked@hope-erp.com',
  'deleted@hope-erp.com'
);

-- Insert standard test personas covering all role states and status variations
INSERT INTO users (
  userId,
  firstName,
  lastName,
  email,
  passwordHash,
  role,
  isBlocked,
  status,
  stamp,
  createdAt,
  updatedAt
) VALUES
  (
    'USR-001',
    'Ashley',
    'Superadmin',
    'superadmin@hope-erp.com',
    '$2b$10$PlaceholderHashForHopeSuper2026xxxxxxxxxxxxxxxxxxxxxx',
    'Superadmin',
    FALSE,
    'Active',
    'CREATED system 2026-10-01 9:00 AM',
    NOW(),
    NOW()
  ),
  (
    'USR-002',
    'Aldrich',
    'Admin',
    'admin@hope-erp.com',
    '$2b$10$PlaceholderHashForHopeAdmin2026xxxxxxxxxxxxxxxxxxxxxx',
    'Admin',
    FALSE,
    'Active',
    'CREATED system 2026-10-01 9:00 AM',
    NOW(),
    NOW()
  ),
  (
    'USR-003',
    'Peer',
    'AdminTwo',
    'admin2@hope-erp.com',
    '$2b$10$PlaceholderHashForHopeAdmin22026xxxxxxxxxxxxxxxxxxxxx',
    'Admin',
    FALSE,
    'Active',
    'CREATED system 2026-10-02 10:00 AM',
    NOW(),
    NOW()
  ),
  (
    'USR-004',
    'Active',
    'Staff',
    'staff@hope-erp.com',
    '$2b$10$PlaceholderHashForHopeStaff2026xxxxxxxxxxxxxxxxxxxxxx',
    'User',
    FALSE,
    'Active',
    'CREATED system 2026-10-03 11:00 AM',
    NOW(),
    NOW()
  ),
  (
    'USR-005',
    'Pending',
    'Applicant',
    'pending@hope-erp.com',
    '$2b$10$PlaceholderHashForHopePending2026xxxxxxxxxxxxxxxxxxxx',
    'User',
    FALSE,
    'Pending',
    'CREATED system 2026-10-15 1:00 PM',
    NOW(),
    NOW()
  ),
  (
    'USR-006',
    'Blocked',
    'Staff',
    'blocked@hope-erp.com',
    '$2b$10$PlaceholderHashForHopeBlocked2026xxxxxxxxxxxxxxxxxxxx',
    'User',
    TRUE,
    'Blocked',
    'EDITED admin@hope-erp.com 2026-10-16 2:30 PM',
    NOW(),
    NOW()
  ),
  (
    'USR-007',
    'Archived',
    'FormerStaff',
    'deleted@hope-erp.com',
    '$2b$10$PlaceholderHashForHopeDeleted2026xxxxxxxxxxxxxxxxxxxx',
    'User',
    FALSE,
    'Inactive',
    'DELETED admin@hope-erp.com 2026-10-17 4:00 PM',
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '1 day'
  );

COMMIT;