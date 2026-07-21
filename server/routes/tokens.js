import express from 'express';
import crypto from 'crypto';
import db, { hashValue, generateRawToken } from '../db.js';
import { authenticateUser, requireAuth, authorize } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/auditLogger.js';
import { tokenRateLimiter, recordFailedTokenAttempt } from '../middleware/rateLimiter.js';

const router = express.Router();

// Helper to get token expiry duration setting (in hours)
function getTokenExpiryHours() {
  const row = db.prepare(`SELECT value FROM security_settings WHERE key = 'token_expiry_hours'`).get();
  return row ? parseFloat(row.value) : 24;
}

// POST /api/tokens/generate - Authorized staff (Admin, Dept Officer own dept)
router.post('/generate', authenticateUser, requireAuth, authorize('GENERATE_TOKENS'), (req, res) => {
  const { result_id } = req.body;

  if (!result_id) {
    return res.status(400).json({ error: 'Missing required parameter: result_id' });
  }

  const result = db.prepare(`
    SELECT r.*, c.department_id as course_dept_id, s.full_name as student_name, s.student_code, c.code as course_code
    FROM results r
    JOIN courses c ON r.course_id = c.id
    JOIN students s ON r.student_id = s.id
    WHERE r.id = ?
  `).get(result_id);

  if (!result) {
    return res.status(404).json({ error: 'Result not found' });
  }

  // Department Officer Scope Check
  if (req.user.role === 'Department Officer' && result.course_dept_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Result belongs to another department' });
  }

  // Requirement 2.1: Tokens can only be generated for results that have reached at least "locked" status.
  if (result.status !== 'Locked' && result.status !== 'Published') {
    return res.status(400).json({
      error: `Tokens can only be generated for results with status 'Locked' or 'Published'. Current status is '${result.status}'.`
    });
  }

  const rawToken = generateRawToken();
  const tokenHash = hashValue(rawToken);
  const now = new Date();
  const expiryHours = getTokenExpiryHours();
  const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000).toISOString();
  const tokenId = 'tok-' + crypto.randomUUID();

  db.transaction(() => {
    // Requirement 2.1: Invalidate any previous active token for this result
    db.prepare(`
      UPDATE tokens 
      SET is_invalidated = 1 
      WHERE result_id = ? AND is_used = 0 AND is_invalidated = 0
    `).run(result_id);

    // Insert new hashed token
    db.prepare(`
      INSERT INTO tokens (id, token_hash, result_id, created_by, created_at, expires_at, is_used, is_invalidated)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    `).run(tokenId, tokenHash, result_id, req.user.id, now.toISOString(), expiresAt);

    recordAuditLog(req, 'TOKEN_GENERATED', {
      result_id,
      student_code: result.student_code,
      course_code: result.course_code,
      expires_at: expiresAt,
    });
  })();

  // Return raw token ONCE to staff
  res.status(201).json({
    message: 'Single-use token generated successfully.',
    raw_token: rawToken,
    expires_at: expiresAt,
    result_id: result_id,
    student_name: result.student_name,
    student_code: result.student_code,
    course_code: result.course_code,
    parent_email: result.parent_email || 'parent.johnson@example.com',
    parent_phone: result.parent_phone || '+15550192834',
  });
});

