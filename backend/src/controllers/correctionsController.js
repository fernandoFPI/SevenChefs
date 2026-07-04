const db = require('../config/db');
const { processAttendance, pairCheckPunches } = require('../services/attendanceProcessor');

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

    // Load employee shift for std_hours and OT mode setting in parallel
    const [empResult, otModeResult] = await Promise.all([
      db.query(
        `SELECT s.std_hours_per_day FROM employees e
         LEFT JOIN shifts s ON s.id = e.shift_id
         WHERE e.id = $1`,
        [employee_id]
      ),
      db.query(`SELECT value FROM system_settings WHERE key = 'ot_calculation_mode'`),
    ]);
    const stdHours = parseFloat(empResult.rows[0]?.std_hours_per_day) || 8;
    const otMode   = otModeResult.rows[0]?.value || 'OT_PUNCH';

    // Load raw punches for that day (ascending), applying the same cross-midnight
    // rule as attendanceProcessor.js: an early-morning (<05:00 Asia/Baghdad)
    // Check-Out belongs to the PREVIOUS calendar day's shift, not the day it's
    // timestamped on. Without this, a night-shift's real closing punch falls
    // into the next day's window and this query instead picks up the previous
    // night's leftover checkout, producing a bogus IN→OUT pairing.
    const { rows: rawPunches } = await db.query(
      `SELECT punch_time, COALESCE(overridden_state, punch_state) AS punch_state
       FROM attendance_raw
       WHERE employee_id = $1
         AND is_ignored = false
         AND (
           (
             DATE(punch_time AT TIME ZONE 'Asia/Baghdad') = $2::date
             AND NOT (
               COALESCE(overridden_state, punch_state) = '1'
               AND (EXTRACT(HOUR   FROM punch_time AT TIME ZONE 'Asia/Baghdad') * 60
                  + EXTRACT(MINUTE FROM punch_time AT TIME ZONE 'Asia/Baghdad')) < 300
             )
           )
           OR (
             DATE(punch_time AT TIME ZONE 'Asia/Baghdad') = ($2::date + INTERVAL '1 day')
             AND COALESCE(overridden_state, punch_state) = '1'
             AND (EXTRACT(HOUR   FROM punch_time AT TIME ZONE 'Asia/Baghdad') * 60
                + EXTRACT(MINUTE FROM punch_time AT TIME ZONE 'Asia/Baghdad')) < 300
           )
         )
       ORDER BY punch_time ASC`,
      [employee_id, date]
    );

    const inPunches   = rawPunches.filter(p => String(p.punch_state) === '0');
    const outPunches  = rawPunches.filter(p => String(p.punch_state) === '1');
    const stdPunches  = rawPunches.filter(p => ['0','1','2','3'].includes(String(p.punch_state)));
    const otInPunch   = rawPunches.find(p => String(p.punch_state) === '4');
    const otOutPunches = rawPunches.filter(p => String(p.punch_state) === '5');
    const otOutPunch  = otOutPunches.length ? otOutPunches[otOutPunches.length - 1] : null;

    const original_check_in  = inPunches.length  > 0 ? punchToTime(inPunches[0])                   : null;
    const original_check_out = outPunches.length > 0 ? punchToTime(outPunches[outPunches.length - 1]) : null;
    const original_ot_in     = punchToTime(otInPunch);
    const original_ot_out    = punchToTime(otOutPunch);

    // Effective OT times: corrected if provided, else original
    const effOtIn  = corrected_ot_in  || original_ot_in;
    const effOtOut = corrected_ot_out || original_ot_out;

    // Segment-aware hours calculation: pair each Check-In with the NEXT
    // Check-Out in chronological order (same rule as attendanceProcessor's
    // calcDaySplit), so a day with more than one IN/OUT never gets bridged
    // across a gap where a punch is actually missing. A correction only ever
    // overrides the day's first check-in and/or last check-out; every other
    // punch in between is left untouched.
    const stdCheckPunches = rawPunches
      .filter(p => ['0', '1'].includes(String(p.punch_state)))
      .map(p => ({ time: new Date(p.punch_time), state: String(p.punch_state) }));

    if (corrected_check_in) {
      const [h, m]  = corrected_check_in.split(':').map(Number);
      const firstIn = stdCheckPunches.find(p => p.state === '0');
      if (firstIn) {
        firstIn.time = new Date(firstIn.time);
        firstIn.time.setHours(h, m, 0, 0);
      } else {
        const t = new Date(`${date}T00:00:00`);
        t.setHours(h, m, 0, 0);
        stdCheckPunches.push({ time: t, state: '0' });
      }
    }
    if (corrected_check_out) {
      const [h, m] = corrected_check_out.split(':').map(Number);
      const outs   = stdCheckPunches.filter(p => p.state === '1');
      if (outs.length) {
        const lastOut = outs[outs.length - 1];
        lastOut.time  = new Date(lastOut.time);
        lastOut.time.setHours(h, m, 0, 0);
        if (h < 8) lastOut.time.setDate(lastOut.time.getDate() + 1); // cross-midnight checkout
      } else {
        const t = new Date(`${date}T00:00:00`);
        t.setHours(h, m, 0, 0);
        if (h < 8) t.setDate(t.getDate() + 1); // cross-midnight checkout
        stdCheckPunches.push({ time: t, state: '1' });
      }
    }
    stdCheckPunches.sort((a, b) => a.time - b.time);

    const { stdHoursWorked, missingPunch: stdMissingPunch } = pairCheckPunches(stdCheckPunches);
    const hours_worked = stdHoursWorked;

    let ot_hours, late_hours;
    if (otMode === 'CALCULATED') {
      ot_hours   = round2(Math.max(0, hours_worked - stdHours));
      late_hours = round2(Math.max(0, stdHours - hours_worked));
    } else {
      ot_hours   = (effOtIn && effOtOut) ? timeDiffHours(effOtIn, effOtOut) : 0;
      late_hours = round2(Math.max(0, stdHours - hours_worked));
    }

    // Determine missing_punch after correction
    let missing_punch = stdMissingPunch;
    if (effOtIn && !effOtOut) missing_punch = 'OT_OUT';
    if (!effOtIn && effOtOut) missing_punch = 'OT_IN';

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
