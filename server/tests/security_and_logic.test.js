import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import db, { initDb, comparePassword } from '../db.js';
import authRoutes from '../routes/auth.js';
import resultsRoutes from '../routes/results.js';
import tokensRoutes from '../routes/tokens.js';
import auditRoutes from '../routes/audit.js';
import securityRoutes from '../routes/security.js';

// Setup Test Express App
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/tokens', tokensRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/security', securityRoutes);

describe('schull.io Security & System Correctness Test Suite', () => {
  let adminCookie = '';
  let csOfficerCookie = '';
  let csLecturerCookie = '';

  beforeAll(() => {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      DROP TRIGGER IF EXISTS prevent_audit_delete;
      DROP TRIGGER IF EXISTS prevent_audit_update;
      DROP TABLE IF EXISTS result_history;
      DROP TABLE IF EXISTS tokens;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS audit_logs;
      DROP TABLE IF EXISTS results;
      DROP TABLE IF EXISTS students;
      DROP TABLE IF EXISTS courses;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS departments;
      DROP TABLE IF EXISTS security_settings;
    `);
    db.pragma('foreign_keys = ON');
    initDb();
  });

  describe('1. Authentication & Password Security (Bcrypt & Signed JWT)', () => {
    it('verifies seeded user passwords are hashed with bcrypt', () => {
      const admin = db.prepare(`SELECT password_hash FROM users WHERE id = 'usr-admin'`).get();
      expect(admin.password_hash).not.toBe('password123');
      expect(admin.password_hash.startsWith('$2a$') || admin.password_hash.startsWith('$2b$')).toBe(true);
      expect(comparePassword('password123', admin.password_hash)).toBe(true);
    });

    it('rejects bare forged x-user-id headers without signed JWT cookies', async () => {
      const res = await request(app)
        .get('/api/results')
        .set('x-user-id', 'usr-admin');

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/Authentication required/i);
    });

    it('authenticates admin and sets httpOnly JWT auth_token cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('Administrator');
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = res.headers['set-cookie'].join(';');
      expect(cookies).toMatch(/auth_token=/);
      adminCookie = res.headers['set-cookie'];
    });

    it('authenticates CS Department Officer', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'cs_officer', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('Department Officer');
      csOfficerCookie = res.headers['set-cookie'];
    });

    it('authenticates CS Lecturer', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'cs_lecturer1', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('Lecturer');
      csLecturerCookie = res.headers['set-cookie'];
    });
  });

  describe('2. RBAC & Departmental Scope Enforcement', () => {
    it('restricts Department Officer from viewing results outside their department', async () => {
      const res = await request(app)
        .get('/api/results/res-105') // Math department result
        .set('Cookie', csOfficerCookie);

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/i);
    });

    it('allows Department Officer to view results inside their department', async () => {
      const res = await request(app)
        .get('/api/results/res-101') // CS department result
        .set('Cookie', csOfficerCookie);

      expect(res.status).toBe(200);
      expect(res.body.result.id).toBe('res-101');
    });
  });

  describe('3. Lifecycle Rules & Optimistic Concurrency Control (OCC)', () => {
    it('enforces mandatory state transition: Uploaded -> Locked -> Published (Direct Uploaded -> Published fails)', async () => {
      // res-103 is Uploaded
      const res = await request(app)
        .post('/api/results/res-103/publish')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid lifecycle transition/i);
    });

    it('rejects update when version mismatch occurs (Optimistic Concurrency Control)', async () => {
      // Get current version of res-104
      const getRes = await request(app)
        .get('/api/results/res-104')
        .set('Cookie', adminCookie);

      const currentVersion = getRes.body.result.version;

      const updateRes = await request(app)
        .put('/api/results/res-104')
        .set('Cookie', adminCookie)
        .send({
          score: 75,
          version: currentVersion + 999, // Stale version
          reason: 'Test OCC'
        });

      expect(updateRes.status).toBe(409);
      expect(updateRes.body.error).toMatch(/Conflict/i);
    });
  });

  describe('4. Bulk Upload CSV Parsing & Complete History Tracking', () => {
    it('parses CSV data and records previous score (old_score) on record update', async () => {
      // res-104 has initial score 64.5
      const res = await request(app)
        .post('/api/results/bulk-upload')
        .set('Cookie', adminCookie)
        .send({
          rows: [
            { student_code: 'STU/2026/002', course_code: 'CS302', score: 82.5, session: '2025/2026', semester: 'First' }
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.successes[0].action).toBe('Updated');

      // Check history entry for res-104
      const histRes = await request(app)
        .get('/api/results/res-104')
        .set('Cookie', adminCookie);

      const updateHistory = histRes.body.history.find(h => h.action_type === 'BULK_UPDATE');
      expect(updateHistory).toBeDefined();
      expect(updateHistory.old_score).toBe(64.5);
      expect(updateHistory.new_score).toBe(82.5);
    });
  });

  describe('5. Audit Log Immutability & Department Officer Target Scope', () => {
    it('rejects updates to audit_logs table via SQL triggers', () => {
      expect(() => {
        db.prepare(`UPDATE audit_logs SET details = 'tampered' WHERE id = 'aud-001'`).run();
      }).toThrow(/append-only/i);
    });

    it('makes Admin actions on CS department results visible to CS Department Officer in audit logs', async () => {
      // Admin locks CS result res-103
      await request(app)
        .post('/api/results/res-103/lock')
        .set('Cookie', adminCookie);

      // CS Department Officer views audit logs
      const auditRes = await request(app)
        .get('/api/audit-logs')
        .set('Cookie', csOfficerCookie);

      expect(auditRes.status).toBe(200);
      const lockLog = auditRes.body.find(l => l.action === 'LOCK_RESULT' && l.actor_name.includes('Ogude Dean'));
      expect(lockLog).toBeDefined();
      expect(lockLog.department_id).toBe('dept-cs');
    });
  });
});
