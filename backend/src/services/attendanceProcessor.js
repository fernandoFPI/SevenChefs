const db = require('../config/db');

// Returns every calendar date between start and end (inclusive) as 'YYYY-MM-DD' strings.
// Accepts either 'YYYY-MM-DD' strings or Date objects.
// Uses LOCAL date parts for Date objects so "today" means today in the server timezone,
// then iterates entirely in UTC to avoid DST/offset shifts during the loop.
function dateRange(start, end) {
  function toLocalDateStr(d) {
    if (typeof d === 'string') return d.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const dates = [];
  const cur  = new Date(toLocalDateStr(start) + 'T00:00:00Z');
  const last = new Date(toLocalDateStr(end)   + 'T00:00:00Z');
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// JS getDay() = 0=Sun. Our convention: 0=Mon … 6=Sun.
function jsToOurWeekday(jsDay) {
  return (jsDay + 6) % 7;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Returns total minutes from midnight for a timestamp in Asia/Baghdad local time.
function getLocalMinutes(date) {
  const str = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  let [h, m] = str.split(':').map(Number);
  if (h === 24) h = 0; // midnight edge case in some runtimes
  return h * 60 + m;
}

// Parses a Postgres TIME string ('HH:MM:SS') to total minutes from midnight.
function shiftTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Standard punch states (Check-In/Out, Break-Out/In).
const STD_STATES  = new Set(['0', '1', '2', '3']);
// OT punch states.
const OT_IN_STATE  = '4';
const OT_OUT_STATE = '5';

// Split-shift variant: pair Check-In (0) / Check-Out (1) punches sequentially.
// Segment 1 = punch[0]→punch[1], Segment 2 = punch[2]→punch[3], etc.
// Handles 2 punches (one shift) and 4 punches (two shifts) uniformly.
function calcDaySplit(dayPunches, stdHours) {
  const checkPunches = dayPunches.filter(p => p.state === '0' || p.state === '1');
  const otPunches    = dayPunches.filter(p => p.state === OT_IN_STATE || p.state === OT_OUT_STATE);

  let stdHoursWorked = 0;
  let missingPunch   = null;

  if (checkPunches.length >= 2) {
    for (let i = 0; i + 1 < checkPunches.length; i += 2) {
      stdHoursWorked += (checkPunches[i + 1].time - checkPunches[i].time) / 3_600_000;
    }
    stdHoursWorked = round2(stdHoursWorked);
    if (checkPunches.length % 2 !== 0) missingPunch = 'OUT';
  } else if (checkPunches.length === 1) {
    missingPunch = 'OUT';
  }

  let otHours = 0;
  if (otPunches.length > 0) {
    const otIn  = otPunches.find(p => p.state === OT_IN_STATE);
    const otOut = [...otPunches].reverse().find(p => p.state === OT_OUT_STATE);
    if (otIn && otOut) {
      otHours = round2((otOut.time - otIn.time) / 3_600_000);
    } else if (otIn && !otOut) {
      missingPunch = 'OT_OUT';
    } else {
      missingPunch = 'OT_IN';
    }
  }

  const hoursWorked = stdHoursWorked;
  const lateHours   = round2(Math.max(0, stdHours - stdHoursWorked));
  return { hoursWorked, stdHoursWorked, otHours, lateHours, missingPunch };
}

function calcDay(dayPunches, stdHours) {
  // dayPunches: [{ time: Date, state: string }] sorted ascending by time.
  const stdPunches = dayPunches.filter(p => STD_STATES.has(p.state));
  const otPunches  = dayPunches.filter(p => p.state === OT_IN_STATE || p.state === OT_OUT_STATE);

  // ── Standard hours ────────────────────────────────────────────────────────
  let stdHoursWorked, missingPunch;
  missingPunch = null;

  if (stdPunches.length >= 2) {
    const inTime  = stdPunches[0].time;
    const outTime = stdPunches[stdPunches.length - 1].time;
    stdHoursWorked = round2((outTime - inTime) / 3_600_000);
  } else if (stdPunches.length === 1) {
    stdHoursWorked = 0;
    // Infer which punch is missing from the state of the lone punch.
    // Check-In (0) or Break-Out (2) → employee is 'in', so OUT is missing.
    // Check-Out (1) or Break-In (3) → employee is 'out', so IN is missing.
    const s = stdPunches[0].state;
    missingPunch = (s === '0' || s === '2') ? 'OUT' : 'IN';
  } else {
    stdHoursWorked = 0;
  }

  // ── OT hours ──────────────────────────────────────────────────────────────
  // OT is ONLY recorded via OT-In (state 4) / OT-Out (state 5) punch buttons.
  // No fallback calculation — employees must use the OT button.
  let otHours = 0;

  if (otPunches.length > 0) {
    const otIn  = otPunches.find(p => p.state === OT_IN_STATE);
    const otOut = [...otPunches].reverse().find(p => p.state === OT_OUT_STATE);

    if (otIn && otOut) {
      otHours      = round2((otOut.time - otIn.time) / 3_600_000);
    } else if (otIn && !otOut) {
      missingPunch = 'OT_OUT';
    } else {
      // otOut present without otIn
      missingPunch = 'OT_IN';
    }
  }
  // No OT punches → otHours stays 0. No fallback.

  // hours_worked stores standard hours only; OT is tracked separately in ot_hours.
  const hoursWorked = stdHoursWorked;
  const lateHours   = round2(Math.max(0, stdHours - stdHoursWorked));

  return { hoursWorked, stdHoursWorked, otHours, lateHours, missingPunch };
}

async function getSetting(key) {
  const { rows } = await db.query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function processAttendance(options = {}) {
  const { employeeIds = [] } = options;

  const otMode             = (await getSetting('ot_calculation_mode'))  || 'OT_PUNCH';
  const gracePeriodEnabled = (await getSetting('grace_period_enabled')) === 'true';
  const gracePeriodMinutes = parseFloat(await getSetting('grace_period_minutes')) || 10;

  // Step 1: Load employees (with shift + schedule).
  const empParams = [];
  let empWhere = 'WHERE e.is_active = true';
  if (employeeIds.length) {
    empParams.push(employeeIds);
    empWhere += ` AND e.id = ANY($1)`;
  }
  const { rows: employees } = await db.query(`
    SELECT e.id, e.name, e.employee_code,
           s.std_hours_per_day, s.shift_start, s.shift_end,
           s.shift_type,
           s2.std_hours_per_day AS secondary_std_hours,
           s2.shift_end         AS secondary_shift_end,
           sc.working_days
    FROM employees e
    LEFT JOIN shifts    s  ON s.id  = e.shift_id
    LEFT JOIN shifts    s2 ON s2.id = e.secondary_shift_id
    LEFT JOIN schedules sc ON sc.id = e.schedule_id
    ${empWhere}
  `, empParams);

  if (!employees.length) return 0;

  // Load shift patterns for all employees in one query.
  // Map: employeeId → Map<dayOfWeek, {std_hours_per_day, shift_start, shift_end, shift_type}|null>
  // null value means off-day for that weekday.
  const empIds = employees.map(e => e.id);
  const { rows: patternRows } = await db.query(
    `SELECT esp.employee_id, esp.day_of_week, esp.shift_id,
            s.std_hours_per_day, s.shift_start, s.shift_end, s.shift_type
     FROM employee_shift_patterns esp
     LEFT JOIN shifts s ON s.id = esp.shift_id
     WHERE esp.employee_id = ANY($1)`,
    [empIds]
  );
  const patternsByEmployee = new Map();
  for (const row of patternRows) {
    if (!patternsByEmployee.has(row.employee_id)) {
      patternsByEmployee.set(row.employee_id, new Map());
    }
    patternsByEmployee.get(row.employee_id).set(
      Number(row.day_of_week),
      row.shift_id
        ? { std_hours_per_day: row.std_hours_per_day, shift_start: row.shift_start, shift_end: row.shift_end, shift_type: row.shift_type }
        : null
    );
  }

  // Step 2: Determine date range.
  let from, to;

  if (options.month) {
    const [year, monthNum] = options.month.split('-').map(Number);
    from = new Date(year, monthNum - 1, 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(year, monthNum, 0);
    to.setHours(23, 59, 59, 999);
  } else if (options.dateFrom && options.dateTo) {
    from = new Date(options.dateFrom);
    from.setHours(0, 0, 0, 0);
    to = new Date(options.dateTo);
    to.setHours(23, 59, 59, 999);
  } else {
    const now = new Date();
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    from.setHours(0, 0, 0, 0);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
  }

  const dates = dateRange(from, to);
  if (!dates.length) return 0;
  let processed = 0;

  for (const emp of employees) {
    const primaryHours   = parseFloat(emp.std_hours_per_day)    || 8;
    const secondaryHours = parseFloat(emp.secondary_std_hours)  || 0;
    const stdHours       = primaryHours + secondaryHours;  // default for non-pattern days
    const workingDays = (emp.working_days || []).map(Number);
    const hasSchedule = workingDays.length > 0;
    const empPattern  = patternsByEmployee.get(emp.id);
    const hasPattern  = empPattern !== undefined && empPattern.size > 0;

    // Load all leave records for this employee in the date range once.
    const { rows: leaves } = await db.query(
      `SELECT date::text, leave_type FROM leave_records
       WHERE employee_id = $1 AND date >= $2 AND date <= $3`,
      [emp.id, dates[0], dates[dates.length - 1]]
    );
    const leaveMap = new Map(leaves.map(l => [l.date, l.leave_type]));

    // Load all punches for this employee in the date range once — including punch_state.
    const { rows: punches } = await db.query(
      `SELECT DATE(punch_time AT TIME ZONE 'Asia/Baghdad') AS day, punch_time, punch_state
       FROM attendance_raw
       WHERE employee_id = $1
         AND punch_time >= $2 AND punch_time < $3
       ORDER BY punch_time ASC`,
      [
        emp.id,
        dates[0],
        new Date(new Date(dates[dates.length - 1]).getTime() + 86400000).toISOString().slice(0, 10),
      ]
    );

    // Group punches by day string 'YYYY-MM-DD'.
    // pg may return DATE as a local-midnight Date object; use local getters so UTC+3
    // midnight (= previous day in UTC) doesn't shift the date back by one day.
    const punchMap = new Map();
    for (const p of punches) {
      let day;
      if (p.day instanceof Date) {
        const d = p.day;
        day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        day = String(p.day).slice(0, 10);
      }
      if (!punchMap.has(day)) punchMap.set(day, []);
      punchMap.get(day).push({ time: new Date(p.punch_time), state: String(p.punch_state ?? '') });
    }

    for (const dateStr of dates) {
      // Skip if manually edited.
      const { rows: existing } = await db.query(
        'SELECT id, is_manually_edited FROM attendance_daily WHERE employee_id = $1 AND date = $2',
        [emp.id, dateStr]
      );
      if (existing.length && existing[0].is_manually_edited) continue;

      const jsDay  = new Date(dateStr + 'T00:00:00Z').getUTCDay();
      const ourDay = jsToOurWeekday(jsDay);

      // Resolve effective shift for this specific date.
      let dayStdHours, dayShiftStart, dayShiftEnd, dayShiftType, isWorkday;
      if (hasPattern) {
        const dayShift = empPattern.get(ourDay); // object | null | undefined
        if (dayShift === null) {
          // Pattern says off day for this weekday
          isWorkday = false;
          dayStdHours = 0; dayShiftStart = null; dayShiftEnd = null; dayShiftType = null;
        } else if (dayShift) {
          // Pattern defines a shift for this weekday
          isWorkday     = true;
          dayStdHours   = parseFloat(dayShift.std_hours_per_day) || 8;
          dayShiftStart = dayShift.shift_start;
          dayShiftEnd   = dayShift.shift_end;
          dayShiftType  = dayShift.shift_type;
        } else {
          // Weekday not in pattern — fall back to default shift
          isWorkday     = true;
          dayStdHours   = stdHours;
          dayShiftStart = emp.shift_start;
          dayShiftEnd   = emp.secondary_shift_end || emp.shift_end;
          dayShiftType  = emp.shift_type;
        }
      } else {
        isWorkday     = !hasSchedule || workingDays.includes(ourDay);
        dayStdHours   = stdHours;
        dayShiftStart = emp.shift_start;
        dayShiftEnd   = emp.secondary_shift_end || emp.shift_end;
        dayShiftType  = emp.shift_type;
      }

      const dayPunches = punchMap.get(dateStr) || [];
      const leaveType  = leaveMap.get(dateStr) || null;

      let status, hoursWorked, lateHours, otHours, missingPunch;
      missingPunch = null;

      if (leaveType) {
        status      = leaveType === 'PAID' ? 'LEAVE_PAID' : 'LEAVE_UNPAID';
        hoursWorked = 0;
        lateHours   = 0;
        otHours     = 0;
      } else if (!isWorkday) {
        if (dayPunches.length === 0) {
          status      = 'OFF';
          hoursWorked = 0;
          lateHours   = 0;
          otHours     = 0;
        } else {
          // Off-day punch — all hours count as OT.
          const times   = dayPunches.map(p => p.time);
          const inTime  = times[0];
          const outTime = times[times.length - 1];
          otHours     = times.length > 1 ? round2((outTime - inTime) / 3_600_000) : 0;
          hoursWorked = otHours;
          status      = 'PRESENT';
          lateHours   = 0;
        }
      } else {
        // Scheduled workday.
        if (dayPunches.length === 0) {
          status      = 'ABSENT';
          hoursWorked = 0;
          lateHours   = 0;
          otHours     = 0;
        } else {
          const result = (!hasPattern && emp.secondary_shift_id)
            ? calcDaySplit(dayPunches, dayStdHours)
            : calcDay(dayPunches, dayStdHours);
          hoursWorked  = result.hoursWorked;
          lateHours    = result.lateHours;
          if (otMode === 'CALCULATED') {
            otHours      = round2(Math.max(0, hoursWorked - dayStdHours));
            // OT punch flags are meaningless in CALCULATED mode
            missingPunch = (result.missingPunch === 'OT_IN' || result.missingPunch === 'OT_OUT')
              ? null : result.missingPunch;
          } else {
            otHours      = result.otHours;
            missingPunch = result.missingPunch;
          }

          // For DURATION shifts: a single punch is always a missing OUT (employee punched in).
          if (dayShiftType === 'DURATION' && result.missingPunch === 'IN') {
            missingPunch = 'OUT';
          }

          // Grace period: may reduce lateHours only.
          // Skipped automatically for DURATION shifts (no shift_start/shift_end).
          if (gracePeriodEnabled && dayShiftStart && dayShiftEnd) {
            const stdPunches = dayPunches.filter(p => STD_STATES.has(p.state));
            if (stdPunches.length >= 2) {
              let adjustedHours = hoursWorked;

              const checkInMin  = getLocalMinutes(stdPunches[0].time);
              const shiftStartM = shiftTimeToMinutes(dayShiftStart);
              const ciDiff      = checkInMin - shiftStartM; // positive = arrived late
              if (ciDiff > 0 && ciDiff <= gracePeriodMinutes) adjustedHours += ciDiff / 60;

              const checkOutMin = getLocalMinutes(stdPunches[stdPunches.length - 1].time);
              const shiftEndM   = shiftTimeToMinutes(dayShiftEnd);
              const coDiff      = shiftEndM - checkOutMin; // positive = left early
              if (coDiff > 0 && coDiff <= gracePeriodMinutes) adjustedHours += coDiff / 60;

              lateHours = round2(Math.max(0, dayStdHours - adjustedHours));
            }
          }

          status = 'PRESENT';
        }
      }

      await db.query(
        `INSERT INTO attendance_daily
           (employee_id, date, hours_worked, status, late_hours, ot_hours,
            ot_approved, late_approved, is_manually_edited, missing_punch)
         VALUES ($1,$2,$3,$4,$5,$6,false,false,false,$7)
         ON CONFLICT (employee_id, date) DO UPDATE SET
           hours_worked  = EXCLUDED.hours_worked,
           status        = EXCLUDED.status,
           late_hours    = EXCLUDED.late_hours,
           ot_hours      = EXCLUDED.ot_hours,
           missing_punch = EXCLUDED.missing_punch,
           updated_at    = NOW()
         WHERE attendance_daily.is_manually_edited = false
           AND attendance_daily.has_punch_correction = false`,
        [emp.id, dateStr, hoursWorked, status, lateHours, otHours, missingPunch]
      );

      processed++;
    }
  }

  return processed;
}

module.exports = { processAttendance };
