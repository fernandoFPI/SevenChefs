-- Migration 038: Second Check-In/Check-Out segment on punch_corrections
-- Two-shift employees have a shift-1 and a shift-2 punch pair per day.
-- The original columns only modeled one pair; these add room for the second
-- shift so a missing mid-day punch can be corrected without conflating it
-- with the other shift's times.

ALTER TABLE punch_corrections
  ADD COLUMN IF NOT EXISTS corrected_check_in_2  TIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS corrected_check_out_2 TIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_check_in_2   TIME DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_check_out_2  TIME DEFAULT NULL;
