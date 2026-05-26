const db = require('../config/db');
const { runSync, runHistoricalSync } = require('../services/zkSyncService');

const PUNCH_STATE_LABELS = {
  '0': 'Check-In',
  '1': 'Check-Out',
  '2': 'Break-Out',
  '3': 'Break-In',
  '4': 'OT-In',
  '5': 'OT-Out',
};

function punchStateLabel(state) {
  return PUNCH_STATE_LABELS[String(state)] || 'Unknown';
}

// ── GET /api/attendance/raw ───────────────────────────────────────────────────
async function getRaw(req, res) {
  try {
    const page      = Math.max(1, parseInt(req.query.page     || '1',  10));
    const pageSize  = Math.min(5000, Math.max(1, parseInt(req.query.page_size || '50', 10)));
    const offset    = (page - 1) * pageSize;

    const conditions = [];
    const params     = [];

    if (req.query.employee_id) {
      params.push(req.query.employee_id);
      conditions.push(`ar.employee_id = $${params.length}`);
    }
    if (req.query.date_from) {
      params.push(req.query.date_from);
      conditions.push(`ar.punch_time >= $${params.length}`);
    }
    if (req.query.date_to) {
      params.push(req.query.date_to + ' 23:59:59');
      conditions.push(`ar.punch_time <= $${params.length}`);
    }
    if (req.query.unmatched === 'true') {
      conditions.push('ar.employee_id IS NULL');
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [dataRes, countRes] = await Promise.all([
      db.query(
        `SELECT ar.id, ar.zk_transaction_id, ar.zk_emp_code, ar.employee_id,
                e.name AS employee_name,
                ar.punch_time, ar.punch_state, ar.verify_type,
                ar.terminal_sn, ar.terminal_alias, ar.upload_time,
                ar.is_off_day_punch, ar.synced_at
         FROM attendance_raw ar
         LEFT JOIN employees e ON e.id = ar.employee_id
         ${where}
         ORDER BY ar.punch_time DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset]
      ),
      db.query(
        `SELECT COUNT(*) FROM attendance_raw ar ${where}`,
        params
      ),
    ]);

    const total      = Number(countRes.rows[0].count);
    const totalPages = Math.ceil(total / pageSize);

    const data = dataRes.rows.map(r => ({
      ...r,
      punch_state_label: punchStateLabel(r.punch_state),
    }));

    res.json({
      data,
      pagination: { total, page, page_size: pageSize, total_pages: totalPages },
    });
  } catch (err) {
    console.error('[attendance] getRaw error:', err.message);
    res.status(500).json({ message: 'Failed to fetch attendance records' });
  }
}

// ── POST /api/attendance/sync ─────────────────────────────────────────────────
async function syncNow(req, res) {
  try {
    const result = await runSync('MANUAL');
    res.json({
      message:          'Sync completed',
      records_fetched:  result.records_fetched,
      records_inserted: result.records_inserted,
      records_skipped:  result.records_skipped,
      sync_log_id:      result.sync_log_id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

// ── GET /api/attendance/sync/status ──────────────────────────────────────────
async function getSyncStatus(req, res) {
  try {
    const { rows: logRows } = await db.query(`
      SELECT id, started_at, completed_at, status, trigger,
             records_fetched, records_inserted, records_skipped,
             error_message, sync_from, sync_to
      FROM sync_logs
      ORDER BY started_at DESC
      LIMIT 1
    `);

    const { rows: settingRows } = await db.query(
      "SELECT value FROM system_settings WHERE key = 'sync_interval_minutes'"
    );
    const intervalMinutes = parseInt(settingRows[0]?.value || '30', 10);

    const lastSync = logRows[0] || null;
    let nextSyncInMinutes = null;

    if (lastSync?.completed_at) {
      const elapsedMin = (Date.now() - new Date(lastSync.completed_at).getTime()) / 60_000;
      nextSyncInMinutes = Math.max(0, Math.round(intervalMinutes - elapsedMin));
    } else if (!lastSync || lastSync.status !== 'RUNNING') {
      nextSyncInMinutes = 0;
    }

    res.json({ last_sync: lastSync, next_sync_in_minutes: nextSyncInMinutes });
  } catch (err) {
    console.error('[attendance] getSyncStatus error:', err.message);
    res.status(500).json({ message: 'Failed to fetch sync status' });
  }
}

// ── GET /api/attendance/sync/logs ────────────────────────────────────────────
async function getSyncLogs(req, res) {
  try {
    const { rows } = await db.query(`
      SELECT id, started_at, completed_at, status, trigger,
             records_fetched, records_inserted, records_skipped,
             error_message, sync_from, sync_to
      FROM sync_logs
      ORDER BY started_at DESC
      LIMIT 20
    `);
    res.json({ data: rows });
  } catch (err) {
    console.error('[attendance] getSyncLogs error:', err.message);
    res.status(500).json({ message: 'Failed to fetch sync logs' });
  }
}

// ── POST /api/attendance/sync/historical ─────────────────────────────────────
async function historicalSync(req, res) {
  try {
    const { from_date } = req.body;
    if (!from_date)
      return res.status(400).json({ message: 'from_date is required (YYYY-MM-DD)' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from_date))
      return res.status(400).json({ message: 'from_date must be in YYYY-MM-DD format' });
    const syncLogId = await runHistoricalSync(from_date);
    res.json({ message: 'Historical sync started', sync_log_id: syncLogId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = { getRaw, syncNow, getSyncStatus, getSyncLogs, historicalSync };
