const jwt = require('jsonwebtoken');
const authService = require('../services/authService');

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 8 * 60 * 60 * 1000,
});

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const result = await authService.login(username, password);
    if (!result) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { userId: result.user.id, role: result.user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.cookie('token', token, cookieOptions());

    return res.json({
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
      },
      message: 'Login successful',
      ...(result.requiresPasswordChange && { requiresPasswordChange: true }),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function logout(req, res) {
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.json({ message: 'Logged out successfully' });
}

async function me(req, res) {
  try {
    const user = await authService.getUserById(req.user.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    return res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      requiresPasswordChange: !user.password_changed,
    });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Both current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const result = await authService.changePassword(req.user.userId, currentPassword, newPassword);
    if (!result) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    return res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = { login, logout, me, changePassword };
