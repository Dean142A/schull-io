import db from '../db.js';

// In-memory sliding window store for IP redemption failures
const ipFailedAttempts = new Map(); // IP -> Array of timestamps (ms)

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

export function getSuspiciousThreshold() {
  const row = db.prepare(`SELECT value FROM security_settings WHERE key = 'suspicious_threshold'`).get();
  return row ? parseInt(row.value, 10) : 5;
}

export function recordFailedTokenAttempt(ip) {
  const now = Date.now();
  const attempts = ipFailedAttempts.get(ip) || [];
  // Filter out attempts outside the window
  const validAttempts = attempts.filter(ts => now - ts < WINDOW_MS);
  validAttempts.push(now);
  ipFailedAttempts.set(ip, validAttempts);
  return validAttempts.length;
}

export function tokenRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const threshold = getSuspiciousThreshold();
  const now = Date.now();

  const attempts = (ipFailedAttempts.get(ip) || []).filter(ts => now - ts < WINDOW_MS);
  ipFailedAttempts.set(ip, attempts);

  if (attempts.length >= threshold) {
    return res.status(429).json({
      error: 'Rate limit exceeded: Too many invalid token attempts from your IP address. Please try again later.'
    });
  }

  next();
}

export function getFailedAttemptsByIp() {
  const threshold = getSuspiciousThreshold();
  const now = Date.now();
  const result = [];

  for (const [ip, timestamps] of ipFailedAttempts.entries()) {
    const valid = timestamps.filter(ts => now - ts < WINDOW_MS);
    if (valid.length > 0) {
      result.push({
        ip_address: ip,
        failed_count: valid.length,
        is_suspicious: valid.length >= threshold,
        last_attempt: new Date(Math.max(...valid)).toISOString(),
      });
    }
  }

  return result.sort((a, b) => b.failed_count - a.failed_count);
}
