const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/timeOffController');

const MGMT = ['ADMIN', 'ACCOUNTANT', 'MANAGER'];
const ADMIN_ACCOUNTANT = ['ADMIN', 'ACCOUNTANT'];

router.get('/balance',                            requireAuth, ctrl.getBalance);
router.get('/balances',                           requireAuth, requireRole(...ADMIN_ACCOUNTANT), ctrl.getAllBalances);
router.put('/balances/:employeeId/adjust',        requireAuth, requireRole('ADMIN'), ctrl.adjustBalance);

module.exports = router;
