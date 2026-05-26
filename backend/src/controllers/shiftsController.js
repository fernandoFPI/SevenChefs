const svc = require('../services/shiftsService');

async function list(req, res) {
  try {
    return res.json(await svc.list());
  } catch (err) {
    console.error('shifts list:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function getById(req, res) {
  try {
    const shift = await svc.getById(req.params.id);
    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    return res.json(shift);
  } catch (err) {
    console.error('shifts getById:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const { name, shift_type, shift_start, shift_end, std_hours_per_day, description } = req.body;
    const type = shift_type || 'FIXED';
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (type === 'FIXED') {
      if (!shift_start) errors.shift_start = 'Shift start time is required';
      if (!shift_end)   errors.shift_end   = 'Shift end time is required';
    } else {
      if (!std_hours_per_day || Number(std_hours_per_day) <= 0)
        errors.std_hours_per_day = 'Standard hours per day is required';
    }
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed', errors });
    return res.status(201).json(await svc.create({ name, shift_type: type, shift_start, shift_end, std_hours_per_day, description }));
  } catch (err) {
    console.error('shifts create:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const { name, shift_type, shift_start, shift_end, std_hours_per_day, description, is_active } = req.body;
    const type = shift_type || 'FIXED';
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (type === 'FIXED') {
      if (!shift_start) errors.shift_start = 'Shift start time is required';
      if (!shift_end)   errors.shift_end   = 'Shift end time is required';
    } else {
      if (!std_hours_per_day || Number(std_hours_per_day) <= 0)
        errors.std_hours_per_day = 'Standard hours per day is required';
    }
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed', errors });
    const shift = await svc.update(req.params.id, { name, shift_type: type, shift_start, shift_end, std_hours_per_day, description, is_active });
    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    return res.json(shift);
  } catch (err) {
    console.error('shifts update:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function deactivate(req, res) {
  try {
    const shift = await svc.deactivate(req.params.id);
    if (!shift) return res.status(404).json({ message: 'Shift not found' });
    return res.json(shift);
  } catch (err) {
    console.error('shifts deactivate:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { list, getById, create, update, deactivate };
