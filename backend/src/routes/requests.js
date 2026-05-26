const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleGuard');
const {
  getRequests,
  createRequest,
  managerAction,
  adminAction,
} = require('../controllers/requestsController');

router.use(requireAuth);

router.get('/', getRequests);
router.post('/', requireRole('EMPLOYEE'), createRequest);
router.put('/:id/manager-action', requireRole('MANAGER'), managerAction);
router.put('/:id/admin-action', requireRole('ADMIN'), adminAction);

module.exports = router;
