-- Fix punch_time records stored as UTC that are actually UTC+3 (3 hours wrong).
-- Safe to run multiple times: the WHERE clause only matches times that appear
-- to be in the future (> 1 hour from now), which is only possible when stored
-- wrong. After the first run, corrected times are in the past and won't match.

UPDATE attendance_raw
SET punch_time = punch_time - INTERVAL '3 hours'
WHERE punch_time > NOW() + INTERVAL '1 hour';

UPDATE attendance_raw
SET upload_time = upload_time - INTERVAL '3 hours'
WHERE upload_time IS NOT NULL
  AND upload_time > NOW() + INTERVAL '1 hour';
