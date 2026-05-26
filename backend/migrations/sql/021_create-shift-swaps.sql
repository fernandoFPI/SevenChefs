CREATE TABLE IF NOT EXISTS shift_swaps (
  id                   SERIAL PRIMARY KEY,
  type                 VARCHAR(10) NOT NULL CHECK (type IN ('COVER','SWAP')),
  status               VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','CANCELLED')),
  covering_employee_id UUID NOT NULL REFERENCES employees(id),
  cover_date           DATE NOT NULL,
  covered_employee_id  UUID REFERENCES employees(id),
  covered_date         DATE,
  swap_return_date     DATE,
  note                 TEXT,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMP NOT NULL DEFAULT NOW()
);
