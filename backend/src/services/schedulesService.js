const db = require('../config/db');

async function list() {
  const { rows } = await db.query(
    'SELECT * FROM schedules ORDER BY created_at DESC'
  );
  return rows;
}

async function getById(id) {
  const { rows } = await db.query('SELECT * FROM schedules WHERE id = $1', [id]);
  return rows[0] || null;
}

async function create({ name, working_days, description }) {
  const { rows } = await db.query(
    `INSERT INTO schedules (name, working_days, description)
     VALUES ($1, $2, $3) RETURNING *`,
    [name, working_days, description || null]
  );
  return rows[0];
}

async function update(id, { name, working_days, description, is_active }) {
  const { rows } = await db.query(
    `UPDATE schedules
     SET name = $1, working_days = $2, description = $3,
         is_active = COALESCE($4, is_active), updated_at = NOW()
     WHERE id = $5 RETURNING *`,
    [name, working_days, description || null, is_active, id]
  );
  return rows[0] || null;
}

async function deactivate(id) {
  const { rows } = await db.query(
    'UPDATE schedules SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id]
  );
  return rows[0] || null;
}

module.exports = { list, getById, create, update, deactivate };
