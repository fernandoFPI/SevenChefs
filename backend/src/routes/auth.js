const express = require('express');
const router = express.Router();
const { login, logout, me, changePassword } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.post('/login', login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.post('/change-password', requireAuth, changePassword);

module.exports = router;
