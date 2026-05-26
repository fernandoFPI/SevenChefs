const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const ctrl = require('../controllers/usersController');

router.get('/',                requireAuth, requireRole('ADMIN'), ctrl.list);
router.post('/',               requireAuth, requireRole('ADMIN'), ctrl.create);
router.put('/:id',             requireAuth, requireRole('ADMIN'), ctrl.update);
router.put('/:id/toggle-active', requireAuth, requireRole('ADMIN'), ctrl.toggleActive);

module.exports = router;
