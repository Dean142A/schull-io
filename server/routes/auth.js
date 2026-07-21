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

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password, userId } = req.body;

  let user = null;

  // Direct login by userId (for test role switcher) or by username + password
  if (userId && !password) {
    user = db.prepare(`
      SELECT u.*, d.name as department_name, d.code as department_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.id = ?
    `).get(userId);
  } else if (username) {
    user = db.prepare(`
      SELECT u.*, d.name as department_name, d.code as department_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE u.username = ?
    `).get(username);
  }

  const isPasswordValid = user && password ? comparePassword(password, user.password_hash) : (user && userId && !password);

  if (!user || !isPasswordValid) {
    // Audit failed login attempt
    recordAuditLog(req, 'LOGIN_FAILED', { username: username || userId, reason: 'Invalid username or password' }, { id: 'anonymous', full_name: username || 'Unknown', role: 'Guest', department_id: null });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

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
    maxAge: 8 * 60 * 60 * 1000,
  });

  // Audit successful login attempt
  recordAuditLog(req, 'LOGIN_SUCCESS', { username: user.username, role: user.role }, user);

  res.json({
    message: 'Login successful',
    token,
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
