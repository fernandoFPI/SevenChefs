CREATE TABLE IF NOT EXISTS attendance_daily (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        UUID        NOT NULL REFERENCES employees(id),
  date               DATE        NOT NULL,
  hours_worked       NUMERIC(5,2) NOT NULL DEFAULT 0,
  status             VARCHAR(20) NOT NULL DEFAULT 'ABSENT'
                     CHECK (status IN ('PRESENT','ABSENT','LEAVE_PAID','LEAVE_UNPAID','OFF')),
  late_hours         NUMERIC(5,2) NOT NULL DEFAULT 0,
  ot_hours           NUMERIC(5,2) NOT NULL DEFAULT 0,
  ot_approved        BOOLEAN     NOT NULL DEFAULT false,
  late_approved      BOOLEAN     NOT NULL DEFAULT false,
  is_manually_edited BOOLEAN     NOT NULL DEFAULT false,
  note               TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_employee ON attendance_daily (employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_daily_date     ON attendance_daily (date);
CREATE INDEX IF NOT EXISTS idx_attendance_daily_status   ON attendance_daily (status);