// POST /api/tokens/dispatch - Simulate Email or SMS Token Dispatch to Parent
router.post('/dispatch', authenticateUser, requireAuth, authorize('GENERATE_TOKENS'), (req, res) => {
  const { result_id, raw_token, channel, destination } = req.body;

  if (!raw_token || !channel || !destination) {
    return res.status(400).json({ error: 'Missing required parameters: raw_token, channel, destination' });
  }

  const action = channel === 'SMS' ? 'TOKEN_DISPATCH_SMS' : 'TOKEN_DISPATCH_EMAIL';

  recordAuditLog(req, action, {
    result_id,
    channel,
    destination,
    dispatched_at: new Date().toISOString(),
  });

  res.json({
    message: `Token successfully dispatched via ${channel} to ${destination}.`,
    channel,
    destination,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/tokens/redeem - PUBLIC UNAUTHENTICATED PORTAL
// Requirement 2.4: Indistinguishable errors, rate limited per IP, single-use check
router.post('/redeem', tokenRateLimiter, (req, res) => {
  const { raw_token } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

  if (!raw_token || typeof raw_token !== 'string' || raw_token.trim().length === 0) {
    recordFailedTokenAttempt(ip);
    recordAuditLog(req, 'TOKEN_INVALID_ATTEMPT', { reason: 'Empty token submitted' });
    return res.status(400).json({ error: 'Invalid or expired token. Please request a new token from your department officer.' });
  }

  // Input Normalization: Trim and uppercase token before hashing
  const normalizedToken = raw_token.trim().toUpperCase();
  const tokenHash = hashValue(normalizedToken);

  // Search DB for token
  const tokenRecord = db.prepare(`SELECT * FROM tokens WHERE token_hash = ?`).get(tokenHash);

  // Failure Case 1: Unknown / invalid token
  if (!tokenRecord) {
    recordFailedTokenAttempt(ip);
    recordAuditLog(req, 'TOKEN_INVALID_ATTEMPT', { submitted_hash_prefix: tokenHash.slice(0, 8) });
    return res.status(401).json({ error: 'Invalid or expired token. Please request a new token from your department officer.' });
  }

  // Failure Case 2: Token already used (TOKEN REUSE ATTEMPT - High Security Event)
  if (tokenRecord.is_used === 1) {
    recordFailedTokenAttempt(ip);
    recordAuditLog(req, 'TOKEN_REUSE_ATTEMPT', {
      token_id: tokenRecord.id,
      result_id: tokenRecord.result_id,
      originally_used_at: tokenRecord.used_at,
    });
    return res.status(401).json({ error: 'Invalid or expired token. Please request a new token from your department officer.' });
  }

  // Failure Case 3: Token expired or invalidated
  const now = new Date();
  const expiresAt = new Date(tokenRecord.expires_at);
  if (tokenRecord.is_invalidated === 1 || now > expiresAt) {
    recordFailedTokenAttempt(ip);
    recordAuditLog(req, 'TOKEN_EXPIRED_ATTEMPT', {
      token_id: tokenRecord.id,
      result_id: tokenRecord.result_id,
      expires_at: tokenRecord.expires_at,
      is_invalidated: tokenRecord.is_invalidated,
    });
    return res.status(401).json({ error: 'Invalid or expired token. Please request a new token from your department officer.' });
  }

  // Success Case: Redeem Token!
  const result = db.prepare(`SELECT * FROM results WHERE id = ?`).get(tokenRecord.result_id);

  if (!result) {
    recordFailedTokenAttempt(ip);
    return res.status(401).json({ error: 'Invalid or expired token. Please request a new token from your department officer.' });
  }

  // Verify result is Published
  if (result.status !== 'Published') {
    recordFailedTokenAttempt(ip);
    recordAuditLog(req, 'TOKEN_REDEEM_UNPUBLISHED_RESULT', { result_id: result.id, status: result.status });
    return res.status(401).json({ error: 'Invalid or expired token. Please request a new token from your department officer.' });
  }

  const sessionToken = 'ses-' + crypto.randomUUID();
  const sessionExpiresAt = new Date(now.getTime() + 20 * 60 * 1000).toISOString(); // 20 minutes duration

  db.transaction(() => {
    // Mark token as used immediately (single-use)
    db.prepare(`UPDATE tokens SET is_used = 1, used_at = ? WHERE id = ?`).run(now.toISOString(), tokenRecord.id);

    // Create viewer session
    db.prepare(`
      INSERT INTO sessions (id, result_id, created_at, expires_at, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionToken, result.id, now.toISOString(), sessionExpiresAt, ip);

    recordAuditLog(req, 'TOKEN_REDEMPTION_SUCCESS', {
      token_id: tokenRecord.id,
      result_id: result.id,
      session_id: sessionToken,
    });
  })();

  // Set httpOnly cookie for session token (strictly cookie-only)
  res.cookie('schull_session_token', sessionToken, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 20 * 60 * 1000, // 20 minutes
  });

  res.json({
    message: 'Token redeemed successfully.',
    expires_at: sessionExpiresAt,
  });
});

// POST /api/tokens/exit-session
router.post('/exit-session', (req, res) => {
  res.clearCookie('schull_session_token');
  res.json({ message: 'Session ended successfully' });
});

// GET /api/tokens/view-result - Session-authenticated result viewing
// Requirement 2.4: On every request within an active session, the system re-verifies the underlying result is still "Published", so an admin unpublishing mid-session takes effect immediately.
router.get('/view-result', (req, res) => {
  const sessionToken = req.cookies?.schull_session_token;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Session token required' });
  }

  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionToken);

  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const now = new Date();
  if (now > new Date(session.expires_at)) {
    return res.status(401).json({ error: 'Session expired. Please request a new access token.' });
  }

  // Re-verify underlying result state in real-time
  const result = db.prepare(`
    SELECT r.id, r.score, r.grade, r.status, r.session, r.semester,
           s.student_code, s.full_name as student_name,
           c.code as course_code, c.title as course_title,
           d.name as department_name
    FROM results r
    JOIN students s ON r.student_id = s.id
    JOIN courses c ON r.course_id = c.id
    JOIN departments d ON c.department_id = d.id
    WHERE r.id = ?
  `).get(session.result_id);

  if (!result || result.status !== 'Published') {
    recordAuditLog(req, 'MID_SESSION_ACCESS_BLOCKED', { result_id: session.result_id, current_status: result?.status });
    return res.status(403).json({
      error: 'Access Revoked: The requested result is no longer in Published status.'
    });
  }

  const activeAppeal = db.prepare(`
    SELECT id, reason, status, created_at FROM result_appeals WHERE result_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(result.id);

  res.json({
    result: {
      id: result.id,
      student_name: result.student_name,
      student_code: result.student_code,
      course_code: result.course_code,
      course_title: result.course_title,
      department_name: result.department_name,
      session: result.session,
      semester: result.semester,
      score: result.score,
      grade: result.grade,
      status: result.status,
      active_appeal: activeAppeal || null,
    },
    session_expires_at: session.expires_at,
  });
});

// POST /api/tokens/appeal - Submit Parent/Student Result Verification Appeal
router.post('/appeal', (req, res) => {
  const sessionToken = req.cookies?.schull_session_token;
  const { reason } = req.body;

  if (!sessionToken) {
    return res.status(401).json({ error: 'Session token required' });
  }

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'A mandatory reason is required to submit a result appeal.' });
  }

  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionToken);
  if (!session || new Date() > new Date(session.expires_at)) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  const result = db.prepare(`SELECT * FROM results WHERE id = ?`).get(session.result_id);
  if (!result || result.status !== 'Published') {
    return res.status(403).json({ error: 'Access Revoked: Result is no longer Published.' });
  }

  const appealId = 'app-' + crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO result_appeals (id, result_id, session_id, reason, status, created_at)
    VALUES (?, ?, ?, ?, 'Pending', ?)
  `).run(appealId, result.id, sessionToken, reason.trim(), createdAt);

  recordAuditLog(req, 'RESULT_APPEAL_SUBMITTED', { appeal_id: appealId, result_id: result.id, reason: reason.trim() });

  res.status(201).json({
    message: 'Result appeal submitted successfully. Your request has been queued for review by department officers.',
    appeal_id: appealId,
    created_at: createdAt
  });
});

export default router;
