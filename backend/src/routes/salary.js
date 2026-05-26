const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/salaryController');

// Static routes before :id to avoid param collision
router.post('/calculate',   requireAuth, requireRole('ADMIN', 'ACCOUNTANT'), ctrl.calculate);
router.post('/submit',      requireAuth, requireRole('ADMIN', 'ACCOUNTANT'), ctrl.submit);
router.post('/approve-all', requireAuth, requireRole('ADMIN'),               ctrl.approveAll);
router.get('/export',       requireAuth, requireRole('ADMIN', 'ACCOUNTANT'), ctrl.exportSalary);

router.get('/',             requireAuth, requireRole('ADMIN', 'ACCOUNTANT'), ctrl.list);
router.put('/:id',          requireAuth, requireRole('ADMIN', 'ACCOUNTANT'), ctrl.update);
router.post('/:id/approve', requireAuth, requireRole('ADMIN'),               ctrl.approveOne);
router.post('/:id/reject',  requireAuth, requireRole('ADMIN'),               ctrl.rejectOne);

module.exports = router;
