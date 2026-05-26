INSERT INTO system_settings (key, value) VALUES
  ('std_days_per_month',      '30'),
  ('ot_multiplier',           '2.0'),
  ('late_penalty_unapproved', '1.5'),
  ('late_penalty_approved',   '1.0')
ON CONFLICT (key) DO NOTHING;
