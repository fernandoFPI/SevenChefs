-- Add TIME_OFF_REQUEST to requests type constraint
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;
ALTER TABLE requests ADD CONSTRAINT requests_type_check
  CHECK (type IN ('OT_REQUEST', 'OFF_REQUEST', 'TIME_OFF_REQUEST'));

-- Add date-range and working-days fields for TIME_OFF_REQUEST
ALTER TABLE requests ADD COLUMN IF NOT EXISTS date_from  DATE;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS date_to    DATE;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS total_days INTEGER;

-- Seed default annual time-off allowance
INSERT INTO system_settings (key, value)
VALUES ('time_off_allowance_days', '15')
ON CONFLICT (key) DO NOTHING;

-- Per-employee, per-year time-off balance
CREATE TABLE IF NOT EXISTS time_off_balances (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID    NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  allowance   INTEGER NOT NULL,
  used_days   INTEGER NOT NULL DEFAULT 0,
  remaining   INTEGER GENERATED ALWAYS AS (allowance - used_days) STORED,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, year)
);

CREATE INDEX IF NOT EXISTS idx_time_off_balances_employee_year
  ON time_off_balances (employee_id, year);
