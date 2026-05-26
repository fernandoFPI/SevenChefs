const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/shiftsController');

const guard = [requireAuth, requireRole('ADMIN', 'ACCOUNTANT')];

router.get('/', ...guard, ctrl.list);
router.get('/:id', ...guard, ctrl.getById);
router.post('/', ...guard, ctrl.create);
router.put('/:id', ...guard, ctrl.update);
router.delete('/:id', ...guard, ctrl.deactivate);

module.exports = router;
