-- CASE 1: Duration-based shifts (no fixed start/end time, only std hours)
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS shift_type VARCHAR(10) NOT NULL DEFAULT 'FIXED'
    CONSTRAINT shifts_shift_type_check CHECK (shift_type IN ('FIXED', 'DURATION'));

-- CASE 2: Double-shift employees (primary + secondary shift)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS secondary_shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;
