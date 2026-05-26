-- Drop old tables if they exist from a previous schema run, so we recreate correctly.
DROP TABLE IF EXISTS attendance_raw CASCADE;
DROP TABLE IF EXISTS sync_logs CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

-- ── system_settings ──────────────────────────────────────────────────────────
CREATE TABLE system_settings (
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
CREATE TABLE attendance_raw (
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

CREATE INDEX ON attendance_raw (zk_emp_code);
CREATE INDEX ON attendance_raw (punch_time);
CREATE INDEX ON attendance_raw (employee_id);

-- ── sync_logs ────────────────────────────────────────────────────────────────
CREATE TABLE sync_logs (
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

CREATE INDEX ON sync_logs (started_at DESC);
CREATE INDEX ON sync_logs (status);
