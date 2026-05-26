const cron = require('node-cron');
const { query } = require('../config/db');
const { notifyEmployeeOfAutoReject } = require('../services/notificationService');

async function runAutoReject() {
  try {
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
