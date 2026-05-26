UPDATE shifts
SET shift_start = '08:00:00',
    shift_end = MAKE_TIME(
      FLOOR(std_hours_per_day)::int,
      ROUND((std_hours_per_day - FLOOR(std_hours_per_day)) * 60)::int,
      0
    )
WHERE shift_start IS NULL
  AND std_hours_per_day IS NOT NULL;
