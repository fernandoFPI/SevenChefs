const db = require('../config/db');

function computeStdHours(shift_start, shift_end) {
  if (!shift_start || !shift_end) return null;
  const [sh, sm] = shift_start.split(':').map(Number);
  const [eh, em] = shift_end.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins   = eh * 60 + em;
  const duration  = endMins > startMins ? endMins - startMins : (24 * 60 - startMins) + endMins;
  return Math.round((duration / 60) * 100) / 100;
}

async function list() {
  const { rows } = await db.query(
    'SELECT * FROM shifts ORDER BY created_at DESC'
  );
  return rows;
}

async function getById(id) {
  const { rows } = await db.query('SELECT * FROM shifts WHERE id = $1', [id]);
  return rows[0] || null;
}

async function create({ name, shift_type, shift_start, shift_end, std_hours_per_day: explicitHours, description }) {
  const type = shift_type || 'FIXED';
  const std_hours_per_day = type === 'DURATION'
    ? (parseFloat(explicitHours) || null)
    : computeStdHours(shift_start, shift_end);
  const { rows } = await db.query(
    `INSERT INTO shifts (name, shift_type, std_hours_per_day, shift_start, shift_end, description)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, type, std_hours_per_day, shift_start || null, shift_end || null, description || null]
  );
  return rows[0];
}

async function update(id, { name, shift_type, shift_start, shift_end, std_hours_per_day: explicitHours, description, is_active }) {
  const type = shift_type || 'FIXED';
  const std_hours_per_day = type === 'DURATION'
    ? (parseFloat(explicitHours) || null)
    : computeStdHours(shift_start, shift_end);
  const { rows } = await db.query(
    `UPDATE shifts
     SET name = $1, shift_type = $2, std_hours_per_day = $3,
         shift_start = $4, shift_end = $5,
         description = $6, is_active = COALESCE($7, is_active), updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [name, type, std_hours_per_day, shift_start || null, shift_end || null, description || null, is_active, id]
  );
  return rows[0] || null;
}

async function deactivate(id) {
  const { rows } = await db.query(
    'UPDATE shifts SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0] || null;
}

module.exports = { list, getById, create, update, deactivate };
