const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markRead,
} = require('../controllers/notificationsController');

router.use(requireAuth);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.put('/mark-all-read', markAllRead);
router.put('/:id/read', markRead);

module.exports = router;
