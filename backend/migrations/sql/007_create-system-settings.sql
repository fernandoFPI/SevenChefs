-- ── system_settings ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO system_settings (key, value) VALUES
  ('zk_host',               ''),
  ('zk_port',               ''),
  ('zk_username',           ''),
  ('zk_password',           ''),
  ('sync_interval_minutes', '30'),
  ('sync_lookback_days',    '3')
ON CONFLICT (key) DO NOTHING;

-- ── attendance_raw ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_raw (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  zk_transaction_id INTEGER     UNIQUE NOT NULL,
  zk_emp_code       VARCHAR(100) NOT NULL,
  employee_id       UUID        REFERENCES employees(id) ON DELETE SET NULL,
  punch_time        TIMESTAMPTZ NOT NULL,
  punch_state       VARCHAR(10),
  verify_type       INTEGER,
  terminal_sn       VARCHAR(100),
  terminal_alias    VARCHAR(100),
  upload_time       TIMESTAMPTZ,
  is_off_day_punch  BOOLEAN     NOT NULL DEFAULT FALSE,
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attendance_raw_zk_emp_code_idx ON attendance_raw (zk_emp_code);
CREATE INDEX IF NOT EXISTS attendance_raw_punch_time_idx  ON attendance_raw (punch_time);
CREATE INDEX IF NOT EXISTS attendance_raw_employee_id_idx ON attendance_raw (employee_id);

-- ── sync_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  status           VARCHAR(20) NOT NULL,
  trigger          VARCHAR(20) NOT NULL,
  records_fetched  INTEGER     NOT NULL DEFAULT 0,
  records_inserted INTEGER     NOT NULL DEFAULT 0,
  records_skipped  INTEGER     NOT NULL DEFAULT 0,
  error_message    TEXT,
  sync_from        TIMESTAMPTZ,
  sync_to          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sync_logs_started_at_idx ON sync_logs (started_at DESC);
CREATE INDEX IF NOT EXISTS sync_logs_status_idx     ON sync_logs (status);
