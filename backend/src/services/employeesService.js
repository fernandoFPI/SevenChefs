const bcrypt = require('bcrypt');
const db = require('../config/db');

async function nextCode() {
  const { rows } = await db.query(
    "SELECT MAX(employee_code) AS max_code FROM employees WHERE employee_code LIKE 'EMP-%'"
  );
  const max = rows[0]?.max_code;
  if (!max) return 'EMP-0001';
  const num = parseInt(max.replace('EMP-', ''), 10);
  return `EMP-${String(num + 1).padStart(4, '0')}`;
}

async function list(filters = {}) {
  let sql = `
    SELECT e.*, s.name AS shift_name, sc.name AS schedule_name,
           s2.name AS secondary_shift_name
    FROM employees e
    LEFT JOIN shifts s  ON e.shift_id = s.id
    LEFT JOIN shifts s2 ON e.secondary_shift_id = s2.id
    LEFT JOIN schedules sc ON e.schedule_id = sc.id
  `;
  const params = [];
  if (filters.is_active !== undefined) {
    params.push(filters.is_active === 'true' || filters.is_active === true);
    sql += ` WHERE e.is_active = $1`;
  }
  sql += ' ORDER BY e.created_at DESC';
  const { rows } = await db.query(sql, params);
  return rows;
}

async function getById(id) {
  const { rows } = await db.query(
    `SELECT e.*,
            s.name  AS shift_name,  s.std_hours_per_day AS shift_hours,
            s2.name AS secondary_shift_name, s2.std_hours_per_day AS secondary_shift_hours,
            sc.name AS schedule_name, sc.working_days AS schedule_working_days,
            u.id AS user_id, u.username, u.role AS user_role, u.password_changed
     FROM employees e
     LEFT JOIN shifts s  ON e.shift_id           = s.id
     LEFT JOIN shifts s2 ON e.secondary_shift_id = s2.id
     LEFT JOIN schedules sc ON e.schedule_id = sc.id
     LEFT JOIN users u ON u.employee_id = e.id
     WHERE e.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create(data) {
  const {
    employee_code, name, monthly_salary, shift_id, schedule_id,
    secondary_shift_id, zk_employee_id, username, role, currency = 'IQD',
  } = data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: uRows } = await client.query(
      'SELECT id FROM users WHERE username = $1', [username]
    );
    if (uRows.length) {
      const err = new Error('Username already taken');
      err.status = 409; err.field = 'username';
      throw err;
    }

    const { rows: cRows } = await client.query(
      'SELECT id FROM employees WHERE employee_code = $1', [employee_code]
    );
    if (cRows.length) {
      const err = new Error('Employee code already taken');
      err.status = 409; err.field = 'employee_code';
      throw err;
    }

    const { rows: empRows } = await client.query(
      `INSERT INTO employees (employee_code, name, monthly_salary, shift_id, secondary_shift_id, schedule_id, zk_employee_id, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [employee_code, name, monthly_salary, shift_id || null, secondary_shift_id || null, schedule_id || null, zk_employee_id || null, currency]
    );
    const employee = empRows[0];

    const passwordHash = await bcrypt.hash(employee_code, 12);
    await client.query(
      `INSERT INTO users (username, password_hash, role, employee_id, password_changed)
       VALUES ($1, $2, $3, $4, false)`,
      [username, passwordHash, role, employee.id]
    );

    await client.query('COMMIT');
    return employee;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function update(id, data) {
  const {
    employee_code, name, monthly_salary, shift_id, secondary_shift_id, schedule_id,
    zk_employee_id, username, role, currency,
  } = data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: cur } = await client.query(
      'SELECT * FROM employees WHERE id = $1', [id]
    );
    if (!cur.length) {
      const err = new Error('Employee not found'); err.status = 404; throw err;
    }

    if (employee_code !== cur[0].employee_code) {
      const { rows: dup } = await client.query(
        'SELECT id FROM employees WHERE employee_code = $1 AND id != $2',
        [employee_code, id]
      );
      if (dup.length) {
        const err = new Error('Employee code already taken');
        err.status = 409; err.field = 'employee_code'; throw err;
      }
    }

    const { rows: empRows } = await client.query(
      `UPDATE employees
       SET employee_code = $1, name = $2, monthly_salary = $3,
           shift_id = $4, secondary_shift_id = $5, schedule_id = $6,
           zk_employee_id = $7, currency = $8, updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [employee_code, name, monthly_salary, shift_id || null, secondary_shift_id || null, schedule_id || null, zk_employee_id || null, currency || 'IQD', id]
    );

    const { rows: uRows } = await client.query(
      'SELECT * FROM users WHERE employee_id = $1', [id]
    );
    if (uRows.length && (username !== undefined || role !== undefined)) {
      const currentUser = uRows[0];
      const newUsername = username ?? currentUser.username;
      const newRole = role ?? currentUser.role;
      if (newUsername !== currentUser.username) {
        const { rows: dupU } = await client.query(
          'SELECT id FROM users WHERE username = $1 AND id != $2',
          [newUsername, currentUser.id]
        );
        if (dupU.length) {
          const err = new Error('Username already taken');
          err.status = 409; err.field = 'username'; throw err;
        }
      }
      await client.query(
        'UPDATE users SET username = $1, role = $2, updated_at = NOW() WHERE id = $3',
        [newUsername, newRole, currentUser.id]
      );
    }

    await client.query('COMMIT');
    return empRows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deactivate(id) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE employees SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    if (!rows.length) {
      const err = new Error('Employee not found'); err.status = 404; throw err;
    }
    await client.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE employee_id = $1',
      [id]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { nextCode, list, getById, create, update, deactivate };
