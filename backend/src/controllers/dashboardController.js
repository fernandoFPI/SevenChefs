const db = require('../config/db');

// GET /api/dashboard  (all roles, response varies)
async function getDashboard(req, res) {
  try {
    const role = req.user.role;
    if (role === 'EMPLOYEE') {
      return res.json(await employeeDashboard(req.user.userId));
    }
    return res.json(await adminDashboard());
  } catch (err) {
    console.error('[dashboard]:', err.message);
    res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
}

async function adminDashboard() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const monthStr = todayStr.slice(0, 7);
  const monthStart = `${monthStr}-01`;
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

  // Today's attendance snapshot
  const { rows: todayRows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'PRESENT')                        AS present,
       COUNT(*) FILTER (WHERE status = 'ABSENT')                         AS absent,
       COUNT(*) FILTER (WHERE status IN ('LEAVE_PAID','LEAVE_UNPAID'))   AS on_leave,
       COUNT(*) FILTER (WHERE status = 'OFF')                            AS off_day
     FROM attendance_daily
     WHERE date = $1`,
    [todayStr]
  );
  const { rows: empCount } = await db.query(
    `SELECT COUNT(*) AS total FROM employees WHERE is_active = true`
  );
  const total = parseInt(empCount[0].total) || 0;
  const t = todayRows[0];
  const present   = parseInt(t.present)  || 0;
  const absent    = parseInt(t.absent)   || 0;
  const onLeave   = parseInt(t.on_leave) || 0;
  const offDay    = parseInt(t.off_day)  || 0;
  const notYet    = Math.max(0, total - present - absent - onLeave - offDay);

  // Current month aggregates
  const { rows: monthRows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'PRESENT') AS total_present,
       COUNT(*) FILTER (WHERE status = 'ABSENT')  AS total_absent,
       COALESCE(SUM(ot_hours) FILTER (WHERE ot_approved = true), 0) AS total_ot_hours,
       COALESCE(SUM(late_hours) FILTER (WHERE status = 'PRESENT'), 0) AS total_late_hours
     FROM attendance_daily
     WHERE date >= $1 AND date <= $2`,
    [monthStart, monthEnd]
  );
  const mr = monthRows[0];
  const totalPresent = parseInt(mr.total_present) || 0;
  const totalAbsent  = parseInt(mr.total_absent)  || 0;
  const denominator  = totalPresent + totalAbsent;
  const avgAttendance = denominator > 0 ? Math.round((totalPresent / denominator) * 1000) / 10 : 0;

  // Pending requests
  const { rows: reqRows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE type = 'OT_REQUEST')  AS pending_ot,
       COUNT(*) FILTER (WHERE type = 'OFF_REQUEST') AS pending_off
     FROM requests
     WHERE status IN ('PENDING_MANAGER','PENDING_ADMIN')`
  );

  // Last sync
  const { rows: syncRows } = await db.query(
    `SELECT started_at, status FROM sync_logs ORDER BY started_at DESC LIMIT 1`
  );

  return {
    today: {
      date: todayStr,
      present,
      absent,
      on_leave:         onLeave,
      not_yet_punched:  notYet,
    },
    current_month: {
      total_employees:     total,
      avg_attendance_rate: avgAttendance,
      total_ot_hours:      parseFloat(mr.total_ot_hours)   || 0,
      total_late_hours:    parseFloat(mr.total_late_hours) || 0,
      pending_ot_requests:  parseInt(reqRows[0].pending_ot)  || 0,
      pending_off_requests: parseInt(reqRows[0].pending_off) || 0,
    },
    sync_status: syncRows.length
      ? { last_sync: syncRows[0].started_at, status: syncRows[0].status }
      : { last_sync: null, status: null },
  };
}

async function employeeDashboard(userId) {
  // Resolve employee from user
  const { rows: empRows } = await db.query(
    `SELECT e.id FROM employees e
     JOIN users u ON u.employee_id = e.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!empRows.length) return { current_month: null, pending_requests: 0, recent_punches: [] };
  const employeeId = empRows[0].id;

  const today = new Date();
  const monthStr   = today.toISOString().slice(0, 7);
  const monthStart = `${monthStr}-01`;
  const lastDay    = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthEnd   = `${monthStr}-${String(lastDay).padStart(2, '0')}`;

  const { rows: attRows } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'PRESENT')                       AS days_present,
       COUNT(*) FILTER (WHERE status = 'ABSENT')                        AS days_absent,
       COUNT(*) FILTER (WHERE status IN ('LEAVE_PAID','LEAVE_UNPAID'))  AS days_leave,
       COALESCE(SUM(hours_worked), 0)                                   AS total_hours_worked,
       COALESCE(SUM(ot_hours) FILTER (WHERE ot_approved = true), 0)     AS ot_hours,
       COALESCE(SUM(late_hours) FILTER (WHERE status = 'PRESENT'), 0)   AS late_hours
     FROM attendance_daily
     WHERE employee_id = $1 AND date >= $2 AND date <= $3`,
    [employeeId, monthStart, monthEnd]
  );

  const { rows: pendingRows } = await db.query(
    `SELECT COUNT(*) AS cnt FROM requests
     WHERE employee_id = $1 AND status IN ('PENDING_MANAGER','PENDING_ADMIN')`,
    [employeeId]
  );

  const { rows: recentPunches } = await db.query(
    `SELECT punch_time, punch_state FROM attendance_raw
     WHERE employee_id = $1
     ORDER BY punch_time DESC
     LIMIT 5`,
    [employeeId]
  );

  const a = attRows[0];
  return {
    current_month: {
      days_present:       parseInt(a.days_present)          || 0,
      days_absent:        parseInt(a.days_absent)           || 0,
      days_leave:         parseInt(a.days_leave)            || 0,
      total_hours_worked: parseFloat(a.total_hours_worked)  || 0,
      ot_hours:           parseFloat(a.ot_hours)            || 0,
      late_hours:         parseFloat(a.late_hours)          || 0,
    },
    pending_requests: parseInt(pendingRows[0].cnt) || 0,
    recent_punches:   recentPunches,
  };
}

module.exports = { getDashboard };
