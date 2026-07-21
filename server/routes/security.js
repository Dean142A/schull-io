import express from 'express';
import db from '../db.js';
import { authenticateUser, requireAuth, authorize } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/auditLogger.js';
import { getFailedAttemptsByIp, getSuspiciousThreshold } from '../middleware/rateLimiter.js';

const router = express.Router();

router.use(authenticateUser);
router.use(requireAuth);
router.use(authorize('VIEW_SECURITY_DASHBOARD'));

// GET /api/security/dashboard
router.get('/dashboard', (req, res) => {
  // Requirement 2.6: Dashboard access itself is logged
  recordAuditLog(req, 'SECURITY_DASHBOARD_VIEW', { section: 'full_summary' });

  const threshold = getSuspiciousThreshold();

  // 1. Failed attempts by IP (combines DB audit log history + in-memory rate limiter)
  const failedLogsByIp = db.prepare(`
    SELECT ip_address, 
           COUNT(*) as attempt_count,
           SUM(CASE WHEN action = 'LOGIN_FAILED' THEN 1 ELSE 0 END) as failed_logins,
           SUM(CASE WHEN action IN ('TOKEN_INVALID_ATTEMPT', 'TOKEN_REUSE_ATTEMPT', 'TOKEN_EXPIRED_ATTEMPT') THEN 1 ELSE 0 END) as failed_tokens,
           SUM(CASE WHEN action = 'TOKEN_REUSE_ATTEMPT' THEN 1 ELSE 0 END) as reuse_attempts,
           MAX(timestamp) as last_attempt
    FROM audit_logs
    WHERE action IN ('LOGIN_FAILED', 'TOKEN_INVALID_ATTEMPT', 'TOKEN_REUSE_ATTEMPT', 'TOKEN_EXPIRED_ATTEMPT')
    GROUP BY ip_address
    ORDER BY attempt_count DESC
  `).all();

  const ipActivity = failedLogsByIp.map(row => ({
    ...row,
    is_suspicious: row.attempt_count >= threshold || row.reuse_attempts > 0
  }));

  // 2. Token generation volume grouped by staff member
  const tokenStatsByStaff = db.prepare(`
    SELECT u.id as staff_id, u.full_name, u.username, u.role, d.name as department_name,
           COUNT(t.id) as total_tokens,
           SUM(CASE WHEN t.is_used = 1 THEN 1 ELSE 0 END) as redeemed_tokens,
           SUM(CASE WHEN t.is_invalidated = 1 THEN 1 ELSE 0 END) as invalidated_tokens
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    JOIN tokens t ON t.created_by = u.id
    GROUP BY u.id
    ORDER BY total_tokens DESC
  `).all();

  // 3. Activity Overview Breakdown
  const activityBreakdown = db.prepare(`
    SELECT action, COUNT(*) as count
    FROM audit_logs
    GROUP BY action
    ORDER BY count DESC
  `).all();

  // 5. Locked or Disabled Users
  const lockedUsers = db.prepare(`
    SELECT id, username, full_name, role, failed_login_attempts, locked_until, is_active
    FROM users
    WHERE (locked_until IS NOT NULL AND locked_until > datetime('now')) OR is_active = 0 OR failed_login_attempts > 0
  `).all();

  res.json({
    threshold,
    ip_activity: ipActivity,
    token_stats_by_staff: tokenStatsByStaff,
    activity_breakdown: activityBreakdown,
    result_stats: resultStats,
    locked_users: lockedUsers,
    live_failed_attempts: getFailedAttemptsByIp(),
  });
});

// POST /api/security/unlock-user - Admin unlock of locked or disabled user accounts
router.post('/unlock-user', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user_id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  db.prepare(`UPDATE users SET failed_login_attempts = 0, locked_until = null, is_active = 1 WHERE id = ?`).run(user_id);

  recordAuditLog(req, 'ADMIN_ACCOUNT_UNLOCK', { unlocked_user_id: user_id, unlocked_username: user.username });

  res.json({ message: `Account for ${user.full_name} (${user.username}) has been unlocked successfully.` });
});

// PUT /api/security/settings - Update threshold / settings
router.put('/settings', (req, res) => {
  const { suspicious_threshold, token_expiry_hours } = req.body;

  if (suspicious_threshold !== undefined) {
    const val = parseInt(suspicious_threshold, 10);
    if (isNaN(val) || val < 1) {
      return res.status(400).json({ error: 'Threshold must be a positive integer.' });
    }
    db.prepare(`INSERT OR REPLACE INTO security_settings (key, value) VALUES ('suspicious_threshold', ?)`).run(val.toString());
    recordAuditLog(req, 'SECURITY_SETTING_CHANGE', { setting: 'suspicious_threshold', new_value: val });
  }

  if (token_expiry_hours !== undefined) {
    const val = parseFloat(token_expiry_hours);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({ error: 'Token expiry hours must be greater than 0.' });
    }
    db.prepare(`INSERT OR REPLACE INTO security_settings (key, value) VALUES ('token_expiry_hours', ?)`).run(val.toString());
    recordAuditLog(req, 'SECURITY_SETTING_CHANGE', { setting: 'token_expiry_hours', new_value: val });
  }

  res.json({ message: 'Security settings updated successfully.' });
});

// POST /api/security/simulate-attack - Interactive demo trigger for testing anomaly detection
router.post('/simulate-attack', (req, res) => {
  const targetIp = '198.51.100.42'; // Simulated attacker IP
  const count = parseInt(req.body.count || '6', 10);

  for (let i = 0; i < count; i++) {
    recordAuditLog(
      { ip: targetIp, headers: { 'user-agent': 'python-requests/2.28.1 (Automated Scanner)' }, socket: {} },
      i % 2 === 0 ? 'TOKEN_INVALID_ATTEMPT' : 'TOKEN_REUSE_ATTEMPT',
      { simulated: true, attempt_number: i + 1, target: 'SCH-MOCK-HASH' },
      { id: 'anonymous', full_name: 'Attacker (Simulated)', role: 'Guest', department_id: null }
    );
  }

  res.json({ message: `Simulated ${count} malicious token redemption attempts from IP ${targetIp}. Check the Security Dashboard!` });
});

export default router;
