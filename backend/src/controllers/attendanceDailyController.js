const db = require('../config/db');
const { processAttendance } = require('../services/attendanceProcessor');

const ADMIN_ACCOUNTANT = ['ADMIN', 'ACCOUNTANT'];

// ── GET /api/attendance/daily ─────────────────────────────────────────────────
async function getDaily(req, res) {
  try {
    const { employee_id, month, date_from, date_to, status } = req.query;

    // Prefer explicit date_from/date_to (sent by frontend to avoid week-boundary expansion).
    // Fall back to deriving from month when not provided.
    let dateFrom, dateTo;
    if (date_from && date_to) {
      dateFrom = date_from;
      dateTo   = date_to;
    } else {
      const monthStr = month || new Date().toISOString().slice(0, 7);
      const [y, m]   = monthStr.split('-').map(Number);
      dateFrom = `${monthStr}-01`;
      dateTo   = `${monthStr}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    }

    const conditions = ['ad.date >= $1', 'ad.date <= $2'];
    const params     = [dateFrom, dateTo];

    if (employee_id) { params.push(employee_id); conditions.push(`ad.employee_id = $${params.length}`); }
    if (status)      { params.push(status);       conditions.push(`ad.status = $${params.length}`); }

    const { rows } = await db.query(`
      SELECT ad.*,
             TO_CHAR(ad.date, 'YYYY-MM-DD') AS date,
             e.name AS employee_name, e.employee_code,
             s.std_hours_per_day,
             sc.name AS schedule_name
      FROM attendance_daily ad
      JOIN employees e ON e.id = ad.employee_id
      LEFT JOIN shifts    s  ON s.id = e.shift_id
      LEFT JOIN schedules sc ON sc.id = e.schedule_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.name ASC, ad.date ASC
    `, params);

    res.json({ data: rows });
  } catch (err) {
    console.error('[daily] getDaily:', err.message);
    res.status(500).json({ message: 'Failed to fetch attendance records' });
  }
}

// ── PUT /api/attendance/daily/:id ─────────────────────────────────────────────
async function updateDaily(req, res) {
  try {
    const { id }   = req.params;
    const role     = req.user.role;
    const isAdmin  = ADMIN_ACCOUNTANT.includes(role);

    const { rows: cur } = await db.query(
      'SELECT * FROM attendance_daily WHERE id = $1', [id]
    );
    if (!cur.length) return res.status(404).json({ message: 'Record not found' });

    const record = cur[0];
    const sets   = ['updated_at = NOW()', 'is_manually_edited = true'];
    const params = [];

    if (isAdmin) {
      if (req.body.status !== undefined) {
        params.push(req.body.status); sets.push(`status = $${params.length}`);
      }
      if (req.body.hours_worked !== undefined) {
        params.push(req.body.hours_worked); sets.push(`hours_worked = $${params.length}`);
      }
    }

    // All roles can toggle approvals and add notes.
    if (req.body.ot_approved !== undefined) {
      params.push(req.body.ot_approved); sets.push(`ot_approved = $${params.length}`);
    }
    if (req.body.late_approved !== undefined) {
      params.push(req.body.late_approved); sets.push(`late_approved = $${params.length}`);
    }
    if (req.body.note !== undefined) {
      params.push(req.body.note); sets.push(`note = $${params.length}`);
    }

    params.push(id);
    const { rows } = await db.query(
      `UPDATE attendance_daily SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[daily] updateDaily:', err.message);
    res.status(500).json({ message: 'Failed to update record' });
  }
}

// ── POST /api/attendance/daily/recalculate ────────────────────────────────────
async function recalculate(req, res) {
  try {
    const { employee_id, month } = req.body;

    const monthStr = month || new Date().toISOString().slice(0, 7);

    const [year, monthNum] = monthStr.split('-').map(Number);

    const dateFrom = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay  = new Date(year, monthNum, 0).getDate();
    const dateTo   = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Reset is_manually_edited so records get fresh data.
    const resetParams = [dateFrom, dateTo];
    let resetWhere = 'date >= $1 AND date <= $2';
    if (employee_id) { resetParams.push(employee_id); resetWhere += ` AND employee_id = $${resetParams.length}`; }
    await db.query(`UPDATE attendance_daily SET is_manually_edited = false WHERE ${resetWhere}`, resetParams);

    const opts = { month: monthStr };
    if (employee_id) opts.employeeIds = [employee_id];

    const processed = await processAttendance(opts);
    res.json({ message: 'Recalculation complete', processed });
  } catch (err) {
    console.error('[daily] recalculate:', err.message);
    res.status(500).json({ message: 'Recalculation failed' });
  }
}

// ── POST /api/attendance/leaves ───────────────────────────────────────────────
async function recordLeave(req, res) {
  try {
    const { employee_id, date, leave_type, note } = req.body;
    if (!employee_id || !date || !leave_type)
      return res.status(400).json({ message: 'employee_id, date, and leave_type are required' });
    if (!['PAID', 'UNPAID'].includes(leave_type))
      return res.status(400).json({ message: 'leave_type must be PAID or UNPAID' });

    const status = leave_type === 'PAID' ? 'LEAVE_PAID' : 'LEAVE_UNPAID';

    // 1. Upsert leave record.
    await db.query(
      `INSERT INTO leave_records (employee_id, date, leave_type, created_by, note)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (employee_id, date) DO UPDATE SET
         leave_type = EXCLUDED.leave_type,
         note       = EXCLUDED.note,
         created_by = EXCLUDED.created_by`,
      [employee_id, date, leave_type, req.user.id, note || null]
    );

    // 2. Upsert attendance_daily for that date.
    await db.query(
      `INSERT INTO attendance_daily
         (employee_id, date, status, hours_worked, late_hours, ot_hours, is_manually_edited)
       VALUES ($1,$2,$3,0,0,0,true)
       ON CONFLICT (employee_id, date) DO UPDATE SET
         status             = EXCLUDED.status,
         hours_worked       = 0,
         late_hours         = 0,
         ot_hours           = 0,
         is_manually_edited = true,
         updated_at         = NOW()`,
      [employee_id, date, status]
    );

    res.json({ message: 'Leave recorded' });
  } catch (err) {
    console.error('[daily] recordLeave:', err.message);
    res.status(500).json({ message: 'Failed to record leave' });
  }
}

// ── DELETE /api/attendance/leaves ─────────────────────────────────────────────
async function removeLeave(req, res) {
  try {
    const { employee_id, date } = req.body;
    if (!employee_id || !date)
      return res.status(400).json({ message: 'employee_id and date are required' });

    // 1. Delete leave record.
    await db.query(
      'DELETE FROM leave_records WHERE employee_id = $1 AND date = $2',
      [employee_id, date]
    );

    // 2. Unlock the daily record for reprocessing.
    await db.query(
      'UPDATE attendance_daily SET is_manually_edited = false WHERE employee_id = $1 AND date = $2',
      [employee_id, date]
    );

    // 3. Reprocess just that employee + date. Pass plain string — no Date() construction
    //    avoids UTC/local midnight ambiguity when the server runs in a non-UTC timezone.
    await processAttendance({
      employeeIds: [employee_id],
      dateFrom:    date,
      dateTo:      date,
    });

    res.json({ message: 'Leave removed' });
  } catch (err) {
    console.error('[daily] removeLeave:', err.message);
    res.status(500).json({ message: 'Failed to remove leave' });
  }
}

module.exports = { getDaily, updateDaily, recalculate, recordLeave, removeLeave };
