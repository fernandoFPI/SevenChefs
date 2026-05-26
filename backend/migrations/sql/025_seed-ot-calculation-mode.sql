INSERT INTO system_settings (key, value)
VALUES ('ot_calculation_mode', 'OT_PUNCH')
ON CONFLICT (key) DO NOTHING;
