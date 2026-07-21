import express from 'express';
import db from '../db.js';
import { authenticateUser, requireAuth, authorize } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/auditLogger.js';

const router = express.Router();

router.use(authenticateUser);
router.use(requireAuth);
router.use(authorize('VIEW_AUDIT_LOGS'));

// GET /api/audit-logs - Search and filter logs
router.get('/', (req, res) => {
  const { action, ip, actor_id, search, limit = 100 } = req.query;
  const { role, department_id } = req.user;

  let query = `SELECT * FROM audit_logs`;
  const conditions = [];
  const params = [];

  // Scope: Dept Officer can only view logs related to their own department or members
  if (role === 'Department Officer') {
    conditions.push(`(department_id = ? OR actor_id = ?)`);
    params.push(department_id, req.user.id);
  }

  if (action) {
    conditions.push(`action = ?`);
    params.push(action);
  }

  if (ip) {
    conditions.push(`ip_address LIKE ?`);
    params.push(`%${ip}%`);
  }

  if (actor_id) {
    conditions.push(`actor_id = ?`);
    params.push(actor_id);
  }

  if (search) {
    conditions.push(`(action LIKE ? OR actor_name LIKE ? OR details LIKE ? OR ip_address LIKE ?)`);
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  query += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(parseInt(limit, 10));

  const logs = db.prepare(query).all(...params);

  // Log that audit logs were viewed
  recordAuditLog(req, 'VIEW_AUDIT_LOGS', { filter_action: action, filter_ip: ip, count: logs.length });

  res.json(logs);
});

// GET /api/audit-logs/export - Export audit logs to CSV
router.get('/export', (req, res) => {
  const { role, department_id, id: actorId } = req.user;

  let query = `SELECT * FROM audit_logs`;
  const params = [];

  if (role === 'Department Officer') {
    query += ` WHERE (department_id = ? OR actor_id = ?)`;
    params.push(department_id, actorId);
  }

  query += ` ORDER BY timestamp DESC`;

  const logs = db.prepare(query).all(...params);
  
  let csv = 'Timestamp,Actor Name,Actor Role,Action Event,IP Address,Details\n';
  logs.forEach(l => {
    const detailsClean = (l.details || '').replace(/"/g, '""');
    csv += `"${l.timestamp}","${l.actor_name}","${l.actor_role}","${l.action}","${l.ip_address}","${detailsClean}"\n`;
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="schull_audit_logs.csv"');
  res.send(csv);
});

export default router;
