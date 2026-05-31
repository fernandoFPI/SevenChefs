INSERT INTO system_settings (key, value)
VALUES ('auto_reject_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
