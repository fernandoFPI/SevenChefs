ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'IQD'
  CHECK (currency IN ('IQD', 'USD'));

ALTER TABLE salary_records
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'IQD'
  CHECK (currency IN ('IQD', 'USD'));

UPDATE salary_records sr
SET currency = e.currency
FROM employees e
WHERE sr.employee_id = e.id;
