const bcrypt = require('bcrypt');
const db = require('../config/db');

async function login(username, password) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE username = $1 AND is_active = true',
    [username]
  );
  const user = rows[0];
  if (!user) return null;

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return null;

  return {
    user,
    requiresPasswordChange: !user.password_changed,
  };
}

async function getUserById(id) {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function changePassword(userId, currentPassword, newPassword) {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user) return null;

  const match = await bcrypt.compare(currentPassword, user.password_hash);
  if (!match) return null;

  const hash = await bcrypt.hash(newPassword, 12);
  await db.query(
    'UPDATE users SET password_hash = $1, password_changed = true, updated_at = NOW() WHERE id = $2',
    [hash, userId]
  );
  return true;
}

module.exports = { login, getUserById, changePassword };
