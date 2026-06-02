const db = require('../config/db');
const { processAttendance } = require('../services/attendanceProcessor');

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

// ── POST /api/attendance/corrections ─────────────────────────────────────────
async function saveCorrection(req, res) {
  try {
    const {
      attendance_daily_id,
      corrected_check_in,
      corrected_check_out,
      corrected_ot_in,
      corrected_ot_out,
      note,
    } = req.body;

    if (!attendance_daily_id)
      return res.status(400).json({ message: 'attendance_daily_id is required' });

    if (!corrected_check_in && !corrected_check_out && !corrected_ot_in && !corrected_ot_out)
      return res.status(400).json({ message: 'At least one corrected time must be provided' });

    for (const [field, val] of [
      ['corrected_check_in',  corrected_check_in],
      ['corrected_check_out', corrected_check_out],
      ['corrected_ot_in',     corrected_ot_in],
      ['corrected_ot_out',    corrected_ot_out],
    ]) {
      if (val && !isValidTime(val))
        return res.status(400).json({ message: `Invalid time format for ${field} — use HH:MM` });
    }

    if (corrected_check_in && corrected_check_out) {
      if (!isValidCheckout(corrected_check_in, corrected_check_out))
        return res.status(400).json({ message: 'Check-out must be after check-in' });
    }
    if (corrected_ot_in && corrected_ot_out) {
      if (!isValidCheckout(corrected_ot_in, corrected_ot_out))
        return res.status(400).json({ message: 'OT check-out must be after OT check-in' });
    }

    // Load attendance_daily record
    const { rows: daily } = await db.query(
      `SELECT id, employee_id, TO_CHAR(date, 'YYYY-MM-DD') AS date
       FROM attendance_daily WHERE id = $1`,
      [attendance_daily_id]
    );
    if (!daily.length)
      return res.status(404).json({ message: 'Attendance record not found' });

    const { employee_id, date } = daily[0];

    // Load employee shift for std_hours
    const { rows: empRows } = await db.query(
      `SELECT s.std_hours_per_day FROM employees e
       LEFT JOIN shifts s ON s.id = e.shift_id
       WHERE e.id = $1`,
      [employee_id]
    );
    const stdHours = parseFloat(empRows[0]?.std_hours_per_day) || 8;

    // Load raw punches for that day (ascending)
    const { rows: rawPunches } = await db.query(
      `SELECT punch_time, punch_state
       FROM attendance_raw
       WHERE employee_id = $1
         AND punch_time >= $2
         AND punch_time <  ($2::date + INTERVAL '1 day')
       ORDER BY punch_time ASC`,
      [employee_id, date]
    );

    const stdPunches  = rawPunches.filter(p => ['0','1','2','3'].includes(String(p.punch_state)));
    const otInPunch   = rawPunches.find(p => String(p.punch_state) === '4');
    const otOutPunches = rawPunches.filter(p => String(p.punch_state) === '5');
    const otOutPunch  = otOutPunches.length ? otOutPunches[otOutPunches.length - 1] : null;

    const original_check_in  = stdPunches.length > 0 ? punchToTime(stdPunches[0]) : null;
    const original_check_out = stdPunches.length > 1 ? punchToTime(stdPunches[stdPunches.length - 1]) : null;
    const original_ot_in     = punchToTime(otInPunch);
    const original_ot_out    = punchToTime(otOutPunch);

    // Effective times: corrected if provided, else original
    const effCheckIn  = corrected_check_in  || original_check_in;
    const effCheckOut = corrected_check_out || original_check_out;
    const effOtIn     = corrected_ot_in     || original_ot_in;
    const effOtOut    = corrected_ot_out    || original_ot_out;

    const hours_worked = (effCheckIn && effCheckOut) ? timeDiffHours(effCheckIn, effCheckOut) : 0;
    const ot_hours     = (effOtIn    && effOtOut)    ? timeDiffHours(effOtIn, effOtOut)       : 0;
    const late_hours   = round2(Math.max(0, stdHours - hours_worked));

    // Determine missing_punch after correction
    let missing_punch = null;
    if (effCheckIn && !effCheckOut)  missing_punch = 'OUT';
    if (!effCheckIn && effCheckOut)  missing_punch = 'IN';
    if (effOtIn && !effOtOut)        missing_punch = 'OT_OUT';
    if (!effOtIn && effOtOut)        missing_punch = 'OT_IN';

    // Upsert correction record
    await db.query(
      `INSERT INTO punch_corrections
         (attendance_daily_id, employee_id, date,
          corrected_check_in, corrected_check_out, corrected_ot_in, corrected_ot_out,
          original_check_in, original_check_out, original_ot_in, original_ot_out,
          note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (attendance_daily_id) DO UPDATE SET
         corrected_check_in  = EXCLUDED.corrected_check_in,
         corrected_check_out = EXCLUDED.corrected_check_out,
         corrected_ot_in     = EXCLUDED.corrected_ot_in,
         corrected_ot_out    = EXCLUDED.corrected_ot_out,
         original_check_in   = EXCLUDED.original_check_in,
         original_check_out  = EXCLUDED.original_check_out,
         original_ot_in      = EXCLUDED.original_ot_in,
         original_ot_out     = EXCLUDED.original_ot_out,
         note                = EXCLUDED.note,
         created_by          = EXCLUDED.created_by,
         updated_at          = NOW()`,
      [
        attendance_daily_id, employee_id, date,
        corrected_check_in  || null, corrected_check_out || null,
        corrected_ot_in     || null, corrected_ot_out    || null,
        original_check_in, original_check_out, original_ot_in, original_ot_out,
        note || null, req.user.id,
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

// ── GET /api/attendance/corrections/:attendance_daily_id ──────────────────────
async function getCorrection(req, res) {
  try {
    const { attendance_daily_id } = req.params;
    const { rows } = await db.query(
      `SELECT
         pc.id, pc.attendance_daily_id, pc.employee_id,
         TO_CHAR(pc.corrected_check_in,  'HH24:MI') AS corrected_check_in,
         TO_CHAR(pc.corrected_check_out, 'HH24:MI') AS corrected_check_out,
         TO_CHAR(pc.corrected_ot_in,     'HH24:MI') AS corrected_ot_in,
         TO_CHAR(pc.corrected_ot_out,    'HH24:MI') AS corrected_ot_out,
         TO_CHAR(pc.original_check_in,   'HH24:MI') AS original_check_in,
         TO_CHAR(pc.original_check_out,  'HH24:MI') AS original_check_out,
         TO_CHAR(pc.original_ot_in,      'HH24:MI') AS original_ot_in,
         TO_CHAR(pc.original_ot_out,     'HH24:MI') AS original_ot_out,
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

module.exports = { saveCorrection, getCorrection, removeCorrection };
