-- Migration 037: Punch override columns on attendance_raw
-- Allows admins to ignore specific punches or change their state.
-- The attendance processor respects these overrides.

ALTER TABLE attendance_raw
  ADD COLUMN IF NOT EXISTS is_ignored       BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overridden_state VARCHAR(10)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS override_reason  TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overridden_by    UUID         REFERENCES users(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overridden_at    TIMESTAMPTZ  DEFAULT NULL;
