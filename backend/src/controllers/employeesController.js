const svc = require('../services/employeesService');

async function nextCode(req, res) {
  try {
    return res.json({ code: await svc.nextCode() });
  } catch (err) {
    console.error('employees nextCode:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function list(req, res) {
  try {
    return res.json(await svc.list(req.query));
  } catch (err) {
    console.error('employees list:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function getById(req, res) {
  try {
    const emp = await svc.getById(req.params.id);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    return res.json(emp);
  } catch (err) {
    console.error('employees getById:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const { name, employee_code, monthly_salary, shift_id, schedule_id, username, role, currency } = req.body;
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (name && name.length > 150) errors.name = 'Name must be 150 characters or less';
    if (!employee_code) errors.employee_code = 'Employee code is required';
    if (monthly_salary === undefined || monthly_salary === null || monthly_salary === '')
      errors.monthly_salary = 'Monthly salary is required';
    if (Number(monthly_salary) < 0) errors.monthly_salary = 'Monthly salary must be 0 or greater';
    if (!username) errors.username = 'Username is required';
    if (!role) errors.role = 'Role is required';
    if (role && !['ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE'].includes(role))
      errors.role = 'Invalid role';
    if (currency && !['IQD', 'USD'].includes(currency))
      errors.currency = 'Currency must be IQD or USD';
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed', errors });

    const emp = await svc.create(req.body);
    return res.status(201).json(emp);
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({ message: err.message, errors: { [err.field]: err.message } });
    }
    console.error('employees create:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const { name, employee_code, monthly_salary, shift_id, schedule_id, username, role, currency } = req.body;
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (name && name.length > 150) errors.name = 'Name must be 150 characters or less';
    if (!employee_code) errors.employee_code = 'Employee code is required';
    if (monthly_salary === undefined || monthly_salary === null || monthly_salary === '')
      errors.monthly_salary = 'Monthly salary is required';
    if (Number(monthly_salary) < 0) errors.monthly_salary = 'Monthly salary must be 0 or greater';
    if (role && !['ADMIN', 'MANAGER', 'ACCOUNTANT', 'EMPLOYEE'].includes(role))
      errors.role = 'Invalid role';
    if (currency && !['IQD', 'USD'].includes(currency))
      errors.currency = 'Currency must be IQD or USD';
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed', errors });

    const emp = await svc.update(req.params.id, req.body);
    return res.json(emp);
  } catch (err) {
    if (err.status === 409)
      return res.status(409).json({ message: err.message, errors: { [err.field]: err.message } });
    if (err.status === 404) return res.status(404).json({ message: err.message });
    console.error('employees update:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function deactivate(req, res) {
  try {
    const emp = await svc.deactivate(req.params.id);
    return res.json(emp);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ message: err.message });
    console.error('employees deactivate:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// GET /api/employees/me/attendance?month=YYYY-MM
async function myAttendance(req, res) {
  try {
    const userId = req.user.id;
    const { rows: empRows } = await require('../config/db').query(
      `SELECT e.id FROM employees e
       JOIN users u ON u.employee_id = e.id
       WHERE u.id = $1`,
      [userId]
    );
    if (!empRows.length) return res.status(404).json({ message: 'Employee record not found' });
    const employeeId = empRows[0].id;

    const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
    const [y, m]   = monthStr.split('-').map(Number);
    const monthStart = `${monthStr}-01`;
    const monthEnd   = `${monthStr}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;

    const { rows } = await require('../config/db').query(
      `SELECT ad.*
       FROM attendance_daily ad
       WHERE ad.employee_id = $1 AND ad.date >= $2 AND ad.date <= $3
       ORDER BY ad.date ASC`,
      [employeeId, monthStart, monthEnd]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error('employees myAttendance:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { nextCode, list, getById, create, update, deactivate, myAttendance };
