const axios = require('axios');
const db = require('../config/db');
const { processAttendance } = require('./attendanceProcessor');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSetting(key) {
  const { rows } = await db.query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? '';
}

async function getAllSettings() {
  const { rows } = await db.query('SELECT key, value FROM system_settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ZKBio returns local time strings with no timezone (e.g. "2026-05-31 10:51:23").
// These are UTC+3 (Asia/Baghdad). Appending +03:00 tells PostgreSQL the correct
// moment so it stores the right UTC value internally.
function toUtcTimestamp(zkTimeStr) {
  return zkTimeStr ? zkTimeStr.replace(' ', 'T') + '+03:00' : null;
}

// Format a Date as "YYYY-MM-DD HH:mm:ss" for ZKBio query params.
function fmtZk(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes()) + ':' +
    pad(date.getSeconds())
  );
}

// Convert JS Date weekday (0=Sun) to our convention (0=Mon … 6=Sun).
function jsToOurWeekday(jsDay) {
  return (jsDay + 6) % 7;
}

// ── Credential resolution ─────────────────────────────────────────────────────

async function resolveCredentials() {
  const s = await getAllSettings();

  const host     = s.zk_host     || process.env.ZK_HOST     || '';
  const port     = s.zk_port     || process.env.ZK_PORT     || '';
  const username = s.zk_username || process.env.ZK_USERNAME || '';
  const password = s.zk_password || process.env.ZK_PASSWORD || '';

  if (!host || !port || !username || !password) {
    throw new Error('ZKBio credentials not configured');
  }

  return { host, port, username, password };
}

// ── ZKBio API ─────────────────────────────────────────────────────────────────

async function zkAuth(host, port, username, password) {
  const { data } = await axios.post(
    `http://${host}:${port}/jwt-api-token-auth/`,
    { username, password },
    { headers: { 'Content-Type': 'application/json' } }
  );
  return data.token;
}

async function fetchAllTransactions(host, port, token, syncFrom, syncTo) {
  const records = [];
  let page = 1;

  while (true) {
    console.log('[ZKBio] fetching:', `http://${host}:${port}/iclock/api/transactions/`, { start_time: syncFrom, end_time: syncTo, page, page_size: 500 });
    const syncFromEncoded = syncFrom.replace(/ /g, '+');
    const syncToEncoded = syncTo.replace(/ /g, '+');
    const url = `http://${host}:${port}/iclock/api/transactions/?start_time=${syncFromEncoded}&end_time=${syncToEncoded}&page=${page}&page_size=500`;

    console.log('[ZKBio] final URL:', url);

    const { data } = await axios.get(url, {
      headers: {
        Authorization: `JWT ${token}`,
        'Content-Type': 'application/json',
      },
    });
    console.log('[ZKBio] page:', page);
    console.log('[ZKBio] count:', data.count);
    console.log('[ZKBio] data length:', (data.data || []).length);
    console.log('[ZKBio] raw response keys:', Object.keys(data));
    console.log('[ZKBio] full response:', JSON.stringify(data).substring(0, 500));
    records.push(...(data.data || []));
    if (!data.next) break;
    page++;
  }

  return records;
}

// Returns true if a punch with the same employee, same state, and within 30 seconds already exists.
async function isNearDuplicate(empId, punchState, punchTimeIso) {
  if (!empId) return false;
  const { rows } = await db.query(
    `SELECT id FROM attendance_raw
     WHERE employee_id = $1
       AND punch_state  = $2
       AND ABS(EXTRACT(EPOCH FROM (punch_time - $3::timestamptz))) <= 30
     LIMIT 1`,
    [empId, punchState, punchTimeIso]
  );
  return rows.length > 0;
}

// ── Batch employee lookup (no N+1) ───────────────────────────────────────────

async function loadEmployeeMap() {
  // Returns Map<zk_employee_id, { id, working_days: number[] | null }>
  const { rows } = await db.query(`
    SELECT e.id, e.zk_employee_id, s.working_days
    FROM employees e
    LEFT JOIN schedules s ON s.id = e.schedule_id
    WHERE e.is_active = TRUE AND e.zk_employee_id IS NOT NULL AND e.zk_employee_id <> ''
  `);
  const map = new Map();
  for (const row of rows) {
    map.set(row.zk_employee_id, {
      id:          row.id,
      workingDays: row.working_days || null,
    });
  }
  return map;
}

// ── Main sync function ────────────────────────────────────────────────────────

