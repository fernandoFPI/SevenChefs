ALTER TABLE attendance_daily
  ADD COLUMN IF NOT EXISTS missing_punch VARCHAR(10)
  CHECK (missing_punch IN ('IN', 'OUT', 'OT_IN', 'OT_OUT'));
