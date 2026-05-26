const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/backupController');

const adminOnly = [requireAuth, requireRole('ADMIN')];

router.post('/',             ...adminOnly, ctrl.createBackup);
router.get('/',              ...adminOnly, ctrl.listBackups);
router.get('/:id/download',  ...adminOnly, ctrl.downloadBackup);
router.delete('/:id',        ...adminOnly, ctrl.deleteBackup);
router.post('/restore',      ...adminOnly, ctrl.restoreBackup);

module.exports = router;
