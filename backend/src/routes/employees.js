const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/employeesController');

const guard = [requireAuth, requireRole('ADMIN', 'ACCOUNTANT')];

// Static routes MUST be before /:id to avoid route collision
router.get('/next-code',      ...guard, ctrl.nextCode);
router.get('/me/attendance',  requireAuth, requireRole('EMPLOYEE'), ctrl.myAttendance);
router.get('/', ...guard, ctrl.list);
router.get('/:id', ...guard, ctrl.getById);
router.post('/', ...guard, ctrl.create);
router.put('/:id', ...guard, ctrl.update);
router.delete('/:id', ...guard, ctrl.deactivate);

module.exports = router;
