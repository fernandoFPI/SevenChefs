const db = require('../config/db');
const { processAttendance, pairCheckPunches, fetchDayPunches, segmentCheckPunches } = require('../services/attendanceProcessor');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseTimeToMins(t) {
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function isValidTime(t) {
  if (!t) return true;
  return /^\d{2}:\d{2}$/.test(t) && parseTimeToMins(t) !== null;
}

function timeDiffHours(startStr, endStr) {
  const s = parseTimeToMins(startStr);
  let e   = parseTimeToMins(endStr);
  if (s === null || e === null) return 0;
  // Cross-midnight: checkout in early morning (00:00–07:59) and before start → add 24h
  if (e < s && e < 8 * 60) e += 24 * 60;
  return round2(Math.max(0, e - s) / 60);
}

// Returns false only when checkout is clearly same-day but before check-in.
// Checkouts before 08:00 are treated as next-day and always accepted.
function isValidCheckout(checkIn, checkOut) {
  if (!checkIn || !checkOut) return true;
  const outH = parseInt(checkOut.split(':')[0], 10);
  if (outH < 8) return true;
  return parseTimeToMins(checkOut) > parseTimeToMins(checkIn);
}

function punchToTime(punch) {
  if (!punch) return null;
  const d = new Date(punch.punch_time);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateToTime(d) {
  if (!d) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ── POST /api/attendance/corrections ─────────────────────────────────────────
async function saveCorrection(req, res) {
  try {
    const {
      attendance_daily_id,
      corrected_check_in,
      corrected_check_out,
      corrected_check_in_2,
      corrected_check_out_2,
      corrected_ot_in,
      corrected_ot_out,
      note,
    } = req.body;

    if (!attendance_daily_id)
      return res.status(400).json({ message: 'attendance_daily_id is required' });

    if (!corrected_check_in && !corrected_check_out && !corrected_check_in_2 && !corrected_check_out_2
        && !corrected_ot_in && !corrected_ot_out)
      return res.status(400).json({ message: 'At least one corrected time must be provided' });

    for (const [field, val] of [
      ['corrected_check_in',    corrected_check_in],
      ['corrected_check_out',   corrected_check_out],
      ['corrected_check_in_2',  corrected_check_in_2],
      ['corrected_check_out_2', corrected_check_out_2],
      ['corrected_ot_in',       corrected_ot_in],
      ['corrected_ot_out',      corrected_ot_out],
    ]) {
      if (val && !isValidTime(val))
        return res.status(400).json({ message: `Invalid time format for ${field} — use HH:MM` });
    }

    if (corrected_check_in && corrected_check_out && !isValidCheckout(corrected_check_in, corrected_check_out))
      return res.status(400).json({ message: 'Check-out must be after check-in' });
    if (corrected_check_in_2 && corrected_check_out_2 && !isValidCheckout(corrected_check_in_2, corrected_check_out_2))
      return res.status(400).json({ message: 'Shift 2 check-out must be after check-in' });
    if (corrected_ot_in && corrected_ot_out && !isValidCheckout(corrected_ot_in, corrected_ot_out))
      return res.status(400).json({ message: 'OT check-out must be after OT check-in' });

    // Load attendance_daily record
    const { rows: daily } = await db.query(
      `SELECT id, employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date
       FROM attendance_daily WHERE id = $1`,
      [attendance_daily_id]
    );
    if (!daily.length)
      return res.status(404).json({ message: 'Attendance record not found' });

    const { employee_id, date } = daily[0];

    // Load employee shift info (primary + secondary) and OT mode setting in parallel
    const [empResult, otModeResult] = await Promise.all([
      db.query(
        `SELECT e.secondary_shift_id, s.std_hours_per_day, s2.std_hours_per_day AS secondary_std_hours
         FROM employees e
         LEFT JOIN shifts s  ON s.id  = e.shift_id
         LEFT JOIN shifts s2 ON s2.id = e.secondary_shift_id
         WHERE e.id = $1`,
        [employee_id]
      ),
      db.query(`SELECT value FROM system_settings WHERE key = 'ot_calculation_mode'`),
    ]);
    const empRow         = empResult.rows[0] || {};
    const isTwoShift     = !!empRow.secondary_shift_id;
    const primaryHours   = parseFloat(empRow.std_hours_per_day)   || 8;
    const secondaryHours = parseFloat(empRow.secondary_std_hours) || 0;
    const stdHours       = primaryHours + (isTwoShift ? secondaryHours : 0);
    const otMode         = otModeResult.rows[0]?.value || 'OT_PUNCH';

    // Load this day's punches (cross-midnight aware, shared with attendanceProcessor.js)
    // and split them into per-shift segments: segment 1 is the day's first
    // Check-In through its Check-Out, segment 2 is the second shift's pair
    // (only meaningful for two-shift employees). A correction only ever
    // overrides one segment's IN and/or OUT; every other punch is untouched.
    const rawPunches = await fetchDayPunches(employee_id, date);
    const stdCheckPunches = rawPunches
      .filter(p => ['0', '1'].includes(String(p.punch_state)))
      .map(p => ({ time: new Date(p.punch_time), state: String(p.punch_state) }));
    const segments = segmentCheckPunches(stdCheckPunches);
    const seg1 = segments[0] || { in: null, out: null };
    const seg2 = segments[1] || { in: null, out: null };

    const otInPunch    = rawPunches.find(p => String(p.punch_state) === '4');
    const otOutPunches = rawPunches.filter(p => String(p.punch_state) === '5');
    const otOutPunch   = otOutPunches.length ? otOutPunches[otOutPunches.length - 1] : null;

    const original_check_in    = dateToTime(seg1.in);
    const original_check_out   = dateToTime(seg1.out);
    const original_check_in_2  = isTwoShift ? dateToTime(seg2.in)  : null;
    const original_check_out_2 = isTwoShift ? dateToTime(seg2.out) : null;
    const original_ot_in       = punchToTime(otInPunch);
    const original_ot_out      = punchToTime(otOutPunch);

    // Effective times: corrected if provided, else original
    const effCheckIn   = corrected_check_in  || original_check_in;
    const effCheckOut  = corrected_check_out || original_check_out;
    const effCheckIn2  = isTwoShift ? (corrected_check_in_2  || original_check_in_2)  : null;
    const effCheckOut2 = isTwoShift ? (corrected_check_out_2 || original_check_out_2) : null;
    const effOtIn      = corrected_ot_in  || original_ot_in;
    const effOtOut     = corrected_ot_out || original_ot_out;

    let hours_worked = 0;
    if (effCheckIn && effCheckOut) hours_worked += timeDiffHours(effCheckIn, effCheckOut);
    if (isTwoShift && effCheckIn2 && effCheckOut2) hours_worked += timeDiffHours(effCheckIn2, effCheckOut2);
    hours_worked = round2(hours_worked);

    let ot_hours, late_hours;
    if (otMode === 'CALCULATED') {
      ot_hours   = round2(Math.max(0, hours_worked - stdHours));
      late_hours = round2(Math.max(0, stdHours - hours_worked));
    } else {
      ot_hours   = (effOtIn && effOtOut) ? timeDiffHours(effOtIn, effOtOut) : 0;
      late_hours = round2(Math.max(0, stdHours - hours_worked));
    }

    // Determine missing_punch after correction (later checks take precedence,
    // same convention as before this segment support was added)
    let missing_punch = null;
    if (effCheckIn && !effCheckOut) missing_punch = 'OUT';
    if (!effCheckIn && effCheckOut) missing_punch = 'IN';
    if (isTwoShift) {
      if (effCheckIn2 && !effCheckOut2) missing_punch = 'OUT';
      if (!effCheckIn2 && effCheckOut2) missing_punch = 'IN';
    }
    if (effOtIn && !effOtOut) missing_punch = 'OT_OUT';
    if (!effOtIn && effOtOut) missing_punch = 'OT_IN';

    // Upsert correction record
    await db.query(
      `INSERT INTO punch_corrections
         (attendance_daily_id, employee_id, date,
          corrected_check_in, corrected_check_out, corrected_check_in_2, corrected_check_out_2,
          corrected_ot_in, corrected_ot_out,
          original_check_in, original_check_out, original_check_in_2, original_check_out_2,
          original_ot_in, original_ot_out,
          note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (attendance_daily_id) DO UPDATE SET
         corrected_check_in    = EXCLUDED.corrected_check_in,
         corrected_check_out   = EXCLUDED.corrected_check_out,
         corrected_check_in_2  = EXCLUDED.corrected_check_in_2,
         corrected_check_out_2 = EXCLUDED.corrected_check_out_2,
         corrected_ot_in       = EXCLUDED.corrected_ot_in,
         corrected_ot_out      = EXCLUDED.corrected_ot_out,
         original_check_in     = EXCLUDED.original_check_in,
         original_check_out    = EXCLUDED.original_check_out,
         original_check_in_2   = EXCLUDED.original_check_in_2,
         original_check_out_2  = EXCLUDED.original_check_out_2,
         original_ot_in        = EXCLUDED.original_ot_in,
         original_ot_out       = EXCLUDED.original_ot_out,
         note                  = EXCLUDED.note,
         created_by            = EXCLUDED.created_by,
         updated_at            = NOW()`,
      [
        attendance_daily_id, employee_id, date,
        corrected_check_in   || null, corrected_check_out   || null,
        corrected_check_in_2 || null, corrected_check_out_2 || null,
        corrected_ot_in      || null, corrected_ot_out      || null,
        original_check_in, original_check_out, original_check_in_2, original_check_out_2,
        original_ot_in, original_ot_out,
        note || null, req.user.userId,
      ]
    );

    // Update attendance_daily with recalculated values
    const { rows: updated } = await db.query(
      `UPDATE attendance_daily
       SET hours_worked         = $1,
           late_hours           = $2,
           ot_hours             = $3,
           missing_punch        = $4,
           has_punch_correction = true,
           is_manually_edited   = true,
           updated_at           = NOW()
       WHERE id = $5
       RETURNING *`,
      [hours_worked, late_hours, ot_hours, missing_punch, attendance_daily_id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('[corrections] saveCorrection:', err.message);
    res.status(500).json({ message: 'Failed to save correction' });
  }
}

// ── GET /api/attendance/day-punches ────────────────────────────────────────────
// Returns one attendance day's raw punches plus their per-shift segmentation,
// using the same cross-midnight bucketing as the processor and the correction
// save logic above, so the correction modal shows exactly the punches that
// actually count for this day instead of a naive calendar-date slice.
async function getDayPunches(req, res) {
  try {
    const { employee_id, date } = req.query;
    if (!employee_id || !date)
      return res.status(400).json({ message: 'employee_id and date are required' });

    const { rows: empRows } = await db.query(
      `SELECT secondary_shift_id FROM employees WHERE id = $1`,
      [employee_id]
    );
    if (!empRows.length)
      return res.status(404).json({ message: 'Employee not found' });
    const isTwoShift = !!empRows[0].secondary_shift_id;

    const punches = await fetchDayPunches(employee_id, date);
    const stdCheckPunches = punches
      .filter(p => ['0', '1'].includes(String(p.punch_state)))
      .map(p => ({ time: new Date(p.punch_time), state: String(p.punch_state) }));
    const segs = segmentCheckPunches(stdCheckPunches);

    const segments = [0, 1].map(i => ({
      checkIn:  dateToTime(segs[i] ? segs[i].in  : null),
      checkOut: dateToTime(segs[i] ? segs[i].out : null),
    }));

    res.json({
      punches: punches.map(p => ({ punch_time: p.punch_time, punch_state: p.punch_state })),
      isTwoShift,
      segments,
    });
  } catch (err) {
    console.error('[corrections] getDayPunches:', err.message);
    res.status(500).json({ message: 'Failed to fetch day punches' });
  }
}

// ── GET /api/attendance/corrections/:attendance_daily_id ──────────────────────
async function getCorrection(req, res) {
  try {
    const { attendance_daily_id } = req.params;
    const { rows } = await db.query(
      `SELECT
         pc.id, pc.attendance_daily_id, pc.employee_id,
         TO_CHAR(pc.corrected_check_in,    'HH24:MI') AS corrected_check_in,
         TO_CHAR(pc.corrected_check_out,   'HH24:MI') AS corrected_check_out,
         TO_CHAR(pc.corrected_check_in_2,  'HH24:MI') AS corrected_check_in_2,
         TO_CHAR(pc.corrected_check_out_2, 'HH24:MI') AS corrected_check_out_2,
         TO_CHAR(pc.corrected_ot_in,       'HH24:MI') AS corrected_ot_in,
         TO_CHAR(pc.corrected_ot_out,      'HH24:MI') AS corrected_ot_out,
         TO_CHAR(pc.original_check_in,     'HH24:MI') AS original_check_in,
         TO_CHAR(pc.original_check_out,    'HH24:MI') AS original_check_out,
         TO_CHAR(pc.original_check_in_2,   'HH24:MI') AS original_check_in_2,
         TO_CHAR(pc.original_check_out_2,  'HH24:MI') AS original_check_out_2,
         TO_CHAR(pc.original_ot_in,        'HH24:MI') AS original_ot_in,
         TO_CHAR(pc.original_ot_out,       'HH24:MI') AS original_ot_out,
         pc.note, pc.created_at,
         u.username AS created_by_name
       FROM punch_corrections pc
       LEFT JOIN users u ON u.id = pc.created_by
       WHERE pc.attendance_daily_id = $1`,
      [attendance_daily_id]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('[corrections] getCorrection:', err.message);
    res.status(500).json({ message: 'Failed to fetch correction' });
  }
}

// ── DELETE /api/attendance/corrections/:attendance_daily_id ───────────────────
async function removeCorrection(req, res) {
  try {
    const { attendance_daily_id } = req.params;

    const { rows: daily } = await db.query(
      `SELECT employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date
       FROM attendance_daily WHERE id = $1`,
      [attendance_daily_id]
    );
    if (!daily.length)
      return res.status(404).json({ message: 'Attendance record not found' });

    const { employee_id, date } = daily[0];

    await db.query(
      'DELETE FROM punch_corrections WHERE attendance_daily_id = $1',
      [attendance_daily_id]
    );

    await db.query(
      `UPDATE attendance_daily
       SET has_punch_correction = false,
           is_manually_edited   = false,
           updated_at           = NOW()
       WHERE id = $1`,
      [attendance_daily_id]
    );

    // Re-run processAttendance so raw punches are used again
    await processAttendance({ employeeIds: [employee_id], dateFrom: date, dateTo: date });

    res.json({ message: 'Correction removed' });
  } catch (err) {
    console.error('[corrections] removeCorrection:', err.message);
    res.status(500).json({ message: 'Failed to remove correction' });
  }
}

module.exports = { saveCorrection, getCorrection, removeCorrection, getDayPunches };
