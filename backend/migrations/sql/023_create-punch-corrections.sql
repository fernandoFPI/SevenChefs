CREATE TABLE IF NOT EXISTS punch_corrections (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_daily_id   UUID NOT NULL REFERENCES attendance_daily(id),
  employee_id           UUID NOT NULL REFERENCES employees(id),
  date                  DATE NOT NULL,
  corrected_check_in    TIME,
  corrected_check_out   TIME,
  corrected_ot_in       TIME,
  corrected_ot_out      TIME,
  original_check_in     TIME,
  original_check_out    TIME,
  original_ot_in        TIME,
  original_ot_out       TIME,
  note                  TEXT,
  created_by            UUID REFERENCES users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (attendance_daily_id)
);
