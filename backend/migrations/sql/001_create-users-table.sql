CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username         VARCHAR(100) NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  role             VARCHAR(20) NOT NULL,
  employee_id      UUID,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE'));
