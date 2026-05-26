INSERT INTO system_settings (key, value) VALUES
  ('company_name',            '')
ON CONFLICT (key) DO NOTHING;
