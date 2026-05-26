const db = require('../config/db');

// GET /api/shift-swaps?month=YYYY-MM&employee_id=X
async function list(req, res) {
  try {
    const { month, employee_id } = req.query;

    const conditions = [];
    const params = [];

    if (month) {
      params.push(`${month}-01`);
      params.push(`${month}-31`);
      conditions.push(`ss.cover_date BETWEEN $${params.length - 1} AND $${params.length}`);
    }
    if (employee_id) {
      params.push(employee_id);
      conditions.push(`(ss.covering_employee_id = $${params.length} OR ss.covered_employee_id = $${params.length})`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(
      `SELECT ss.*,
              ce.name AS covering_employee_name, ce.employee_code AS covering_employee_code,
              ve.name AS covered_employee_name,  ve.employee_code AS covered_employee_code,
              cu.username AS created_by_username
       FROM shift_swaps ss
       JOIN employees ce ON ce.id = ss.covering_employee_id
       LEFT JOIN employees ve ON ve.id = ss.covered_employee_id
       LEFT JOIN users cu ON cu.id = ss.created_by
       ${where}
       ORDER BY ss.cover_date DESC, ss.created_at DESC`,
      params
    );

    res.json({ data: rows });
  } catch (err) {
    console.error('[shiftSwaps] list:', err);
    res.status(500).json({ error: 'Failed to load shift swaps' });
  }
}

// POST /api/shift-swaps
async function create(req, res) {
  try {
    const { id: userId } = req.user;
    const {
      type, covering_employee_id, cover_date,
      covered_employee_id, covered_date, swap_return_date, note,
    } = req.body;

    if (!type || !covering_employee_id || !cover_date) {
      return res.status(400).json({ error: 'type, covering_employee_id, and cover_date are required' });
    }
    if (!['COVER', 'SWAP'].includes(type)) {
      return res.status(400).json({ error: 'type must be COVER or SWAP' });
    }
    if (type === 'SWAP' && !covered_employee_id) {
      return res.status(400).json({ error: 'covered_employee_id is required for SWAP' });
    }

    const { rows } = await db.query(
      `INSERT INTO shift_swaps
         (type, covering_employee_id, cover_date, covered_employee_id, covered_date, swap_return_date, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        type, covering_employee_id, cover_date,
        covered_employee_id || null, covered_date || null,
        swap_return_date || null, note || null, userId,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[shiftSwaps] create:', err);
    res.status(500).json({ error: 'Failed to create shift swap' });
  }
}

// DELETE /api/shift-swaps/:id — cancel
async function cancel(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `UPDATE shift_swaps SET status = 'CANCELLED' WHERE id = $1 AND status = 'ACTIVE' RETURNING *`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Record not found or already cancelled' });
    res.json(rows[0]);
  } catch (err) {
    console.error('[shiftSwaps] cancel:', err);
    res.status(500).json({ error: 'Failed to cancel' });
  }
}

module.exports = { list, create, cancel };
