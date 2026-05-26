CREATE TABLE IF NOT EXISTS employees (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code  VARCHAR(50) UNIQUE NOT NULL,
  name           VARCHAR(150) NOT NULL,
  monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  shift_id       UUID REFERENCES shifts(id),
  schedule_id    UUID REFERENCES schedules(id),
  zk_employee_id VARCHAR(100),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
