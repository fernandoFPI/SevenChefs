const { query } = require('../config/db');

// GET /api/notifications — last 10 for the current user
async function getNotifications(req, res) {
  try {
    const { id: userId } = req.user;
    const { rows } = await query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('getNotifications error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/notifications/unread-count
async function getUnreadCount(req, res) {
  try {
    const { id: userId } = req.user;
    const { rows } = await query(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/notifications/mark-all-read
async function markAllRead(req, res) {
  try {
    const { id: userId } = req.user;
    await query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('markAllRead error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// PUT /api/notifications/:id/read
async function markRead(req, res) {
  try {
    const { id: userId } = req.user;
    const { id } = req.params;
    await query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('markRead error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { getNotifications, getUnreadCount, markAllRead, markRead };
