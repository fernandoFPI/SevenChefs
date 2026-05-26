ALTER TABLE attendance_daily
  ADD COLUMN IF NOT EXISTS has_punch_correction BOOLEAN DEFAULT false;
