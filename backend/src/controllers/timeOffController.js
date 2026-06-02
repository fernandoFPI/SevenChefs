const { query } = require('../config/db');
const { createNotification } = require('../services/notificationService');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrCreateBalance(employeeId, year) {
  // Get allowance from system settings
  const { rows: setting } = await query(
    `SELECT value FROM system_settings WHERE key = 'time_off_allowance_days'`
  );
  const allowance = parseInt(setting[0]?.value ?? '15', 10);

  const { rows } = await query(
    `INSERT INTO time_off_balances (employee_id, year, allowance)
     VALUES ($1, $2, $3)
     ON CONFLICT (employee_id, year) DO UPDATE
       SET updated_at = time_off_balances.updated_at
     RETURNING *`,
    [employeeId, year, allowance]
  );
  return rows[0];
}

// ── GET /api/time-off/balance ─────────────────────────────────────────────────
// EMPLOYEE → own balance only
// ADMIN / ACCOUNTANT / MANAGER → can query any employee via ?employee_id=
async function getBalance(req, res) {
  try {
    const { role, userId } = req.user;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    let employeeId = req.query.employee_id;

    if (role === 'EMPLOYEE') {
      const { rows } = await query(
        `SELECT e.id FROM employees e JOIN users u ON u.employee_id = e.id WHERE u.id = $1`,
        [userId]
      );
      if (rows.length === 0) return res.status(403).json({ message: 'No employee record' });
      employeeId = rows[0].id;
    } else if (!employeeId) {
      return res.status(400).json({ message: 'employee_id is required' });
    }

    const balance = await getOrCreateBalance(employeeId, year);

    // Fetch approved/pending time-off requests for this employee+year
    const { rows: requests } = await query(
      `SELECT id, date_from, date_to, total_days, status
       FROM requests
       WHERE employee_id = $1
         AND type = 'TIME_OFF_REQUEST'
         AND EXTRACT(YEAR FROM COALESCE(date_from, created_at)) = $2
       ORDER BY date_from`,
      [employeeId, year]
    );

    // Employee name
    const { rows: emp } = await query(
      `SELECT name FROM employees WHERE id = $1`,
      [employeeId]
    );

    res.json({
      employee_id:   employeeId,
      employee_name: emp[0]?.name || '',
      year,
      allowance:     balance.allowance,
      used_days:     balance.used_days,
      remaining:     balance.remaining,
      requests,
    });
  } catch (err) {
    console.error('[timeOff] getBalance:', err.message);
    res.status(500).json({ message: 'Failed to get balance' });
  }
}

// ── GET /api/time-off/balances ────────────────────────────────────────────────
// ADMIN / ACCOUNTANT only — all employees for given year
async function getAllBalances(req, res) {
  try {
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();

    const { rows: setting } = await query(
      `SELECT value FROM system_settings WHERE key = 'time_off_allowance_days'`
    );
    const defaultAllowance = parseInt(setting[0]?.value ?? '15', 10);

    // Get all active employees with their balance (left join so employees without balance show 0)
    const { rows } = await query(
      `SELECT e.id AS employee_id,
              e.name AS employee_name,
              e.employee_code,
              COALESCE(b.allowance, $2)  AS allowance,
              COALESCE(b.used_days, 0)   AS used_days,
              COALESCE(b.remaining, $2)  AS remaining,
              b.id AS balance_id
       FROM employees e
       LEFT JOIN time_off_balances b
         ON b.employee_id = e.id AND b.year = $1
       WHERE e.is_active = true
       ORDER BY e.name`,
      [year, defaultAllowance]
    );

    res.json({ year, employees: rows });
  } catch (err) {
    console.error('[timeOff] getAllBalances:', err.message);
    res.status(500).json({ message: 'Failed to get balances' });
  }
}

