import db from '../db.js';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

export function getSuspiciousThreshold() {
  const row = db.prepare(`SELECT value FROM security_settings WHERE key = 'suspicious_threshold'`).get();
  return row ? parseInt(row.value, 10) : 5;
}

export function recordFailedTokenAttempt(ip) {
  const nowStr = new Date().toISOString();
  const existing = db.prepare(`SELECT attempt_count, last_attempt FROM ip_rate_limits WHERE ip_address = ?`).get(ip);

  let newCount = 1;
  if (existing) {
    const elapsed = Date.now() - new Date(existing.last_attempt).getTime();
    newCount = elapsed < WINDOW_MS ? existing.attempt_count + 1 : 1;
  }

  db.prepare(`
    INSERT OR REPLACE INTO ip_rate_limits (ip_address, attempt_count, last_attempt)
    VALUES (?, ?, ?)
  `).run(ip, newCount, nowStr);

  return newCount;
}

export function recordFailedLoginAttempt(ip) {
  const nowStr = new Date().toISOString();
  const existing = db.prepare(`SELECT attempt_count, last_attempt FROM login_rate_limits WHERE ip_address = ?`).get(ip);

  let newCount = 1;
  if (existing) {
    const elapsed = Date.now() - new Date(existing.last_attempt).getTime();
    newCount = elapsed < WINDOW_MS ? existing.attempt_count + 1 : 1;
  }

  db.prepare(`
    INSERT OR REPLACE INTO login_rate_limits (ip_address, attempt_count, last_attempt)
    VALUES (?, ?, ?)
  `).run(ip, newCount, nowStr);

  return newCount;
}

export function tokenRateLimiter(req, res, next) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || '127.0.0.1');

  // 1. Check if IP is in manual blocklist
  const blocked = db.prepare(`SELECT reason FROM ip_blocklist WHERE ip_address = ?`).get(ip);
  if (blocked) {
    return res.status(403).json({
      error: `Access Denied: Your IP address has been blocked by system administrators. Reason: ${blocked.reason}`
    });
  }

  // 2. Check rate limit
  const threshold = getSuspiciousThreshold();
  const record = db.prepare(`SELECT attempt_count, last_attempt FROM ip_rate_limits WHERE ip_address = ?`).get(ip);

  if (record) {
    const elapsed = Date.now() - new Date(record.last_attempt).getTime();
    if (elapsed < WINDOW_MS && record.attempt_count >= threshold) {
      return res.status(429).json({
        error: 'Rate limit exceeded: Too many invalid token attempts from your IP address. Please try again later.'
      });
    }
  }

  next();
}

export function loginRateLimiter(req, res, next) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || '127.0.0.1');

  // 1. Check if IP is in manual blocklist
  const blocked = db.prepare(`SELECT reason FROM ip_blocklist WHERE ip_address = ?`).get(ip);
  if (blocked) {
    return res.status(403).json({
      error: `Access Denied: Your IP address has been blocked by system administrators. Reason: ${blocked.reason}`
    });
  }

  // 2. Check IP rate limit for login attempts (10 attempts per 15 mins)
  const threshold = 10;
  const record = db.prepare(`SELECT attempt_count, last_attempt FROM login_rate_limits WHERE ip_address = ?`).get(ip);

  if (record) {
    const elapsed = Date.now() - new Date(record.last_attempt).getTime();
    if (elapsed < WINDOW_MS && record.attempt_count >= threshold) {
      return res.status(429).json({
        error: 'Rate limit exceeded: Too many failed authentication attempts from your IP address. Please try again later.'
      });
    }
  }

  next();
}

export function getFailedAttemptsByIp() {
  const threshold = getSuspiciousThreshold();
  const rows = db.prepare(`SELECT ip_address, attempt_count, last_attempt FROM ip_rate_limits ORDER BY attempt_count DESC`).all();

  return rows.map(r => ({
    ip_address: r.ip_address,
    failed_count: r.attempt_count,
    is_suspicious: r.attempt_count >= threshold,
    last_attempt: r.last_attempt,
  }));
}
