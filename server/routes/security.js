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

  // 6. Blocked IPs
  const blockedIps = db.prepare(`SELECT * FROM ip_blocklist ORDER BY blocked_at DESC`).all();

  res.json({
    threshold,
    ip_activity: ipActivity,
    token_stats_by_staff: tokenStatsByStaff,
    activity_breakdown: activityBreakdown,
    result_stats: resultStats,
    locked_users: lockedUsers,
    blocked_ips: blockedIps,
    live_failed_attempts: getFailedAttemptsByIp(),
  });
});

// POST /api/security/block-ip - Manually block an IP address
router.post('/block-ip', (req, res) => {
  const { ip_address, reason } = req.body;
  if (!ip_address || !reason) {
    return res.status(400).json({ error: 'ip_address and reason parameters are required.' });
  }

  const nowStr = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO ip_blocklist (ip_address, reason, blocked_at, blocked_by)
    VALUES (?, ?, ?, ?)
  `).run(ip_address.trim(), reason.trim(), nowStr, req.user.username);

  recordAuditLog(req, 'IP_BLOCKED', { blocked_ip: ip_address.trim(), reason: reason.trim() });

  res.json({ message: `IP address ${ip_address} has been added to the security blocklist.` });
});

// POST /api/security/unblock-ip - Manually remove IP from blocklist
router.post('/unblock-ip', (req, res) => {
  const { ip_address } = req.body;
  if (!ip_address) {
    return res.status(400).json({ error: 'ip_address parameter is required.' });
  }

  db.prepare(`DELETE FROM ip_blocklist WHERE ip_address = ?`).run(ip_address.trim());
  recordAuditLog(req, 'IP_UNBLOCKED', { unblocked_ip: ip_address.trim() });

  res.json({ message: `IP address ${ip_address} has been unblocked.` });
});

// GET /api/security/export-incidents - Export Security Incidents to CSV
router.get('/export-incidents', (req, res) => {
  const incidents = db.prepare(`
    SELECT timestamp, ip_address, action, actor_name, actor_role, details
    FROM audit_logs
    WHERE action IN ('LOGIN_FAILED', 'LOGIN_BLOCKED_LOCKED', 'TOKEN_INVALID_ATTEMPT', 'TOKEN_REUSE_ATTEMPT', 'TOKEN_EXPIRED_ATTEMPT', 'ACCOUNT_LOCKED', 'IP_BLOCKED')
    ORDER BY timestamp DESC
  `).all();

  let csv = 'Timestamp,IP Address,Action Event,Actor Name,Actor Role,Details\n';
  incidents.forEach(inc => {
    const detailsClean = (inc.details || '').replace(/"/g, '""');
    csv += `"${inc.timestamp}","${inc.ip_address}","${inc.action}","${inc.actor_name}","${inc.actor_role}","${detailsClean}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="schull_security_incidents.csv"');
  res.send(csv);
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

// GET /api/security/settings - Get all system security policies and rules
router.get('/settings', (req, res) => {
  const rows = db.prepare(`SELECT key, value FROM security_settings`).all();
  const settings = {
    suspicious_threshold: '5',
    lockout_duration_mins: '15',
    token_expiry_hours: '24',
    single_use_strictness: 'true',
    session_expiry_hours: '8',
    default_dispatch_channel: 'EMAIL',
    token_dispatch_limit_daily: '5',
    token_dispatch_cooldown_mins: '5',
    auto_invalidate_previous_tokens: 'true',
    disclaimer_template: 'SECURITY ADVISORY: This verification token is single-use and intended strictly for the parent or legal guardian. Do not forward or disclose raw verification tokens to unauthorized third parties.',
  };

  rows.forEach(r => {
    settings[r.key] = r.value;
  });

  res.json({ settings });
});

// PUT /api/security/settings - Update system security settings & rules
router.put('/settings', (req, res) => {
  const allowedKeys = [
    'suspicious_threshold',
    'lockout_duration_mins',
    'token_expiry_hours',
    'single_use_strictness',
    'session_expiry_hours',
    'default_dispatch_channel',
    'token_dispatch_limit_daily',
    'token_dispatch_cooldown_mins',
    'auto_invalidate_previous_tokens',
    'disclaimer_template',
  ];

  const updated = [];

  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) {
      const val = req.body[key].toString();
      db.prepare(`INSERT OR REPLACE INTO security_settings (key, value) VALUES (?, ?)`).run(key, val);
      updated.push(key);
      recordAuditLog(req, 'SECURITY_SETTING_CHANGE', { setting: key, new_value: val });
    }
  }

  res.json({ message: `Security settings updated successfully (${updated.length} settings modified).` });
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

// GET /api/security/export-student/:id (GDPR Compliance: Compile and export all data related to a single student)
router.get('/export-student/:id', (req, res) => {
  const studentId = req.params.id;
  const normalized = studentId.replace(/-/g, '/');

  const student = db.prepare(`
    SELECT s.*, d.name as department_name 
    FROM students s
    JOIN departments d ON s.department_id = d.id
    WHERE s.id = ? OR s.student_code = ? OR LOWER(s.student_code) = LOWER(?)
  `).get(studentId, studentId, normalized);

  if (!student) {
    return res.status(404).json({ error: 'Student record not found' });
  }

  // 1. Fetch grades
  const results = db.prepare(`
    SELECT r.*, c.code as course_code, c.title as course_title 
    FROM results r
    JOIN courses c ON r.course_id = c.id
    WHERE r.student_id = ?
  `).all(student.id);

  // 2. Fetch tokens generated
  const tokens = db.prepare(`
    SELECT t.* 
    FROM tokens t
    JOIN results r ON t.result_id = r.id
    WHERE r.student_id = ?
  `).all(student.id);

  // 3. Fetch appeals
  const appeals = db.prepare(`
    SELECT a.* 
    FROM result_appeals a
    JOIN results r ON a.result_id = r.id
    WHERE r.student_id = ?
  `).all(student.id);

  // 4. Fetch audit logs related to this student
  const audits = db.prepare(`
    SELECT * FROM audit_logs 
    WHERE details LIKE ? OR details LIKE ?
  `).all(`%${student.id}%`, `%${student.student_code}%`);

  recordAuditLog(req, 'STUDENT_DATA_EXPORT', { student_id: student.id, student_code: student.student_code });

  res.json({
    exported_at: new Date().toISOString(),
    exporter: req.user.full_name,
    student,
    results,
    tokens,
    appeals,
    audits
  });
});

// POST /api/security/purge-logs (Configurable log retention & purge job)
router.post('/purge-logs', (req, res) => {
  const daysSetting = db.prepare(`SELECT value FROM security_settings WHERE key = 'log_retention_days'`).get();
  const days = daysSetting ? parseInt(daysSetting.value) : 90; // Default to 90 days

  if (days <= 0) {
    return res.json({ message: 'Log retention is configured as Indefinite. No audit logs were purged.' });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString();

  // Count logs to delete
  const count = db.prepare(`SELECT COUNT(*) as cnt FROM audit_logs WHERE timestamp < ?`).get(cutoffStr).cnt;

  if (count > 0) {
    db.prepare(`DELETE FROM audit_logs WHERE timestamp < ?`).run(cutoffStr);
    recordAuditLog(req, 'AUDIT_LOG_RETENTION_PURGE', { retention_days: days, purged_count: count, cutoff_timestamp: cutoffStr });
  }

  res.json({ message: `Purge job executed successfully: Deleted ${count} audit logs older than ${days} days.` });
});

export default router;
