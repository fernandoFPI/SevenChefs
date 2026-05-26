const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/shiftSwapsController');

const VIEW_ROLES = ['ADMIN', 'MANAGER', 'ACCOUNTANT'];

router.get('/',    requireAuth, requireRole(...VIEW_ROLES), ctrl.list);
router.post('/',   requireAuth, requireRole('ADMIN', 'MANAGER'), ctrl.create);
router.delete('/:id', requireAuth, requireRole('ADMIN', 'MANAGER'), ctrl.cancel);

module.exports = router;