async function runSync(trigger = 'CRON') {
  // 1. Create sync_log with RUNNING status.
  const logRes = await db.query(
    `INSERT INTO sync_logs (status, trigger, sync_from, sync_to)
     VALUES ('RUNNING', $1, NULL, NULL)
     RETURNING id`,
    [trigger]
  );
  const logId = logRes.rows[0].id;

  let recordsFetched  = 0;
  let recordsInserted = 0;
  let recordsSkipped  = 0;

  try {
    // 2. Resolve credentials.
    const { host, port, username, password } = await resolveCredentials();

    // 3. Authenticate.
    const token = await zkAuth(host, port, username, password);

    // 4. Determine sync window.
    const settings       = await getAllSettings();
    const lookbackDays   = parseInt(settings.sync_lookback_days || '3', 10);
    const now            = new Date();
    const syncFromDate   = new Date(now);
    syncFromDate.setDate(syncFromDate.getDate() - lookbackDays);
    syncFromDate.setHours(0, 0, 0, 0);

    const syncFrom = fmtZk(syncFromDate);
    const syncTo   = fmtZk(now);

    await db.query(
      'UPDATE sync_logs SET sync_from = $1, sync_to = $2 WHERE id = $3',
      [syncFromDate.toISOString(), now.toISOString(), logId]
    );

    // 5. Fetch all pages.
    const transactions = await fetchAllTransactions(host, port, token, syncFrom, syncTo);
    recordsFetched = transactions.length;

    // 6. Batch-load employees with their schedules (avoid N+1).
    const employeeMap = await loadEmployeeMap();

    // 7. Insert each record.
    for (const tx of transactions) {
      const emp       = employeeMap.get(tx.emp_code) || null;
      const empId     = emp?.id || null;

      let isOffDay = false;
      if (emp?.workingDays && emp.workingDays.length > 0 && tx.punch_time) {
        const punchDate  = new Date(toUtcTimestamp(tx.punch_time));
        const ourWeekday = jsToOurWeekday(punchDate.getUTCDay());
        isOffDay = !emp.workingDays.map(Number).includes(ourWeekday);
      }

      const uploadTime  = tx.upload_time ? toUtcTimestamp(tx.upload_time) : null;
      const punchTimeIso = toUtcTimestamp(tx.punch_time);
      const punchState  = tx.punch_state != null ? String(tx.punch_state) : null;

      // Skip near-duplicate punches (same employee, same state, within 30 seconds).
      if (await isNearDuplicate(empId, punchState, punchTimeIso)) {
        recordsSkipped++;
        continue;
      }

      const result = await db.query(
        `INSERT INTO attendance_raw
           (zk_transaction_id, zk_emp_code, employee_id, punch_time, punch_state,
            verify_type, terminal_sn, terminal_alias, upload_time, is_off_day_punch)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (zk_transaction_id) DO NOTHING`,
        [
          tx.id,
          tx.emp_code,
          empId,
          punchTimeIso,
          punchState,
          tx.verify_type   != null ? Number(tx.verify_type) : null,
          tx.terminal_sn   || null,
          tx.terminal_alias || null,
          uploadTime,
          isOffDay,
        ]
      );

      if (result.rowCount > 0) {
        recordsInserted++;
      } else {
        recordsSkipped++;
      }
    }

    // 8. Backfill employee_id for previously unmatched records.
    await db.query(`
      UPDATE attendance_raw ar
      SET employee_id = e.id
      FROM employees e
      WHERE e.zk_employee_id = ar.zk_emp_code
        AND ar.employee_id IS NULL
        AND e.is_active = true
    `);

    // 9. Mark SUCCESS.
    await db.query(
      `UPDATE sync_logs
       SET status='SUCCESS', completed_at=NOW(),
           records_fetched=$1, records_inserted=$2, records_skipped=$3
       WHERE id=$4`,
      [recordsFetched, recordsInserted, recordsSkipped, logId]
    );

    console.log(`[zkSync] ${trigger} complete — fetched:${recordsFetched} inserted:${recordsInserted} skipped:${recordsSkipped}`);

    // Auto-process attendance after each successful sync.
    processAttendance().catch(err =>
      console.error('[attendanceProcessor] post-sync error:', err.message)
    );

    return { records_fetched: recordsFetched, records_inserted: recordsInserted, records_skipped: recordsSkipped, sync_log_id: logId };

  } catch (err) {
    // Never crash the process — log and mark FAILED.
    console.error('[zkSync] FAILED:', err.message);
    await db.query(
      `UPDATE sync_logs
       SET status='FAILED', completed_at=NOW(),
           records_fetched=$1, records_inserted=$2, records_skipped=$3, error_message=$4
       WHERE id=$5`,
      [recordsFetched, recordsInserted, recordsSkipped, err.message, logId]
    );
    throw err;
  }
}

