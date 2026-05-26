INSERT INTO system_settings (key, value)
VALUES ('company_logo', '')
ON CONFLICT (key) DO NOTHING;
