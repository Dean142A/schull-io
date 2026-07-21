import express from 'express';
import jwt from 'jsonwebtoken';
import db, { comparePassword } from '../db.js';
import { recordAuditLog } from '../middleware/auditLogger.js';
import { authenticateUser, JWT_SECRET } from '../middleware/auth.js';
import { loginRateLimiter, recordFailedLoginAttempt } from '../middleware/rateLimiter.js';
import { generateBase32Secret, generateTotpCode, verifyTotpCode } from '../utils/totp.js';

const router = express.Router();

// GET /api/auth/demo-users (For quick UI demo switching when enabled)
router.get('/demo-users', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.department_id, u.two_factor_enabled, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
  `).all();
  res.json(users);
});

// POST /api/auth/login - Strict production authentication with IP rate limiting & per-account lockout
router.post('/login', loginRateLimiter, (req, res) => {
  const { username, password, totp_code } = req.body;
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || '127.0.0.1');

  if (!username || !password) {
    recordFailedLoginAttempt(ip);
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare(`
    SELECT u.*, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.username = ?
  `).get(username);

  if (user && user.locked_until && new Date() < new Date(user.locked_until)) {
    recordFailedLoginAttempt(ip);
    recordAuditLog(req, 'LOGIN_BLOCKED_LOCKED', { username }, { id: 'anonymous', full_name: username, role: 'Guest', department_id: null });
    return res.status(429).json({ error: 'Account temporarily locked due to 5 consecutive failed login attempts. Contact an Administrator to unlock.' });
  }

  const isPasswordValid = user ? comparePassword(password, user.password_hash) : false;

  if (!user || !isPasswordValid || user.is_active === 0) {
    recordFailedLoginAttempt(ip);
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

  // Check 2FA TOTP verification requirement
  if (user.two_factor_enabled === 1) {
    if (!totp_code) {
      return res.status(200).json({
        requires_2fa: true,
        username: user.username,
        message: 'Two-Factor Authentication code required.'
      });
    }

    const isTotpValid = verifyTotpCode(user.two_factor_secret, totp_code);
    if (!isTotpValid) {
      recordFailedLoginAttempt(ip);
      const attempts = (user.failed_login_attempts || 0) + 1;
      if (attempts >= 5) {
        const lockTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        db.prepare(`UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`).run(attempts, lockTime, user.id);
        recordAuditLog(req, 'ACCOUNT_LOCKED', { username: user.username, attempts, lock_until: lockTime }, user);
        return res.status(429).json({ error: 'Account locked due to 5 consecutive failed login attempts. Contact an Administrator to unlock.' });
      } else {
        db.prepare(`UPDATE users SET failed_login_attempts = ? WHERE id = ?`).run(attempts, user.id);
      }

      recordAuditLog(req, 'LOGIN_FAILED_2FA', { username: user.username, reason: 'Invalid 2FA TOTP code', attempts }, user);
      return res.status(401).json({ error: 'Invalid 2FA authentication code. Please check your authenticator app.' });
    }
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
  recordAuditLog(req, 'LOGIN_SUCCESS', { role: user.role }, user);

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
      two_factor_enabled: user.two_factor_enabled,
    }
  });
});

// POST /api/auth/dev-switch-user (Development / Demo role switcher ONLY)
router.post('/dev-switch-user', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Role switcher is disabled in production environments.' });
  }

  const targetUserId = req.body.targetUserId || req.body.userId;
  if (!targetUserId) {
    return res.status(400).json({ error: 'targetUserId or userId is required' });
  }

  const user = db.prepare(`
    SELECT u.*, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(targetUserId);

  if (!user || user.is_active === 0) {
    return res.status(401).json({ error: 'User not found or account deactivated' });
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
      two_factor_enabled: user.two_factor_enabled,
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
    SELECT u.id, u.username, u.full_name, u.role, u.department_id, u.two_factor_enabled, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
});

