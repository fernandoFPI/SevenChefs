const db    = require('../config/db');
const axios = require('axios');

const MASKED = '••••••••';
const ALLOWED_KEYS = new Set([
  'company_name', 'company_logo',
  'zk_host', 'zk_port', 'zk_username', 'zk_password',
  'sync_interval_minutes', 'sync_lookback_days',
  'std_days_per_month', 'ot_multiplier',
  'late_penalty_unapproved', 'late_penalty_approved',
  'ot_calculation_mode',
  'grace_period_enabled', 'grace_period_minutes',
]);

// GET /api/settings
async function getSettings(req, res) {
  try {
    const { rows } = await db.query('SELECT key, value FROM system_settings ORDER BY key');
    const settings = Object.fromEntries(rows.map(r => [r.key, r.key === 'zk_password' ? MASKED : r.value]));
    res.json(settings);
  } catch (err) {
    console.error('[settings] get:', err.message);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
}

// PUT /api/settings
async function updateSettings(req, res) {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.has(key)) continue;
      if (key === 'zk_password' && (value === MASKED || value === '')) continue;
      await db.query(
        `INSERT INTO system_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    const { rows } = await db.query('SELECT key, value FROM system_settings ORDER BY key');
    const settings = Object.fromEntries(rows.map(r => [r.key, r.key === 'zk_password' ? MASKED : r.value]));
    res.json(settings);
  } catch (err) {
    console.error('[settings] update:', err.message);
    res.status(500).json({ message: 'Failed to update settings' });
  }
}

// POST /api/settings/test-connection
async function testConnection(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT key, value FROM system_settings WHERE key IN ('zk_host','zk_port','zk_username','zk_password')`
    );
    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const host     = cfg.zk_host     || '';
    const port     = cfg.zk_port     || '';
    const username = cfg.zk_username || '';
    const password = cfg.zk_password || '';
    if (!host || !port || !username || !password) {
      return res.status(400).json({ success: false, message: 'ZKBio credentials not configured' });
    }
    await axios.post(
      `http://${host}:${port}/jwt-api-token-auth/`,
      { username, password },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    res.json({ success: true });
  } catch (err) {
    const msg = err.response?.data?.non_field_errors?.[0] || err.message || 'Connection failed';
    res.status(400).json({ success: false, message: msg });
  }
}

module.exports = { getSettings, updateSettings, testConnection };
