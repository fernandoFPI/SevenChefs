const cron = require('node-cron');
const { query } = require('../config/db');
const { notifyEmployeeOfAutoReject } = require('../services/notificationService');

async function getSetting(key) {
  const { rows } = await query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

async function runAutoReject() {
  try {
    const autoRejectEnabled = await getSetting('auto_reject_enabled');
    if (autoRejectEnabled !== 'true') return;

    const { rows: expired } = await query(
      `UPDATE requests
       SET status = 'AUTO_REJECTED', updated_at = NOW()
       WHERE status IN ('PENDING_MANAGER', 'PENDING_ADMIN')
         AND auto_reject_at <= NOW()
       RETURNING id, type, attendance_date, employee_id`,
      []
    );

    if (expired.length === 0) return;

    for (const req of expired) {
      const { rows } = await query(
        `SELECT u.id AS user_id FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
        [req.employee_id]
      );
      if (rows.length > 0) {
        await notifyEmployeeOfAutoReject(req, rows[0].user_id);
      }
    }

    console.log(`[autoRejectCron] Auto-rejected ${expired.length} expired request(s)`);
  } catch (err) {
    console.error('[autoRejectCron] error:', err.message);
  }
}

function start() {
  cron.schedule('*/5 * * * *', runAutoReject);
  console.log('[autoRejectCron] started — checking every 5 minutes');
}

module.exports = { start };
