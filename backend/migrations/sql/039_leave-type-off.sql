-- Allow 'OFF' leave type: an approved day-off request marks the day as a true
-- unpaid non-working day (attendance status 'OFF'), not paid leave.
ALTER TABLE leave_records
  DROP CONSTRAINT IF EXISTS leave_records_leave_type_check;

ALTER TABLE leave_records
  ADD CONSTRAINT leave_records_leave_type_check
  CHECK (leave_type IN ('PAID', 'UNPAID', 'OFF'));
