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
      DROP TABLE IF EXISTS result_appeals;
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

  describe('1. Authentication & Password Security (Strict Login & Deactivation)', () => {
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

    it('STRICTLY REJECTS login attempts using only userId without a password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ userId: 'usr-admin' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Username and password are required/i);
    });

    it('authenticates admin with valid username and password, setting httpOnly auth_token cookie', async () => {
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

    it('allows dev role switcher route in development mode', async () => {
      const res = await request(app)
        .post('/api/auth/dev-switch-user')
        .send({ userId: 'usr-officer-cs' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('Department Officer');
      csOfficerCookie = res.headers['set-cookie'];
    });

    it('authenticates CS Lecturer', async () => {
      const res = await request(app)
        .post('/api/auth/dev-switch-user')
        .send({ userId: 'usr-lecturer-cs1' });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('Lecturer');
      csLecturerCookie = res.headers['set-cookie'];
    });

    it('immediately revokes authentication when a user account is deactivated (is_active = 0)', async () => {
      // Deactivate lecturer account in DB
      db.prepare(`UPDATE users SET is_active = 0 WHERE id = 'usr-lecturer-cs1'`).run();

      const res = await request(app)
        .get('/api/results')
        .set('Cookie', csLecturerCookie);

      expect(res.status).toBe(401);

      // Reactivate account for subsequent tests
      db.prepare(`UPDATE users SET is_active = 1 WHERE id = 'usr-lecturer-cs1'`).run();
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
      // res-105 is Uploaded
      const res = await request(app)
        .post('/api/results/res-105/publish')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Invalid lifecycle transition/i);
    });

    it('rejects update when version mismatch occurs (Optimistic Concurrency Control)', async () => {
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

  describe('4. Token Portal Strict Cookie Enforcement & Input Normalization', () => {
    let portalCookie = '';
    let rawToken = '';

    it('generates token and normalizes token redemption input (trim & lowercase input)', async () => {
      // Generate token for res-101 (Published)
      const genRes = await request(app)
        .post('/api/tokens/generate')
        .set('Cookie', adminCookie)
        .send({ result_id: 'res-101' });

      expect(genRes.status).toBe(201);
      rawToken = genRes.body.raw_token;

      // Redeem token with lowercase & whitespace padding
      const redeemRes = await request(app)
        .post('/api/tokens/redeem')
        .send({ raw_token: `  ${rawToken.toLowerCase()}  ` });

      expect(redeemRes.status).toBe(200);
      // Verify session_token is omitted from JSON body (cookie-only)
      expect(redeemRes.body.session_token).toBeUndefined();
      expect(redeemRes.headers['set-cookie']).toBeDefined();
      portalCookie = redeemRes.headers['set-cookie'];
    });

    it('views result using httpOnly session cookie and rejects x-session-token header fallback', async () => {
      // Cookie authenticated request
      const viewRes = await request(app)
        .get('/api/tokens/view-result')
        .set('Cookie', portalCookie);

      expect(viewRes.status).toBe(200);
      expect(viewRes.body.result.course_code).toBe('CS101');

      // Header fallback request (rejected)
      const headerRes = await request(app)
        .get('/api/tokens/view-result')
        .set('x-session-token', 'ses-test-invalid');

      expect(headerRes.status).toBe(401);
    });
  });

  describe('5. Bulk Upload CSV Edge Cases & Score Rounding', () => {
    it('rounds score to 1 decimal place and detects duplicate rows within the same CSV batch', async () => {
      const res = await request(app)
        .post('/api/results/bulk-upload')
        .set('Cookie', adminCookie)
        .send({
          rows: [
            { student_code: 'stu/2026/002', course_code: 'cs302', score: 88.5499, session: '2025/2026', semester: 'First' },
            { student_code: 'STU/2026/002', course_code: 'CS302', score: 95.0, session: '2025/2026', semester: 'First' } // Batch duplicate
          ]
        });

      expect(res.status).toBe(200);
      expect(res.body.successes.length).toBe(1);
      expect(res.body.errors.length).toBe(1);
      expect(res.body.errors[0].error).toMatch(/Duplicate entry/i);

      // Verify rounded score stored as 88.5
      const checkRes = await request(app)
        .get('/api/results/res-104')
        .set('Cookie', adminCookie);

      expect(checkRes.body.result.score).toBe(88.5);
    });
  });

  describe('6. Audit Log Immutability & Department Officer Scope', () => {
    it('rejects updates to audit_logs table via SQL triggers', () => {
      expect(() => {
        db.prepare(`UPDATE audit_logs SET details = 'tampered' WHERE id = 'aud-001'`).run();
      }).toThrow(/append-only/i);
    });

    it('makes Admin actions on CS department results visible to CS Department Officer in audit logs', async () => {
      await request(app)
        .post('/api/results/res-103/lock')
        .set('Cookie', adminCookie);

      const auditRes = await request(app)
        .get('/api/audit-logs')
        .set('Cookie', csOfficerCookie);

      expect(auditRes.status).toBe(200);
      const lockLog = auditRes.body.find(l => l.action === 'LOCK_RESULT' && l.actor_name.includes('Ogude Dean'));
      expect(lockLog).toBeDefined();
      expect(lockLog.department_id).toBe('dept-cs');
    });
  });

  describe('7. High-Value Feature Extensions (Lockout, Directory Management, Result Appeals)', () => {
    it('locks account after 5 consecutive failed login attempts and unlocks via Admin security route', async () => {
      // 5 failed password attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({ username: 'cs_lecturer1', password: 'wrongpassword' });
      }

      // 6th attempt should return 429 Account Locked
      const lockedRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'cs_lecturer1', password: 'wrongpassword' });

      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error).toMatch(/Account.*locked/i);

      // Admin unlocks account
      const unlockRes = await request(app)
        .post('/api/security/unlock-user')
        .set('Cookie', adminCookie)
        .send({ user_id: 'usr-lecturer-cs1' });

      expect(unlockRes.status).toBe(200);

      // Verify user can now log in cleanly
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username: 'cs_lecturer1', password: 'password123' });

      expect(loginRes.status).toBe(200);
    });

    it('registers and updates student and course records via staff directory endpoints', async () => {
      // Register student
      const stdRes = await request(app)
        .post('/api/results/directory/students')
        .set('Cookie', csOfficerCookie)
        .send({
          student_code: 'STU/2026/099',
          full_name: 'Test New Student',
          department_id: 'dept-cs',
          parent_email: 'parent.test@example.com'
        });

      expect(stdRes.status).toBe(201);
      const newStdId = stdRes.body.id;

      // Update student
      const updateStdRes = await request(app)
        .put(`/api/results/directory/students/${newStdId}`)
        .set('Cookie', csOfficerCookie)
        .send({
          full_name: 'Updated Student Name',
          parent_email: 'updated.parent@example.com',
          parent_phone: '+15559998888'
        });

      expect(updateStdRes.status).toBe(200);

      // Create course
      const crsRes = await request(app)
        .post('/api/results/directory/courses')
        .set('Cookie', csOfficerCookie)
        .send({
          code: 'CS499',
          title: 'Advanced Security Capstone',
          department_id: 'dept-cs'
        });

      expect(crsRes.status).toBe(201);
      const newCrsId = crsRes.body.id;

      // Update course
      const updateCrsRes = await request(app)
        .put(`/api/results/directory/courses/${newCrsId}`)
        .set('Cookie', csOfficerCookie)
        .send({
          title: 'Updated Capstone Title',
          lecturer_id: 'usr-lecturer-cs1'
        });

      expect(updateCrsRes.status).toBe(200);
    });

    it('submits result appeal, blocks duplicate pending appeal, and allows staff to review and resolve appeal', async () => {
      // Generate & redeem token for Published result res-101
      const genRes = await request(app)
        .post('/api/tokens/generate')
        .set('Cookie', adminCookie)
        .send({ result_id: 'res-101' });

      const redeemRes = await request(app)
        .post('/api/tokens/redeem')
        .send({ raw_token: genRes.body.raw_token });

      const cookie = redeemRes.headers['set-cookie'];

      // Submit appeal
      const appealRes = await request(app)
        .post('/api/tokens/appeal')
        .set('Cookie', cookie)
        .send({ reason: 'Discrepancy in continuous assessment grade' });

      expect(appealRes.status).toBe(201);
      expect(appealRes.body.message).toMatch(/submitted successfully/i);
      const appealId = appealRes.body.appeal_id;

      // Duplicate appeal attempt (rejected with 409)
      const dupRes = await request(app)
        .post('/api/tokens/appeal')
        .set('Cookie', cookie)
        .send({ reason: 'Duplicate appeal submission attempt' });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toMatch(/Conflict/i);

      // Verify active appeal attached on view-result
      const viewRes = await request(app)
        .get('/api/tokens/view-result')
        .set('Cookie', cookie);

      expect(viewRes.body.result.active_appeal).toBeDefined();
      expect(viewRes.body.result.active_appeal.status).toBe('Pending');

      // Staff transition appeal status to Resolved
      const resolveRes = await request(app)
        .post(`/api/results/appeals/${appealId}/status`)
        .set('Cookie', csOfficerCookie)
        .send({ status: 'Resolved', note: 'Score verified against original script' });

      expect(resolveRes.status).toBe(200);
    });
  });
});
