import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db.js';

export const JWT_SECRET = process.env.JWT_SECRET || (
  process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable must be set in production mode.'); })()
    : crypto.randomBytes(32).toString('hex')
);

// Permissions Matrix per Section 2.2
export const PERMISSIONS = {
  GENERATE_TOKENS: ['Administrator', 'Supervisor'],
  UPLOAD_RESULTS: ['Teacher'],
  MODIFY_RESULTS: ['Administrator', 'Teacher', 'Supervisor'],
  LOCK_RESULTS: ['Administrator', 'Supervisor'],
  PUBLISH_RESULTS: ['Administrator', 'Supervisor'],
  UNPUBLISH_RESULTS: ['Administrator'],
  VIEW_AUDIT_LOGS: ['Administrator', 'Supervisor'],
  VIEW_SECURITY_DASHBOARD: ['Administrator'],
};

/**
 * Authentication Middleware: Verifies signed JWT token from cookie or Authorization header,
 * then fetches fresh user data from DB on every request.
 * Ensures role/department reassignments or account deactivations take effect on next request immediately.
 */
export function authenticateUser(req, res, next) {
  let token = req.cookies?.auth_token;

  if (!token && req.headers['authorization']?.startsWith('Bearer ')) {
    token = req.headers['authorization'].split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id || decoded.userId;

    // Fetch live user record directly from database and verify account is active
    const user = db.prepare(`SELECT id, username, full_name, role, department_id, is_active FROM users WHERE id = ?`).get(userId);
    if (!user || user.is_active === 0) {
      req.user = null;
    } else {
      req.user = user;
    }
  } catch (err) {
    // Invalid or expired token
    req.user = null;
  }

  next();
}

/**
 * Require authenticated user
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * RBAC & Scope Middleware Factory
 * Checks permission AND enforces department/course ownership scopes
 */
export function authorize(permission, getResourceScope = null) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const role = req.user.role;
    const allowedRoles = PERMISSIONS[permission];

    if (!allowedRoles || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: `Forbidden: Role '${role}' lacks permission for '${permission}'` });
    }

    // Admins bypass department/course scope checks
    if (role === 'Administrator') {
      return next();
    }

    // Scope check if resource context is needed
    if (getResourceScope) {
      const scope = getResourceScope(req); // { department_id, lecturer_id, course_id }

      if (role === 'Supervisor') {
        if (scope.department_id && scope.department_id !== req.user.department_id) {
          return res.status(403).json({ error: 'Forbidden: Access restricted to your assigned department.' });
        }
      }

      if (role === 'Teacher') {
        if (scope.lecturer_id && scope.lecturer_id !== req.user.id) {
          return res.status(403).json({ error: 'Forbidden: Access restricted to your assigned courses.' });
        }
      }
    }

    next();
  };
}
