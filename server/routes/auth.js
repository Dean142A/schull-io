import express from 'express';
import jwt from 'jsonwebtoken';
import db, { comparePassword } from '../db.js';
import { recordAuditLog } from '../middleware/auditLogger.js';
import { authenticateUser, JWT_SECRET } from '../middleware/auth.js';

const router = express.Router();

// GET /api/auth/demo-users (For quick UI demo switching when enabled)
router.get('/demo-users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.department_id, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
  `).all();
  res.json(users);
});

// POST /api/auth/login - Strict production authentication
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare(`
    SELECT u.*, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.username = ?
  `).get(username);

  if (user && user.locked_until && new Date() < new Date(user.locked_until)) {
    recordAuditLog(req, 'LOGIN_BLOCKED_LOCKED', { username }, { id: 'anonymous', full_name: username, role: 'Guest', department_id: null });
    return res.status(429).json({ error: 'Account temporarily locked due to 5 consecutive failed login attempts. Contact an Administrator to unlock.' });
  }

  const isPasswordValid = user ? comparePassword(password, user.password_hash) : false;

  if (!user || !isPasswordValid || user.is_active === 0) {
    if (user) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      if (attempts >= 5) {
        const lockTime = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins lock
        db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`).run(attempts, lockTime, user.id);
        recordAuditLog(req, 'ACCOUNT_LOCKED', { username, attempts, lock_until: lockTime }, user);
        return res.status(429).json({ error: 'Account locked due to 5 consecutive failed login attempts. Contact an Administrator to unlock.' });
      } else {
        db.prepare(`UPDATE users SET failed_login_attempts = ? WHERE id = ?`).run(attempts, user.id);
      }
    }

    recordAuditLog(req, 'LOGIN_FAILED', { username, reason: !user ? 'User not found' : (user.is_active === 0 ? 'Account deactivated' : 'Invalid password') }, { id: 'anonymous', full_name: username || 'Unknown', role: 'Guest', department_id: null });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Reset failed login attempts on successful login
  db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = null WHERE id = ?`).run(user.id);

  // Issue signed JWT Token
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, department_id: user.department_id },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  // Set httpOnly Cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });

  // Audit successful login attempt
  recordAuditLog(req, 'LOGIN_SUCCESS', { username: user.username, role: user.role }, user);

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      department_id: user.department_id,
      department_name: user.department_name,
      department_code: user.department_code,
    }
  });
});

// POST /api/auth/dev-switch-user - Isolated Development Role Switcher (Disabled in Production)
router.post('/dev-switch-user', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden: Development role switcher is disabled in production.' });
  }

  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId parameter required' });
  }

  const user = db.prepare(`
    SELECT u.*, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(userId);

  if (!user || user.is_active === 0) {
    return res.status(404).json({ error: 'User not found or deactivated' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, department_id: user.department_id },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.cookie('auth_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });

  recordAuditLog(req, 'DEV_ROLE_SWITCH', { switched_to_user_id: user.id, role: user.role }, user);

  res.json({
    message: `Dev role switched to ${user.full_name}`,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      department_id: user.department_id,
      department_name: user.department_name,
      department_code: user.department_code,
    }
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me - Verifies live session and returns user
router.get('/me', authenticateUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.department_id, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
});

export default router;
