const { query } = require('../config/db');
const {
  notifyManagersOfNewRequest,
  notifyAdminsOfForwardedRequest,
  notifyEmployeeOfDecision,
} = require('../services/notificationService');
const { getOrCreateBalance } = require('./timeOffController');
const { processAttendance } = require('../services/attendanceProcessor');

// ── Working-days helper ───────────────────────────────────────────────────────
// Returns count of days in [dateFrom, dateTo] that fall on the employee's
// scheduled working days. Falls back to counting all days if no schedule set.
async function countWorkingDays(employeeId, dateFrom, dateTo) {
  const { rows } = await query(
    `SELECT s.working_days
     FROM employees e
     LEFT JOIN schedules s ON s.id = e.schedule_id
     WHERE e.id = $1`,
    [employeeId]
  );
  const workingDays = rows[0]?.working_days; // e.g. [1,2,3,4,5] (0=Sun…6=Sat)

  let count = 0;
  const cur = new Date(dateFrom + 'T00:00:00Z');
  const end = new Date(dateTo   + 'T00:00:00Z');
  while (cur <= end) {
    // Convert JS UTC day (0=Sun) to our 0=Mon convention: (day+6)%7
    const dow = (cur.getUTCDay() + 6) % 7;
    if (!workingDays || workingDays.includes(dow)) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

// GET /api/requests — role-scoped list
async function getRequests(req, res) {
  try {
    const { role, userId } = req.user;
    const { status, type } = req.query;

    let baseQuery = `
      SELECT r.*,
             r.attendance_date::text AS attendance_date,
             r.date_from::text       AS date_from,
             r.date_to::text         AS date_to,
             e.name AS employee_name,
             e.employee_code,
             mu.username AS manager_username,
             au.username AS admin_username
      FROM requests r
      JOIN employees e ON e.id = r.employee_id
      LEFT JOIN users mu ON mu.id = r.manager_id
      LEFT JOIN users au ON au.id = r.admin_id
    `;

    const conditions = [];
    const params = [];

    if (role === 'EMPLOYEE') {
      const { rows: emp } = await query(
        `SELECT e.id FROM employees e JOIN users u ON u.employee_id = e.id WHERE u.id = $1`,
        [userId]
      );
      if (emp.length === 0) return res.json([]);
      params.push(emp[0].id);
      conditions.push(`r.employee_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`r.type = $${params.length}`);
    }

    if (conditions.length > 0) {
      baseQuery += ' WHERE ' + conditions.join(' AND ');
    }

    baseQuery += ' ORDER BY r.created_at DESC';

    const { rows } = await query(baseQuery, params);
    res.json(rows);
  } catch (err) {
    console.error('getRequests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/requests — EMPLOYEE creates a request
async function createRequest(req, res) {
  try {
    const { userId } = req.user;
    const { type, attendance_date, hours_requested, reason, request_subtype, time_from, time_to, partial_hours } = req.body;

    const { date_from, date_to } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }
    if (!['OT_REQUEST', 'OFF_REQUEST', 'TIME_OFF_REQUEST'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    if (type !== 'TIME_OFF_REQUEST' && !attendance_date) {
      return res.status(400).json({ error: 'attendance_date is required' });
    }
    if (type === 'OT_REQUEST' && !hours_requested) {
      return res.status(400).json({ error: 'hours_requested is required for OT_REQUEST' });
    }

    const subtype = request_subtype || 'FULL_DAY';
    if (!['FULL_DAY', 'PARTIAL_DAY'].includes(subtype)) {
      return res.status(400).json({ error: 'Invalid request_subtype' });
    }
    if (type === 'OFF_REQUEST' && subtype === 'PARTIAL_DAY') {
      if (!time_from || !time_to) {
        return res.status(400).json({ error: 'time_from and time_to are required for partial day requests' });
      }
      if (!partial_hours || parseFloat(partial_hours) <= 0) {
        return res.status(400).json({ error: 'partial_hours must be greater than 0' });
      }
    }

    // TIME_OFF_REQUEST — specific validations
    if (type === 'TIME_OFF_REQUEST') {
      if (!date_from || !date_to) {
        return res.status(400).json({ error: 'date_from and date_to are required for TIME_OFF_REQUEST' });
      }
      if (date_to < date_from) {
        return res.status(400).json({ error: 'date_to must be >= date_from' });
      }
    }

    // Per-type enable/disable switches (admin-controlled in Settings)
    const disabledKey =
      type === 'TIME_OFF_REQUEST' ? 'request_time_off_enabled'
      : type === 'OFF_REQUEST'    ? (subtype === 'PARTIAL_DAY' ? 'request_partial_day_enabled' : 'request_full_day_enabled')
      : null;
    if (disabledKey) {
      const { rows: sett } = await query(
        'SELECT value FROM system_settings WHERE key = $1', [disabledKey]
      );
      if (sett[0]?.value === 'false') {
        return res.status(403).json({ error: 'This request type is currently disabled by the administrator' });
      }
    }

    const { rows: emp } = await query(
      `SELECT e.id, e.name FROM employees e JOIN users u ON u.employee_id = e.id WHERE u.id = $1 AND e.is_active = true`,
      [userId]
    );
    if (emp.length === 0) {
      return res.status(403).json({ error: 'No active employee record for this user' });
    }
    const employee = emp[0];

    if (type === 'TIME_OFF_REQUEST') {
      // Check for overlapping active requests
      const { rows: overlap } = await query(
        `SELECT id FROM requests
         WHERE employee_id = $1
           AND type = 'TIME_OFF_REQUEST'
           AND status NOT IN ('REJECTED', 'AUTO_REJECTED')
           AND date_from <= $3 AND date_to >= $2`,
        [employee.id, date_from, date_to]
      );
      if (overlap.length > 0) {
        return res.status(409).json({ error: 'An active time-off request already exists overlapping this date range' });
      }

      // Calculate working days
      const totalDays = await countWorkingDays(employee.id, date_from, date_to);
      if (totalDays === 0) {
        return res.status(400).json({ error: 'The selected date range contains no working days' });
      }

      // Check balance
      const year = new Date(date_from).getFullYear();
      const balance = await getOrCreateBalance(employee.id, year);
      if (totalDays > balance.remaining) {
        return res.status(400).json({
          error: `Insufficient time off balance. You have ${balance.remaining} day(s) remaining.`,
          remaining: balance.remaining,
        });
      }

      const { rows } = await query(
        `INSERT INTO requests (employee_id, type, date_from, date_to, total_days, reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [employee.id, type, date_from, date_to, totalDays, reason || null]
      );
      const newRequest = rows[0];
      await notifyManagersOfNewRequest(newRequest, employee.name);
      return res.status(201).json(newRequest);
    }

    const { rows: existing } = await query(
      `SELECT id FROM requests WHERE employee_id = $1 AND type = $2 AND attendance_date = $3 AND status NOT IN ('REJECTED', 'AUTO_REJECTED')`,
      [employee.id, type, attendance_date]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'A pending request already exists for this date and type' });
    }

    const { rows } = await query(
      `INSERT INTO requests (employee_id, type, attendance_date, hours_requested, reason, request_subtype, time_from, time_to, partial_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        employee.id, type, attendance_date,
        hours_requested || null, reason || null,
        subtype,
        time_from || null, time_to || null,
        partial_hours ? parseFloat(partial_hours) : null,
      ]
    );
    const newRequest = rows[0];

    await notifyManagersOfNewRequest(newRequest, employee.name);

    res.status(201).json(newRequest);
  } catch (err) {
    console.error('createRequest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/requests/:id/manager-action — MANAGER forwards or rejects
async function managerAction(req, res) {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const { action, note } = req.body;

    if (!['FORWARD', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'action must be FORWARD or REJECT' });
    }

    const { rows } = await query(
      `SELECT r.*,
              r.date_from::text         AS date_from,
              r.date_to::text           AS date_to,
              r.attendance_date::text   AS attendance_date,
              e.name AS employee_name,
              u.id   AS employee_user_id
       FROM requests r
       JOIN employees e ON e.id = r.employee_id
       LEFT JOIN users u ON u.employee_id = e.id
       WHERE r.id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });

    const request = rows[0];
    if (request.status !== 'PENDING_MANAGER') {
      return res.status(400).json({ error: 'Request is not pending manager action' });
    }

    const newStatus = action === 'FORWARD' ? 'PENDING_ADMIN' : 'REJECTED';

    const { rows: updated } = await query(
      `UPDATE requests
       SET status = $1, manager_id = $2, manager_action = $3, manager_note = $4, manager_acted_at = NOW(), updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [newStatus, userId, action, note || null, id]
    );

    if (action === 'FORWARD') {
      await notifyAdminsOfForwardedRequest(request, request.employee_name);
    } else {
      await notifyEmployeeOfDecision(request, request.employee_user_id, 'REJECTED', note);
    }

    res.json(updated[0]);
  } catch (err) {
    console.error('managerAction error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/requests/:id/admin-action — ADMIN approves or rejects
async function adminAction(req, res) {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const { action, note } = req.body;

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'action must be APPROVE or REJECT' });
    }

    const { rows } = await query(
      `SELECT r.*,
              r.date_from::text         AS date_from,
              r.date_to::text           AS date_to,
              r.attendance_date::text   AS attendance_date,
              e.name AS employee_name,
              u.id   AS employee_user_id
       FROM requests r
       JOIN employees e ON e.id = r.employee_id
       LEFT JOIN users u ON u.employee_id = e.id
       WHERE r.id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Request not found' });

    const request = rows[0];
    if (request.status !== 'PENDING_ADMIN') {
      return res.status(400).json({ error: 'Request is not pending admin action' });
    }

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const { rows: updated } = await query(
      `UPDATE requests
       SET status = $1, admin_id = $2, admin_action = $3, admin_note = $4, admin_acted_at = NOW(), updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [newStatus, userId, action, note || null, id]
    );

    // OT_REQUEST approval: mark ot_approved on the attendance_daily row
    if (action === 'APPROVE' && request.type === 'OT_REQUEST') {
      await query(
        `UPDATE attendance_daily SET ot_approved = true, updated_at = NOW()
         WHERE employee_id = $1 AND date = $2`,
        [request.employee_id, request.attendance_date]
      );
    }

    // OFF_REQUEST full-day approval: record an unpaid schedule-style OFF day
    if (action === 'APPROVE' && request.type === 'OFF_REQUEST' && request.request_subtype !== 'PARTIAL_DAY') {
      await query(
        `INSERT INTO leave_records (employee_id, date, leave_type, created_by)
         VALUES ($1, $2, 'OFF', $3)
         ON CONFLICT (employee_id, date) DO UPDATE SET leave_type = 'OFF', created_by = EXCLUDED.created_by`,
        [request.employee_id, request.attendance_date, userId]
      );
      // Materialize the OFF status now — periodic recompute only covers the
      // current month, so future-month dates would otherwise stay empty.
      await processAttendance({
        employeeIds: [request.employee_id],
        dateFrom:    request.attendance_date,
        dateTo:      request.attendance_date,
      });
    }

    // Partial-day off approval: update attendance_daily for that day
    if (action === 'APPROVE' && request.type === 'OFF_REQUEST' && request.request_subtype === 'PARTIAL_DAY' && request.partial_hours) {
      await query(
        `UPDATE attendance_daily
         SET partial_leave_hours = $1,
             partial_leave_type  = 'UNPAID',
             updated_at          = NOW()
         WHERE employee_id = $2 AND date = $3`,
        [parseFloat(request.partial_hours), request.employee_id, request.attendance_date]
      );
    }

    // TIME_OFF_REQUEST approval: mark each working day as LEAVE_PAID, deduct balance
    if (action === 'APPROVE' && request.type === 'TIME_OFF_REQUEST' && request.date_from && request.date_to) {
      const cur = new Date(request.date_from + 'T00:00:00Z');
      const end = new Date(request.date_to   + 'T00:00:00Z');

      // Get employee's schedule working days for filtering
      const { rows: schedRows } = await query(
        `SELECT s.working_days FROM employees e LEFT JOIN schedules s ON s.id = e.schedule_id WHERE e.id = $1`,
        [request.employee_id]
      );
      const workingDays = schedRows[0]?.working_days;

      while (cur <= end) {
        // Convert JS UTC day (0=Sun) to our 0=Mon convention: (day+6)%7
        const dow     = (cur.getUTCDay() + 6) % 7;
        const dateStr = cur.toISOString().slice(0, 10);

        if (!workingDays || workingDays.includes(dow)) {
          await query(
            `INSERT INTO attendance_daily (employee_id, date, status, hours_worked, late_hours, ot_hours, is_manually_edited)
             VALUES ($1, $2, 'LEAVE_PAID', 0, 0, 0, true)
             ON CONFLICT (employee_id, date) DO UPDATE
               SET status             = 'LEAVE_PAID',
                   hours_worked       = 0,
                   late_hours         = 0,
                   ot_hours           = 0,
                   is_manually_edited = true,
                   updated_at         = NOW()`,
            [request.employee_id, dateStr]
          );
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      // Deduct from balance
      const year = new Date(request.date_from).getFullYear();
      await getOrCreateBalance(request.employee_id, year);
      await query(
        `UPDATE time_off_balances
         SET used_days  = used_days + $1,
             updated_at = NOW()
         WHERE employee_id = $2 AND year = $3`,
        [request.total_days, request.employee_id, year]
      );
    }

    await notifyEmployeeOfDecision(request, request.employee_user_id, newStatus, note);

    res.json(updated[0]);
  } catch (err) {
    console.error('adminAction error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getRequests, createRequest, managerAction, adminAction };
