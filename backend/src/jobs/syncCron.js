const cron = require('node-cron');
const db   = require('../config/db');
const { runSync } = require('../services/zkSyncService');

const STUCK_THRESHOLD_MINUTES = 10;

async function getIntervalMinutes() {
  const { rows } = await db.query(
    "SELECT value FROM system_settings WHERE key = 'sync_interval_minutes'"
  );
  return parseInt(rows[0]?.value || '30', 10);
}

async function fixStuckLogs() {
  // Mark any RUNNING log older than STUCK_THRESHOLD_MINUTES as FAILED.
  await db.query(`
    UPDATE sync_logs
    SET status = 'FAILED',
        completed_at = NOW(),
        error_message = 'Sync timed out (marked FAILED by cron watchdog)'
    WHERE status = 'RUNNING'
      AND started_at < NOW() - INTERVAL '${STUCK_THRESHOLD_MINUTES} minutes'
  `);
}

async function getLastCompletedSync() {
  const { rows } = await db.query(`
    SELECT completed_at FROM sync_logs
    WHERE status IN ('SUCCESS', 'FAILED')
    ORDER BY completed_at DESC
    LIMIT 1
  `);
  return rows[0]?.completed_at || null;
}

async function isRunning() {
  const { rows } = await db.query(`
    SELECT id FROM sync_logs
    WHERE status = 'RUNNING'
      AND started_at >= NOW() - INTERVAL '${STUCK_THRESHOLD_MINUTES} minutes'
    LIMIT 1
  `);
  return rows.length > 0;
}

async function tick() {
  try {
    // 1. Fix any stuck syncs first.
    await fixStuckLogs();

    // 2. Skip if a sync is currently running (started < 10 min ago).
    if (await isRunning()) return;

    // 3. Check if enough time has passed since last completed sync.
    const intervalMinutes  = await getIntervalMinutes();
    const lastCompleted    = await getLastCompletedSync();

    if (lastCompleted) {
      const elapsedMs  = Date.now() - new Date(lastCompleted).getTime();
      const elapsedMin = elapsedMs / 60_000;
      if (elapsedMin < intervalMinutes) return;
    }

    // 4. Run sync.
    console.log('[CRON] Sync started');
    const result = await runSync('CRON');
    console.log('[CRON] Sync complete —', result);

  } catch (err) {
    // runSync already logged and marked FAILED — just swallow here.
    console.error('[CRON] Sync error swallowed:', err.message);
  }
}

function start() {
  cron.schedule('* * * * *', tick);
  console.log('[CRON] syncCron started — checking every minute');
}

module.exports = { start };
