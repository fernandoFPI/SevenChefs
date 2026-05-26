const svc = require('../services/schedulesService');

async function list(req, res) {
  try {
    return res.json(await svc.list());
  } catch (err) {
    console.error('schedules list:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function getById(req, res) {
  try {
    const schedule = await svc.getById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    return res.json(schedule);
  } catch (err) {
    console.error('schedules getById:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function create(req, res) {
  try {
    const { name, working_days, description } = req.body;
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (!working_days || !Array.isArray(working_days) || working_days.length === 0)
      errors.working_days = 'At least one working day is required';
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed', errors });
    return res.status(201).json(await svc.create({ name, working_days, description }));
  } catch (err) {
    console.error('schedules create:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function update(req, res) {
  try {
    const { name, working_days, description, is_active } = req.body;
    const errors = {};
    if (!name) errors.name = 'Name is required';
    if (!working_days || !Array.isArray(working_days) || working_days.length === 0)
      errors.working_days = 'At least one working day is required';
    if (Object.keys(errors).length) return res.status(400).json({ message: 'Validation failed', errors });
    const schedule = await svc.update(req.params.id, { name, working_days, description, is_active });
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    return res.json(schedule);
  } catch (err) {
    console.error('schedules update:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function deactivate(req, res) {
  try {
    const schedule = await svc.deactivate(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Schedule not found' });
    return res.json(schedule);
  } catch (err) {
    console.error('schedules deactivate:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { list, getById, create, update, deactivate };
