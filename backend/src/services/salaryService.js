const db = require('../config/db');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function recomputeNet(r) {
  const dailyRate  = parseFloat(r.daily_rate);
  const hourlyRate = parseFloat(r.hourly_rate);

  const effOtHours = r.ot_hours_override !== null && r.ot_hours_override !== undefined
    ? parseFloat(r.ot_hours_override)
    : parseFloat(r.approved_ot_hours);

  let lateDeduct;
  if (r.late_hours_override !== null && r.late_hours_override !== undefined) {
    lateDeduct = parseFloat(r.late_hours_override) * hourlyRate * parseFloat(r.late_penalty_unapproved);
  } else {
    lateDeduct =
      parseFloat(r.unapproved_late_hours) * hourlyRate * parseFloat(r.late_penalty_unapproved) +
      parseFloat(r.approved_late_hours)   * hourlyRate * parseFloat(r.late_penalty_approved);
  }

  // OT Overclaim: if effective OT > ZKBio-recorded ceiling, deduct excess at 2×
  const otCeiling   = parseFloat(r.ot_hours_ceiling) || 0;
  const excessOt    = Math.max(0, effOtHours - otCeiling);
  const overclaim   = excessOt * hourlyRate * 2;

  const partialLeaveDed = parseFloat(r.partial_leave_deduction) || 0;

  // ABSENT days are excluded from effective_days. An absent employee receives no pay for that day.
  const net = round2(
    parseFloat(r.base_salary)
    - (r.total_absent_days       * dailyRate)
    - (r.total_unpaid_leave_days * dailyRate)
    + (effOtHours * hourlyRate * parseFloat(r.ot_multiplier))
    - lateDeduct
    - overclaim
    - partialLeaveDed
    + parseFloat(r.bonus       || 0)
    - parseFloat(r.deductions  || 0)
  );

  return { net, overclaim_deduction: round2(overclaim) };
}

