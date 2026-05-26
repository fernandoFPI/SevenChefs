const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const { getMonthlyReport, exportMonthlyReport } = require('../controllers/reportsController');

router.get('/',       requireAuth, requireRole('ADMIN', 'ACCOUNTANT', 'MANAGER'), getMonthlyReport);
router.get('/export', requireAuth, requireRole('ADMIN', 'ACCOUNTANT', 'MANAGER'), exportMonthlyReport);

module.exports = router;