// ── PUT /api/time-off/balances/:employeeId/adjust ─────────────────────────────
// ADMIN only — manually adjust used_days for an employee
async function adjustBalance(req, res) {
  try {
    const { employeeId } = req.params;
    const year      = parseInt(req.body.year, 10) || new Date().getFullYear();
    const { delta } = req.body; // positive = add used days, negative = remove

    if (delta === undefined || delta === null) {
      return res.status(400).json({ message: 'delta is required' });
    }

    // Ensure balance record exists
    await getOrCreateBalance(employeeId, year);

    const { rows } = await query(
      `UPDATE time_off_balances
       SET used_days  = GREATEST(0, used_days + $1),
           updated_at = NOW()
       WHERE employee_id = $2 AND year = $3
       RETURNING *`,
      [parseInt(delta, 10), employeeId, year]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Balance not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[timeOff] adjustBalance:', err.message);
    res.status(500).json({ message: 'Failed to adjust balance' });
  }
}

// ── POST /api/time-off/grant ──────────────────────────────────────────────────
// ADMIN / MANAGER / ACCOUNTANT — directly grant time off on behalf of an employee
async function grantTimeOff(req, res) {
  try {
    const { userId, role } = req.user;
    const { employee_id, date_from, date_to, reason, deduct_from_balance } = req.body;

    if (!employee_id || !date_from || !date_to) {
      return res.status(400).json({ message: 'employee_id, date_from, and date_to are required' });
    }
    if (date_to < date_from) {
      return res.status(400).json({ message: 'date_to must be on or after date_from' });
    }

    // 1. Validate employee
    const { rows: empRows } = await query(
      `SELECT id, name FROM employees WHERE id = $1 AND is_active = true`, [employee_id]
    );
    if (!empRows.length) return res.status(404).json({ message: 'Employee not found' });
    const employee = empRows[0];

    // Granter display name
    const { rows: granterRows } = await query(`SELECT username FROM users WHERE id = $1`, [userId]);
    const granterName = granterRows[0]?.username || role;

    // 2. Calculate working days respecting employee's schedule (0=Mon convention)
    const { rows: schedRows } = await query(
      `SELECT s.working_days FROM employees e LEFT JOIN schedules s ON s.id = e.schedule_id WHERE e.id = $1`,
      [employee_id]
    );
    const workingDaysList = schedRows[0]?.working_days;

    const updatedDates = [];
    const cur = new Date(date_from + 'T00:00:00Z');
    const end = new Date(date_to   + 'T00:00:00Z');
    while (cur <= end) {
      const dow = (cur.getUTCDay() + 6) % 7;
      if (!workingDaysList || workingDaysList.includes(dow)) {
        updatedDates.push(cur.toISOString().slice(0, 10));
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    const totalDays = updatedDates.length;
    if (totalDays === 0) {
      return res.status(400).json({ message: 'No working days in the selected date range' });
    }

    // 3. Check balance (warn but don't block)
    const year = new Date(date_from).getFullYear();
    const balance = await getOrCreateBalance(employee_id, year);
    let warning = null;
    if (deduct_from_balance && totalDays > balance.remaining) {
      warning = `Exceeds remaining balance by ${totalDays - balance.remaining} day(s)`;
    }

    // 4. Upsert attendance_daily → LEAVE_PAID for each working day
    for (const dateStr of updatedDates) {
      await query(
        `INSERT INTO attendance_daily
           (employee_id, date, status, hours_worked, late_hours, ot_hours, is_manually_edited)
         VALUES ($1, $2, 'LEAVE_PAID', 0, 0, 0, true)
         ON CONFLICT (employee_id, date) DO UPDATE
           SET status             = 'LEAVE_PAID',
               hours_worked       = 0,
               late_hours         = 0,
               ot_hours           = 0,
               is_manually_edited = true,
               updated_at         = NOW()`,
        [employee_id, dateStr]
      );
    }

    // 5. Deduct balance if requested
    if (deduct_from_balance) {
      await query(
        `UPDATE time_off_balances
         SET used_days  = used_days + $1, updated_at = NOW()
         WHERE employee_id = $2 AND year = $3`,
        [totalDays, employee_id, year]
      );
    }

    // 6. Audit trail — create a pre-approved request record
    const { rows: reqRows } = await query(
      `INSERT INTO requests
         (employee_id, type, date_from, date_to, total_days, status,
          reason, admin_id, admin_action, admin_note, admin_acted_at)
       VALUES ($1,'TIME_OFF_REQUEST',$2,$3,$4,'APPROVED',$5,$6,'APPROVE',$7,NOW())
       RETURNING *`,
      [employee_id, date_from, date_to, totalDays, reason || null,
       userId, `Granted directly by ${role}`]
    );
    const auditRequest = reqRows[0];

    // 7. Notify the employee
    const { rows: empUser } = await query(
      `SELECT u.id AS user_id FROM users u JOIN employees e ON e.id = u.employee_id WHERE e.id = $1`,
      [employee_id]
    );
    if (empUser.length) {
      await createNotification({
        userId:    empUser[0].user_id,
        type:      'REQUEST_APPROVED',
        message:   `Your time off from ${date_from} to ${date_to} has been approved by ${granterName}.`,
        messageAr: `تمت الموافقة على إجازتك من ${date_from} إلى ${date_to} من قِبل ${granterName}.`,
        requestId: auditRequest.id,
      });
    }

    // 8. Return updated balance
    const updatedBalance = await getOrCreateBalance(employee_id, year);

    res.json({
      message:           'Time off granted successfully',
      employee_name:     employee.name,
      total_days:        totalDays,
      balance_remaining: updatedBalance.remaining,
      dates_updated:     updatedDates,
      ...(warning && { warning }),
    });
  } catch (err) {
    console.error('[timeOff] grantTimeOff:', err.message);
    res.status(500).json({ message: 'Failed to grant time off' });
  }
}

module.exports = { getBalance, getAllBalances, adjustBalance, getOrCreateBalance, grantTimeOff };
