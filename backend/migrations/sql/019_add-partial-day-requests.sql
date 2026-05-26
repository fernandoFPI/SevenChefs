ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS request_subtype VARCHAR(20) DEFAULT 'FULL_DAY'
    CHECK (request_subtype IN ('FULL_DAY','PARTIAL_DAY')),
  ADD COLUMN IF NOT EXISTS time_from      TIME,
  ADD COLUMN IF NOT EXISTS time_to        TIME,
  ADD COLUMN IF NOT EXISTS partial_hours  NUMERIC(5,2);

ALTER TABLE attendance_daily
  ADD COLUMN IF NOT EXISTS partial_leave_hours NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partial_leave_type  VARCHAR(20);
