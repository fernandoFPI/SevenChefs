INSERT INTO system_settings (key, value) VALUES
  ('grace_period_enabled', 'true'),
  ('grace_period_minutes', '10')
ON CONFLICT (key) DO NOTHING;
