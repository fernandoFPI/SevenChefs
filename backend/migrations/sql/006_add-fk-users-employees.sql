DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_users_employee'
      AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_employee
      FOREIGN KEY (employee_id) REFERENCES employees(id);
  END IF;
END $$;
