const express = require('express');
const router  = express.Router();
const { requireAuth }  = require('../middleware/auth');
const { requireRole }  = require('../middleware/roleGuard');
const ctrl = require('../controllers/attendanceDailyController');

const VIEW  = ['ADMIN', 'ACCOUNTANT', 'MANAGER'];
const EDIT  = ['ADMIN', 'ACCOUNTANT'];

// recalculate MUST be registered before /:id to avoid route collision
router.post('/recalculate', requireAuth, requireRole(...EDIT), ctrl.recalculate);
router.get('/',             requireAuth, requireRole(...VIEW), ctrl.getDaily);
router.put('/:id',          requireAuth, requireRole(...VIEW), ctrl.updateDaily);

module.exports = router;
