const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/settingsController');

router.get('/request-types',   requireAuth, ctrl.getRequestTypeSettings);
router.get('/',                requireAuth, requireRole('ADMIN'), ctrl.getSettings);
router.put('/',                requireAuth, requireRole('ADMIN'), ctrl.updateSettings);
router.post('/test-connection',requireAuth, requireRole('ADMIN'), ctrl.testConnection);

module.exports = router;
