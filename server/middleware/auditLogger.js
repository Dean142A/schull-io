import db from '../db.js';
import crypto from 'crypto';

/**
 * Record an audit log entry atomically.
 * Requirement 2.5: "A failed attempt to write a log entry for a sensitive action does not allow that action to silently proceed unrecorded."
 */
export function recordAuditLog(req, action, details, actorOverride = null, targetDepartmentId = null) {
  const actor = actorOverride || req?.user || { id: 'anonymous', full_name: 'Anonymous/System', role: 'Guest', department_id: null };
  const ipAddress = req?.ip || req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';
  const userAgent = req?.headers['user-agent'] || 'Unknown';
  const timestamp = new Date().toISOString();
  const id = 'aud-' + crypto.randomUUID();

  // Determine effective department_id for audit trail scoping (Department Officer visibility)
  let deptId = actor.department_id || targetDepartmentId || null;
  if (!deptId && details && typeof details === 'object') {
    deptId = details.department_id || details.course_dept_id || null;
    if (!deptId && details.result_id) {
      try {
        const resRow = db.prepare(`
          SELECT c.department_id 
          FROM results r 
          JOIN courses c ON r.course_id = c.id 
          WHERE r.id = ?
        `).get(details.result_id);
        if (resRow) deptId = resRow.department_id;
      } catch (e) {
        // Silently fallback if table query fails
      }
    }
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, department_id, action, details, ip_address, user_agent, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      actor.id,
      actor.full_name,
      actor.role,
      deptId,
      action,
      typeof details === 'object' ? JSON.stringify(details) : details,
      ipAddress,
      userAgent,
      timestamp
    );
  } catch (err) {
    console.error(`[schull.io] AUDIT LOG FAILURE for action ${action}:`, err.message);
    throw new Error(`Audit logging failed: ${err.message}. Action aborted to protect audit trail integrity.`);
  }
}
