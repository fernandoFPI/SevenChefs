CREATE TABLE IF NOT EXISTS backups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename    VARCHAR(255) NOT NULL,
  file_path   TEXT NOT NULL,
  file_size   BIGINT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  notes       TEXT
);

INSERT INTO system_settings (key, value)
VALUES ('backup_directory', './backups')
ON CONFLICT (key) DO NOTHING;