async function calculateSalary(employeeId, periodMonth) {
  // Load employee + shift
  const { rows: empRows } = await db.query(
    `SELECT e.monthly_salary, e.currency,
            s.std_hours_per_day,
            s2.std_hours_per_day AS secondary_std_hours
     FROM employees e
     LEFT JOIN shifts s  ON s.id  = e.shift_id
     LEFT JOIN shifts s2 ON s2.id = e.secondary_shift_id
     WHERE e.id = $1 AND e.is_active = true`,
    [employeeId]
  );
  if (!empRows.length) return null;
  const emp = empRows[0];

  // Load shift pattern to determine effective std_hours (average across working days).
  const { rows: patternRows } = await db.query(
    `SELECT s.std_hours_per_day
     FROM employee_shift_patterns esp
     JOIN shifts s ON s.id = esp.shift_id
     WHERE esp.employee_id = $1 AND esp.shift_id IS NOT NULL`,
    [employeeId]
  );

  // Check if a non-DRAFT record exists — skip if so.
  const { rows: existing } = await db.query(
    `SELECT id, status FROM salary_records WHERE employee_id = $1 AND period_month = $2`,
    [employeeId, periodMonth]
  );
  if (existing.length && existing[0].status !== 'DRAFT') return existing[0];

  // Load salary settings snapshot
  const { rows: settings } = await db.query(
    `SELECT key, value FROM system_settings WHERE key IN (
       'std_days_per_month','ot_multiplier','late_penalty_unapproved','late_penalty_approved'
     )`
  );
  const cfg = Object.fromEntries(settings.map(s => [s.key, parseFloat(s.value)]));

  const baseSalary   = parseFloat(emp.monthly_salary) || 0;
  const currency     = emp.currency || 'IQD';
  const stdDays      = cfg.std_days_per_month      || 30;
  const otMult       = cfg.ot_multiplier           || 2.0;
  const latePenUnapp = cfg.late_penalty_unapproved  || 1.5;
  const latePenApp   = cfg.late_penalty_approved    || 1.0;
  const stdHours = patternRows.length > 0
    ? round2(patternRows.reduce((s, r) => s + (parseFloat(r.std_hours_per_day) || 0), 0) / patternRows.length)
    : (parseFloat(emp.std_hours_per_day) || 8) + (parseFloat(emp.secondary_std_hours) || 0);

  const dailyRate  = round4(baseSalary / stdDays);
  const hourlyRate = round4(dailyRate  / stdHours);

  // Build month date range
  const [year, monthNum] = periodMonth.split('-').map(Number);
  const monthStart = `${periodMonth}-01`;
  const lastDay    = new Date(year, monthNum, 0).getDate();
  const monthEnd   = `${periodMonth}-${String(lastDay).padStart(2, '0')}`;

  // Aggregate attendance_daily
  const { rows: agg } = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'PRESENT')      AS present_days,
       COUNT(*) FILTER (WHERE status = 'ABSENT')       AS absent_days,
       COUNT(*) FILTER (WHERE status = 'LEAVE_PAID')   AS paid_leave_days,
       COUNT(*) FILTER (WHERE status = 'LEAVE_UNPAID') AS unpaid_leave_days,
       COUNT(*) FILTER (WHERE status = 'OFF')          AS off_days,
       COALESCE(SUM(ot_hours) FILTER (WHERE ot_approved = true),  0) AS approved_ot_hours,
       COALESCE(SUM(ot_hours), 0)                                    AS ot_hours_recorded,
       COALESCE(SUM(late_hours) FILTER (WHERE late_approved = false AND status = 'PRESENT'), 0) AS unapproved_late_hours,
       COALESCE(SUM(late_hours) FILTER (WHERE late_approved = true  AND status = 'PRESENT'), 0) AS approved_late_hours,
       COALESCE(SUM(partial_leave_hours) FILTER (WHERE partial_leave_type = 'UNPAID'), 0) AS unpaid_partial_hours
     FROM attendance_daily
     WHERE employee_id = $1 AND date >= $2 AND date <= $3`,
    [employeeId, monthStart, monthEnd]
  );
  const a = agg[0];

  const approvedOtHours  = parseFloat(a.approved_ot_hours)    || 0;
  const otHoursCeiling   = parseFloat(a.ot_hours_recorded)    || 0;
  const excessOtHours    = Math.max(0, approvedOtHours - otHoursCeiling);
  const overclaim        = round2(excessOtHours * hourlyRate * 2);

  const unpaidPartialHrs = parseFloat(a.unpaid_partial_hours) || 0;
  const partialLeaveDed  = round2(unpaidPartialHrs * hourlyRate);

  const record = {
    base_salary:             baseSalary,
    std_days_per_month:      stdDays,
    daily_rate:              dailyRate,
    std_hours_per_day:       stdHours,
    hourly_rate:             hourlyRate,
    ot_multiplier:           otMult,
    late_penalty_unapproved: latePenUnapp,
    late_penalty_approved:   latePenApp,
    total_present_days:      parseInt(a.present_days)      || 0,
    total_absent_days:       parseInt(a.absent_days)       || 0,
    total_paid_leave_days:   parseInt(a.paid_leave_days)   || 0,
    total_unpaid_leave_days: parseInt(a.unpaid_leave_days) || 0,
    total_off_days:          parseInt(a.off_days)          || 0,
    approved_ot_hours:       approvedOtHours,
    ot_hours_ceiling:        otHoursCeiling,
    excess_ot_hours:         excessOtHours,
    overclaim_deduction:     overclaim,
    unapproved_late_hours:   parseFloat(a.unapproved_late_hours) || 0,
    approved_late_hours:     parseFloat(a.approved_late_hours)  || 0,
    partial_leave_deduction: partialLeaveDed,
    ot_hours_override:       null,
    late_hours_override:     null,
    bonus:                   0,
    deductions:              0,
    currency,
  };

  const { net } = recomputeNet(record);
  record.net_salary = net;

  const { rows: upserted } = await db.query(
    `INSERT INTO salary_records
       (employee_id, period_month,
        base_salary, std_days_per_month, daily_rate, std_hours_per_day, hourly_rate,
        ot_multiplier, late_penalty_unapproved, late_penalty_approved,
        total_present_days, total_absent_days, total_paid_leave_days,
        total_unpaid_leave_days, total_off_days,
        approved_ot_hours, unapproved_late_hours, approved_late_hours,
        ot_hours_ceiling, excess_ot_hours, overclaim_deduction,
        partial_leave_deduction,
        ot_hours_override, late_hours_override,
        bonus, deductions, net_salary, currency, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,'DRAFT')
     ON CONFLICT (employee_id, period_month) DO UPDATE SET
       base_salary             = EXCLUDED.base_salary,
       std_days_per_month      = EXCLUDED.std_days_per_month,
       daily_rate              = EXCLUDED.daily_rate,
       std_hours_per_day       = EXCLUDED.std_hours_per_day,
       hourly_rate             = EXCLUDED.hourly_rate,
       ot_multiplier           = EXCLUDED.ot_multiplier,
       late_penalty_unapproved = EXCLUDED.late_penalty_unapproved,
       late_penalty_approved   = EXCLUDED.late_penalty_approved,
       total_present_days      = EXCLUDED.total_present_days,
       total_absent_days       = EXCLUDED.total_absent_days,
       total_paid_leave_days   = EXCLUDED.total_paid_leave_days,
       total_unpaid_leave_days = EXCLUDED.total_unpaid_leave_days,
       total_off_days          = EXCLUDED.total_off_days,
       approved_ot_hours       = EXCLUDED.approved_ot_hours,
       unapproved_late_hours   = EXCLUDED.unapproved_late_hours,
       approved_late_hours     = EXCLUDED.approved_late_hours,
       ot_hours_ceiling        = EXCLUDED.ot_hours_ceiling,
       excess_ot_hours         = EXCLUDED.excess_ot_hours,
       overclaim_deduction     = EXCLUDED.overclaim_deduction,
       partial_leave_deduction = EXCLUDED.partial_leave_deduction,
       currency                = EXCLUDED.currency,
       net_salary              = EXCLUDED.net_salary,
       updated_at              = NOW()
     WHERE salary_records.status = 'DRAFT'
     RETURNING *`,
    [
      employeeId, periodMonth,
      record.base_salary, record.std_days_per_month, record.daily_rate,
      record.std_hours_per_day, record.hourly_rate,
      record.ot_multiplier, record.late_penalty_unapproved, record.late_penalty_approved,
      record.total_present_days, record.total_absent_days, record.total_paid_leave_days,
      record.total_unpaid_leave_days, record.total_off_days,
      record.approved_ot_hours, record.unapproved_late_hours, record.approved_late_hours,
      record.ot_hours_ceiling, record.excess_ot_hours, record.overclaim_deduction,
      record.partial_leave_deduction,
      null, null,
      0, 0, record.net_salary, record.currency,
    ]
  );

  return upserted[0] || existing[0] || null;
}

async function calculateAllSalaries(periodMonth) {
  const { rows: employees } = await db.query(
    `SELECT id FROM employees WHERE is_active = true`
  );
  let count = 0;
  for (const emp of employees) {
    const result = await calculateSalary(emp.id, periodMonth);
    if (result) count++;
  }
  return count;
}

module.exports = { calculateSalary, calculateAllSalaries, recomputeNet };
