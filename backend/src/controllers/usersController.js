const db     = require('../config/db');
const bcrypt = require('bcrypt');

// GET /api/users
async function list(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.username, u.role, u.is_active, u.password_changed,
              u.employee_id, u.created_at,
              e.name AS employee_name, e.employee_code
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       ORDER BY u.created_at ASC`
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('[users] list:', err.message);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
}

// POST /api/users
async function create(req, res) {
  try {
    const { username, role, password } = req.body;

    if (!username) return res.status(400).json({ message: 'Username is required' });
    if (!role)     return res.status(400).json({ message: 'Role is required' });
    if (!['ADMIN', 'MANAGER', 'ACCOUNTANT'].includes(role))
      return res.status(400).json({ message: 'Role must be ADMIN, MANAGER, or ACCOUNTANT' });
    if (!password || password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters' });

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users (username, password_hash, role, password_changed)
       VALUES ($1, $2, $3, false)
       RETURNING id, username, role, is_active, password_changed, employee_id, created_at`,
      [username.trim(), hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Username already exists' });
    console.error('[users] create:', err.message);
    res.status(500).json({ message: 'Failed to create user' });
  }
}

// PUT /api/users/:id
async function update(req, res) {
  try {
    const { id } = req.params;
    if (id === req.user.id)
      return res.status(400).json({ message: 'Cannot modify your own account' });

    const sets   = ['updated_at = NOW()'];
    const params = [];

    if (req.body.username !== undefined) {
      params.push(req.body.username.trim());
      sets.push(`username = $${params.length}`);
    }
    if (req.body.role !== undefined) {
      if (!['ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE'].includes(req.body.role))
        return res.status(400).json({ message: 'Invalid role' });
      params.push(req.body.role);
      sets.push(`role = $${params.length}`);
    }
    if (req.body.password) {
      if (req.body.password.length < 8)
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      const hash = await bcrypt.hash(req.body.password, 12);
      params.push(hash);
      sets.push(`password_hash = $${params.length}`);
      params.push(false);
      sets.push(`password_changed = $${params.length}`);
    }

    params.push(id);
    const { rows } = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, username, role, is_active, password_changed, employee_id, created_at`,
      params
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Username already exists' });
    console.error('[users] update:', err.message);
    res.status(500).json({ message: 'Failed to update user' });
  }
}

// PUT /api/users/:id/toggle-active
async function toggleActive(req, res) {
  try {
    const { id } = req.params;
    if (id === req.user.id)
      return res.status(400).json({ message: 'Cannot deactivate your own account' });

    const { rows } = await db.query(
      `UPDATE users SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING id, is_active`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json({ is_active: rows[0].is_active });
  } catch (err) {
    console.error('[users] toggleActive:', err.message);
    res.status(500).json({ message: 'Failed to toggle user status' });
  }
}

module.exports = { list, create, update, toggleActive };