// POST /api/auth/profile - Update profile full_name and/or change password
router.post('/profile', authenticateUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { full_name, current_password, new_password } = req.body;

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Handle Full Name Update
  if (full_name && typeof full_name === 'string' && full_name.trim().length > 0) {
    db.prepare(`UPDATE users SET full_name = ? WHERE id = ?`).run(full_name.trim(), user.id);
  }

  // Handle Password Change
  if (new_password) {
    if (!current_password) {
      return res.status(400).json({ error: 'Current password is required to set a new password' });
    }

    const isMatch = comparePassword(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (typeof new_password !== 'string' || new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const newHash = hashPassword(new_password);
    db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(newHash, user.id);
    recordAuditLog(req, 'PASSWORD_CHANGE', { user_id: user.id }, user);
  }

  const updatedUser = db.prepare(`
    SELECT u.id, u.username, u.full_name, u.role, u.department_id, u.two_factor_enabled, d.name as department_name, d.code as department_code
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(user.id);

  recordAuditLog(req, 'PROFILE_UPDATE', { user_id: user.id, full_name_updated: !!full_name, password_updated: !!new_password }, user);

  res.json({
    message: 'Profile updated successfully',
    user: updatedUser
  });
});

// POST /api/auth/2fa/setup - Generate 2FA Secret Key (with re-setup safeguard)
router.post('/2fa/setup', authenticateUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Safeguard: Re-setting 2FA on an already-enabled account requires password + current TOTP code proof!
  if (user.two_factor_enabled === 1) {
    const { password, current_totp_code } = req.body;
    if (!password || !current_totp_code) {
      return res.status(400).json({ error: 'Re-configuring 2FA on an enabled account requires current account password and current 2FA TOTP code.' });
    }
    const isPasswordValid = comparePassword(password, user.password_hash);
    const isTotpValid = verifyTotpCode(user.two_factor_secret, current_totp_code);
    if (!isPasswordValid || !isTotpValid) {
      return res.status(401).json({ error: 'Invalid account password or current 2FA verification code. Cannot re-configure 2FA secret.' });
    }
  }

  const secret = generateBase32Secret(20);
  const otpauthUrl = `otpauth://totp/schull:${user.username}?secret=${secret}&issuer=schull.io`;

  // Store in two_factor_pending_secret without disrupting active two_factor_secret
  db.prepare(`UPDATE users SET two_factor_pending_secret = ? WHERE id = ?`).run(secret, user.id);

  res.json({
    secret,
    otpauth_url: otpauthUrl,
    message: '2FA secret key generated. Enter a code from your authenticator app to enable 2FA.'
  });
});

// POST /api/auth/2fa/enable - Verify code and activate 2FA
router.post('/2fa/enable', authenticateUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { totp_code } = req.body;
  const user = db.prepare(`SELECT two_factor_secret, two_factor_pending_secret FROM users WHERE id = ?`).get(req.user.id);

  const candidateSecret = user?.two_factor_pending_secret || user?.two_factor_secret;

  if (!user || !candidateSecret) {
    return res.status(400).json({ error: 'Please generate a 2FA secret key first.' });
  }

  const isValid = verifyTotpCode(candidateSecret, totp_code);
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid 2FA verification code. Check your authenticator app.' });
  }

  db.prepare(`UPDATE users SET two_factor_secret = ?, two_factor_pending_secret = null, two_factor_enabled = 1 WHERE id = ?`).run(candidateSecret, req.user.id);
  recordAuditLog(req, '2FA_ENABLED', { user_id: req.user.id });

  res.json({ message: 'Two-factor authentication enabled successfully.' });
});

// POST /api/auth/2fa/disable - Deactivate 2FA
router.post('/2fa/disable', authenticateUser, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { password, totp_code } = req.body;
  const user = db.prepare(`SELECT password_hash, two_factor_secret FROM users WHERE id = ?`).get(req.user.id);

  if (!user || !comparePassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid account password.' });
  }

  if (user.two_factor_secret && !verifyTotpCode(user.two_factor_secret, totp_code)) {
    return res.status(400).json({ error: 'Invalid 2FA code.' });
  }

  db.prepare(`UPDATE users SET two_factor_enabled = 0, two_factor_secret = null, two_factor_pending_secret = null WHERE id = ?`).run(req.user.id);
  recordAuditLog(req, '2FA_DISABLED', { user_id: req.user.id });

  res.json({ message: 'Two-factor authentication disabled.' });
});

export default router;
