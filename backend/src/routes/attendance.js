const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl           = require('../controllers/attendanceController');
const dailyCtrl      = require('../controllers/attendanceDailyController');
const correctionsCtrl = require('../controllers/correctionsController');

const VIEW_ROLES  = ['ADMIN', 'ACCOUNTANT', 'MANAGER'];
const SYNC_ROLES  = ['ADMIN', 'ACCOUNTANT'];

router.get('/raw',                          requireAuth, requireRole(...VIEW_ROLES), ctrl.getRaw);
router.patch('/raw/:id/ignore',             requireAuth, requireRole(...VIEW_ROLES), ctrl.ignorePunch);
router.patch('/raw/:id/restore',            requireAuth, requireRole(...VIEW_ROLES), ctrl.restorePunch);
router.patch('/raw/:id/override-state',     requireAuth, requireRole(...VIEW_ROLES), ctrl.overrideState);
router.post('/sync',       requireAuth, requireRole(...SYNC_ROLES), ctrl.syncNow);
router.get('/sync/status', requireAuth, requireRole(...VIEW_ROLES), ctrl.getSyncStatus);
router.get('/sync/logs',      requireAuth, requireRole(...VIEW_ROLES), ctrl.getSyncLogs);
router.post('/sync/historical', requireAuth, requireRole('ADMIN'), ctrl.historicalSync);

// Punch correction endpoints
router.post('/corrections',                        requireAuth, requireRole('ADMIN', 'ACCOUNTANT'), correctionsCtrl.saveCorrection);
router.get('/corrections/:attendance_daily_id',    requireAuth, requireRole(...VIEW_ROLES),         correctionsCtrl.getCorrection);
router.delete('/corrections/:attendance_daily_id', requireAuth, requireRole('ADMIN'),               correctionsCtrl.removeCorrection);

// Leave endpoints (under /api/attendance/leaves)
router.post('/leaves',   requireAuth, requireRole(...VIEW_ROLES), dailyCtrl.recordLeave);
router.delete('/leaves', requireAuth, requireRole(...VIEW_ROLES), dailyCtrl.removeLeave);

module.exports = router;
