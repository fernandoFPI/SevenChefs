const { query } = require('../config/db');

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
    const { role, id: userId } = req.user;
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

module.exports = { getBalance, getAllBalances, adjustBalance, getOrCreateBalance };
