CREATE TABLE IF NOT EXISTS requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type              VARCHAR(20) NOT NULL CHECK (type IN ('OT_REQUEST', 'OFF_REQUEST')),
  attendance_date   DATE NOT NULL,
  hours_requested   NUMERIC(5,2),
  reason            TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'PENDING_MANAGER'
                    CHECK (status IN ('PENDING_MANAGER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED', 'AUTO_REJECTED')),
  manager_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  manager_action    VARCHAR(10) CHECK (manager_action IN ('FORWARD', 'REJECT')),
  manager_note      TEXT,
  manager_acted_at  TIMESTAMPTZ,
  admin_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_action      VARCHAR(10) CHECK (admin_action IN ('APPROVE', 'REJECT')),
  admin_note        TEXT,
  admin_acted_at    TIMESTAMPTZ,
  auto_reject_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_employee_id ON requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_auto_reject_at ON requests(auto_reject_at) WHERE status IN ('PENDING_MANAGER', 'PENDING_ADMIN');