// ── Historical sync (background) ─────────────────────────────────────────────

async function runHistoricalSync(fromDate) {
  // Create the log entry synchronously so the caller gets an ID immediately,
  // then fire the actual work in the background.
  const logRes = await db.query(
    `INSERT INTO sync_logs (status, trigger, sync_from, sync_to)
     VALUES ('RUNNING', 'HISTORICAL', NULL, NULL)
     RETURNING id`
  );
  const logId = logRes.rows[0].id;

  _doHistoricalSync(logId, fromDate).catch(err =>
    console.error('[zkSync] historical background error:', err.message)
  );

  return logId;
}

async function _doHistoricalSync(logId, fromDate) {
  let recordsFetched = 0, recordsInserted = 0, recordsSkipped = 0;
  try {
    const { host, port, username, password } = await resolveCredentials();
    const token = await zkAuth(host, port, username, password);

    // Build sync window: fromDate (local midnight) → now.
    const syncFromDate = new Date(fromDate + 'T00:00:00');
    const now          = new Date();
    const syncFrom     = fmtZk(syncFromDate);
    const syncTo       = fmtZk(now);

    await db.query(
      'UPDATE sync_logs SET sync_from = $1, sync_to = $2 WHERE id = $3',
      [syncFromDate.toISOString(), now.toISOString(), logId]
    );

    const transactions = await fetchAllTransactions(host, port, token, syncFrom, syncTo);
    recordsFetched = transactions.length;

    const employeeMap = await loadEmployeeMap();

    for (const tx of transactions) {
      const emp    = employeeMap.get(tx.emp_code) || null;
      const empId  = emp?.id || null;
      let isOffDay = false;
      if (emp?.workingDays && emp.workingDays.length > 0 && tx.punch_time) {
        const punchDate  = new Date(toUtcTimestamp(tx.punch_time));
        const ourWeekday = jsToOurWeekday(punchDate.getUTCDay());
        isOffDay = !emp.workingDays.map(Number).includes(ourWeekday);
      }
      const punchTimeIso2 = toUtcTimestamp(tx.punch_time);
      const punchState2   = tx.punch_state != null ? String(tx.punch_state) : null;

      if (await isNearDuplicate(empId, punchState2, punchTimeIso2)) {
        recordsSkipped++;
        continue;
      }

      const result = await db.query(
        `INSERT INTO attendance_raw
           (zk_transaction_id, zk_emp_code, employee_id, punch_time, punch_state,
            verify_type, terminal_sn, terminal_alias, upload_time, is_off_day_punch)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (zk_transaction_id) DO NOTHING`,
        [
          tx.id, tx.emp_code, empId, punchTimeIso2,
          punchState2,
          tx.verify_type  != null ? Number(tx.verify_type) : null,
          tx.terminal_sn  || null, tx.terminal_alias || null,
          tx.upload_time ? toUtcTimestamp(tx.upload_time) : null,
          isOffDay,
        ]
      );
      if (result.rowCount > 0) recordsInserted++; else recordsSkipped++;
    }

    // Backfill unmatched employee_ids.
    await db.query(`
      UPDATE attendance_raw ar
      SET employee_id = e.id
      FROM employees e
      WHERE e.zk_employee_id = ar.zk_emp_code
        AND ar.employee_id IS NULL
        AND e.is_active = true
    `);

    await db.query(
      `UPDATE sync_logs
       SET status='SUCCESS', completed_at=NOW(),
           records_fetched=$1, records_inserted=$2, records_skipped=$3
       WHERE id=$4`,
      [recordsFetched, recordsInserted, recordsSkipped, logId]
    );
    console.log(`[zkSync] HISTORICAL complete — fetched:${recordsFetched} inserted:${recordsInserted} skipped:${recordsSkipped}`);

    // Process attendance for the full historical range.
    processAttendance({ dateFrom: fromDate, dateTo: new Date() }).catch(err =>
      console.error('[attendanceProcessor] post-historical error:', err.message)
    );

  } catch (err) {
    console.error('[zkSync] HISTORICAL FAILED:', err.message);
    await db.query(
      `UPDATE sync_logs
       SET status='FAILED', completed_at=NOW(),
           records_fetched=$1, records_inserted=$2, records_skipped=$3, error_message=$4
       WHERE id=$5`,
      [recordsFetched, recordsInserted, recordsSkipped, err.message, logId]
    );
  }
}

module.exports = { runSync, runHistoricalSync };
