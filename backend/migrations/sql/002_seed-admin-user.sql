INSERT INTO users (username, password_hash, role, password_changed)
VALUES (
  'admin',
  '$2b$12$aDF2cYEw3pH1zvXem6J3VejimQZ3S9fpMKPtJ8xbk6fVj6TItanq.',
  'ADMIN',
  false
)
ON CONFLICT (username) DO NOTHING;
