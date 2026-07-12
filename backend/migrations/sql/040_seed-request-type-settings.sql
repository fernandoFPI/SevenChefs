-- Per-type enable/disable switches for employee request submission.
INSERT INTO system_settings (key, value)
VALUES
  ('request_full_day_enabled',    'true'),
  ('request_partial_day_enabled', 'true'),
  ('request_time_off_enabled',    'true')
ON CONFLICT (key) DO NOTHING;
