-- Add is_shift_cover to attendance_daily
ALTER TABLE attendance_daily
ADD COLUMN IF NOT EXISTS is_shift_cover BOOLEAN NOT NULL DEFAULT false;

-- Add SWAP_DAY_OFF to attendance_daily status constraint
ALTER TABLE attendance_daily DROP CONSTRAINT IF EXISTS attendance_daily_status_check;
ALTER TABLE attendance_daily ADD CONSTRAINT attendance_daily_status_check
CHECK (status IN (
  'PRESENT',
  'ABSENT',
  'LEAVE_PAID',
  'LEAVE_UNPAID',
  'OFF',
  'SWAP_DAY_OFF'
));

-- Add missing_punch OT values to constraint
ALTER TABLE attendance_daily DROP CONSTRAINT IF EXISTS attendance_daily_missing_punch_check;
ALTER TABLE attendance_daily ADD CONSTRAINT attendance_daily_missing_punch_check
CHECK (missing_punch IN ('IN', 'OUT', 'OT_IN', 'OT_OUT') OR missing_punch IS NULL);

-- Add TIME_OFF_REQUEST to requests type constraint
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;
ALTER TABLE requests ADD CONSTRAINT requests_type_check
CHECK (type IN ('OT_REQUEST', 'OFF_REQUEST', 'TIME_OFF_REQUEST'));

-- Ensure auto_reject_at exists on requests
ALTER TABLE requests
ADD COLUMN IF NOT EXISTS auto_reject_at TIMESTAMPTZ;

-- Add secondary_shift_id to employees if missing
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS secondary_shift_id UUID REFERENCES shifts(id);

-- Add shift_type to shifts if missing
ALTER TABLE shifts
ADD COLUMN IF NOT EXISTS shift_type VARCHAR(20) NOT NULL DEFAULT 'FIXED'
CHECK (shift_type IN ('FIXED', 'DURATION'));

-- Seed missing system_settings keys
INSERT INTO system_settings (key, value) VALUES
  ('ot_calculation_mode', 'OT_PUNCH'),
  ('grace_period_enabled', 'true'),
  ('grace_period_minutes', '10'),
  ('auto_reject_enabled', 'true'),
  ('time_off_allowance_days', '15'),
  ('company_logo', ''),
  ('backup_directory', './backups')
ON CONFLICT (key) DO NOTHING;
