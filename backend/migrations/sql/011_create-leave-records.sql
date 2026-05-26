CREATE TABLE IF NOT EXISTS leave_records (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID        NOT NULL REFERENCES employees(id),
  date        DATE        NOT NULL,
  leave_type  VARCHAR(20) NOT NULL CHECK (leave_type IN ('PAID','UNPAID')),
  created_by  UUID        REFERENCES users(id),
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, date)
);
