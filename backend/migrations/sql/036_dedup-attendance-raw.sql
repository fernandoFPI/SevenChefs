-- Remove near-duplicate punches (within 30 seconds, same employee, same punch state).
-- Keeps the earliest punch (lowest id), deletes later near-duplicates.
-- Runs before re-processing so attendance_daily is recalculated from clean data.
DELETE FROM attendance_raw a
WHERE EXISTS (
  SELECT 1 FROM attendance_raw b
  WHERE b.employee_id = a.employee_id
    AND b.punch_state  = a.punch_state
    AND b.id           < a.id
    AND ABS(EXTRACT(EPOCH FROM (a.punch_time - b.punch_time))) <= 30
);
