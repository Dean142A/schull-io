import Database from 'better-sqlite3';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'schull.db');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// Password and Token Utility Functions
export function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

export function comparePassword(password, hash) {
  if (!password || !hash) return false;
  return bcrypt.compareSync(password, hash);
}

// SHA-256 for single-use raw token hashing (Requirement: 48-bit typable SCH-XXXX-XXXX-XXXX token backed by SHA-256 storage, IP rate limiting & expiration)
export function hashValue(val) {
  return crypto.createHash('sha256').update(val).digest('hex');
}

export function generateRawToken() {
  // Generate readable high-entropy raw token, e.g. SCH-XXXX-XXXX-XXXX
  const bytes = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `SCH-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}`;
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Administrator', 'Teacher', 'Supervisor', 'Lecturer', 'Department Officer', 'Student', 'Parent/Student Viewer')),
      department_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      two_factor_enabled INTEGER NOT NULL DEFAULT 0,
      two_factor_secret TEXT,
      FOREIGN KEY(department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      department_id TEXT NOT NULL,
      lecturer_id TEXT,
      FOREIGN KEY(department_id) REFERENCES departments(id),
      FOREIGN KEY(lecturer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      student_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      department_id TEXT NOT NULL,
      parent_email TEXT,
      parent_phone TEXT,
      FOREIGN KEY(department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      session TEXT NOT NULL,
      semester TEXT NOT NULL,
      score REAL NOT NULL,
      grade TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Draft', 'Uploaded', 'Locked', 'Published')),
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(student_id) REFERENCES students(id),
      FOREIGN KEY(course_id) REFERENCES courses(id),
      UNIQUE(student_id, course_id, session, semester)
    );

    CREATE TABLE IF NOT EXISTS result_history (
      id TEXT PRIMARY KEY,
      result_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      old_score REAL,
      new_score REAL,
      old_status TEXT,
      new_status TEXT,
      reason TEXT,
      timestamp TEXT NOT NULL,
      FOREIGN KEY(result_id) REFERENCES results(id)
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      result_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_used INTEGER NOT NULL DEFAULT 0,
      used_at TEXT,
      is_invalidated INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(result_id) REFERENCES results(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      result_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      FOREIGN KEY(result_id) REFERENCES results(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_name TEXT,
      actor_role TEXT,
      department_id TEXT,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      user_agent TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS security_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS result_appeals (
      id TEXT PRIMARY KEY,
      result_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Pending', 'Reviewed', 'Rejected', 'Resolved')),
      created_at TEXT NOT NULL,
      FOREIGN KEY(result_id) REFERENCES results(id)
    );

    CREATE TABLE IF NOT EXISTS ip_rate_limits (
      ip_address TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS login_rate_limits (
      ip_address TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_attempt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ip_blocklist (
      ip_address TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      blocked_at TEXT NOT NULL,
      blocked_by TEXT
    );

    -- Indexing for performance as audit volume grows
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_ip ON audit_logs(ip_address);
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_token_hash ON tokens(token_hash);
  `);

  // Enforce append-only on audit_logs via triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_update
    BEFORE UPDATE ON audit_logs
    BEGIN
      SELECT RAISE(FAIL, 'Audit log entries are immutable and append-only.');
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_audit_delete
    BEFORE DELETE ON audit_logs
    BEGIN
      SELECT RAISE(FAIL, 'Audit log entries cannot be deleted.');
    END;
  `);

  // Initialize Security Settings
  const setThreshold = db.prepare(`INSERT OR IGNORE INTO security_settings (key, value) VALUES ('suspicious_threshold', '5')`);
  const setTokenExpiry = db.prepare(`INSERT OR IGNORE INTO security_settings (key, value) VALUES ('token_expiry_hours', '24')`);
  setThreshold.run();
  setTokenExpiry.run();

  // Column Migrations
  const safeMigrate = (sql) => {
    try {
      db.exec(sql);
    } catch (e) {
      if (!e.message?.includes('duplicate column') && !e.message?.includes('already exists')) {
        throw e;
      }
    }
  };

  safeMigrate(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
  safeMigrate(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;`);
  safeMigrate(`ALTER TABLE users ADD COLUMN locked_until TEXT;`);
  safeMigrate(`ALTER TABLE users ADD COLUMN two_factor_pending_secret TEXT;`);
  safeMigrate(`ALTER TABLE users ADD COLUMN email TEXT;`);
  safeMigrate(`ALTER TABLE tokens ADD COLUMN dispatched_at TEXT;`);
  safeMigrate(`ALTER TABLE tokens ADD COLUMN dispatched_to TEXT;`);

  // Seed Data if empty
  const userCount = db.prepare(`SELECT count(*) as count FROM users`).get();
  if (userCount.count === 0) {
    seedData();
  }

  // Ensure demo user emails are populated and accounts are unlocked with default password hash
  const defaultPasswordHash = hashPassword('password123');
  const demoUsers = [
    { id: 'usr-admin', username: 'admin', email: 'admin@schull.io', name: 'System Administrator (Ogude Dean)', role: 'Administrator', dept: null },
    { id: 'usr-supervisor-simple', username: 'supervisor', email: 'supervisor@schull.io', name: 'Academic Supervisor (Prof. Alan Turing)', role: 'Supervisor', dept: null },
    { id: 'usr-officer-cs', username: 'cs_officer', email: 'cs_officer@schull.io', name: 'Dr. Sarah Connor', role: 'Department Officer', dept: 'dept-cs' },
    { id: 'usr-officer-simple', username: 'officer', email: 'officer@schull.io', name: 'Dr. Sarah Connor', role: 'Department Officer', dept: 'dept-cs' },
    { id: 'usr-officer-math', username: 'math_officer', email: 'math_officer@schull.io', name: 'Prof. Alan Turing', role: 'Department Officer', dept: 'dept-math' },
    { id: 'usr-teacher-simple', username: 'teacher', email: 'teacher@schull.io', name: 'Dr. Grace Hopper', role: 'Teacher', dept: 'dept-cs' },
    { id: 'usr-lecturer-cs1', username: 'cs_lecturer1', email: 'cs_lecturer1@schull.io', name: 'Dr. Grace Hopper', role: 'Teacher', dept: 'dept-cs' },
    { id: 'usr-lecturer-simple', username: 'lecturer', email: 'lecturer@schull.io', name: 'Dr. Grace Hopper', role: 'Teacher', dept: 'dept-cs' },
    { id: 'usr-lecturer-math1', username: 'math_lecturer1', email: 'math_lecturer1@schull.io', name: 'Dr. Katherine Johnson', role: 'Teacher', dept: 'dept-math' },
  ];

  for (const demo of demoUsers) {
    const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(demo.username);
    if (existing) {
      db.prepare(`UPDATE users SET email = ?, password_hash = ?, failed_login_attempts = 0, locked_until = NULL, is_active = 1 WHERE username = ?`).run(demo.email, defaultPasswordHash, demo.username);
    } else {
      db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(demo.id, demo.username, demo.email, defaultPasswordHash, demo.name, demo.role, demo.dept);
    }
  }

  // Migration: Upgrade any legacy SHA-256 password hashes to bcrypt
  const users = db.prepare(`SELECT id, password_hash FROM users`).all();
  for (const u of users) {
    if (u.password_hash.length === 64) {
      db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword('password123'), u.id);
    }
  }
}

function seedData() {
  console.log('[schull.io] Seeding initial database data...');

  // Departments
  db.prepare(`INSERT INTO departments (id, name, code) VALUES (?, ?, ?)`).run('dept-cs', 'Computer Science', 'CS');
  db.prepare(`INSERT INTO departments (id, name, code) VALUES (?, ?, ?)`).run('dept-math', 'Mathematics & Statistics', 'MATH');

  const defaultPassword = hashPassword('password123');

  // Users
  // Admin
  db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'usr-admin', 'admin', 'admin@schull.io', defaultPassword, 'System Administrator (Ogude Dean)', 'Administrator', null
  );

  // Department Officers
  db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'usr-officer-cs', 'cs_officer', 'cs_officer@schull.io', defaultPassword, 'Dr. Sarah Connor', 'Department Officer', 'dept-cs'
  );
  db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'usr-officer-simple', 'officer', 'officer@schull.io', defaultPassword, 'Dr. Sarah Connor', 'Department Officer', 'dept-cs'
  );
  db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'usr-officer-math', 'math_officer', 'math_officer@schull.io', defaultPassword, 'Prof. Alan Turing', 'Department Officer', 'dept-math'
  );

  // Lecturers
  db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'usr-lecturer-cs1', 'cs_lecturer1', 'cs_lecturer1@schull.io', defaultPassword, 'Dr. Grace Hopper', 'Lecturer', 'dept-cs'
  );
  db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'usr-lecturer-simple', 'lecturer', 'lecturer@schull.io', defaultPassword, 'Dr. Grace Hopper', 'Lecturer', 'dept-cs'
  );
  db.prepare(`INSERT OR IGNORE INTO users (id, username, email, password_hash, full_name, role, department_id) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    'usr-lecturer-math1', 'math_lecturer1', 'math_lecturer1@schull.io', defaultPassword, 'Dr. Katherine Johnson', 'Lecturer', 'dept-math'
  );

  // Courses
  db.prepare(`INSERT INTO courses (id, code, title, department_id, lecturer_id) VALUES (?, ?, ?, ?, ?)`).run(
    'crs-cs101', 'CS101', 'Introduction to Computer Science', 'dept-cs', 'usr-lecturer-cs1'
  );
  db.prepare(`INSERT INTO courses (id, code, title, department_id, lecturer_id) VALUES (?, ?, ?, ?, ?)`).run(
    'crs-cs302', 'CS302', 'Distributed Systems & Security', 'dept-cs', 'usr-lecturer-cs1'
  );
  db.prepare(`INSERT INTO courses (id, code, title, department_id, lecturer_id) VALUES (?, ?, ?, ?, ?)`).run(
    'crs-mth201', 'MTH201', 'Linear Algebra & Calculus', 'dept-math', 'usr-lecturer-math1'
  );

  // Students
  const students = [
    { id: 'std-001', code: 'STU/2026/001', name: 'Alex Johnson', dept: 'dept-cs', email: 'parent.johnson@example.com', phone: '+15550192834' },
    { id: 'std-002', code: 'STU/2026/002', name: 'Brenda Vance', dept: 'dept-cs', email: 'parent.vance@example.com', phone: '+15550192835' },
    { id: 'std-003', code: 'STU/2026/003', name: 'Charles Xavier', dept: 'dept-math', email: 'parent.xavier@example.com', phone: '+15550192836' },
    { id: 'std-004', code: 'STU/2026/004', name: 'Diana Prince', dept: 'dept-math', email: 'parent.prince@example.com', phone: '+15550192837' },
    { id: 'std-005', code: 'STU/2026/005', name: 'Evan Wright', dept: 'dept-cs', email: 'parent.wright@example.com', phone: '+15550192838' },
  ];

  for (const s of students) {
    db.prepare(`INSERT OR REPLACE INTO students (id, student_code, full_name, department_id, parent_email, parent_phone) VALUES (?, ?, ?, ?, ?, ?)`).run(
      s.id, s.code, s.name, s.dept, s.email, s.phone
    );
  }

  // Sample Results in various lifecycle states
  // Alex Johnson - CS101 - Published
  db.prepare(`INSERT INTO results (id, student_id, course_id, session, semester, score, grade, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'res-101', 'std-001', 'crs-cs101', '2025/2026', 'First', 88.5, 'A', 'Published', 1
  );

  // Alex Johnson - CS302 - Locked
  db.prepare(`INSERT INTO results (id, student_id, course_id, session, semester, score, grade, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'res-102', 'std-001', 'crs-cs302', '2025/2026', 'First', 79.0, 'B', 'Locked', 1
  );

  // Brenda Vance - CS101 - Uploaded
  db.prepare(`INSERT INTO results (id, student_id, course_id, session, semester, score, grade, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'res-103', 'std-002', 'crs-cs101', '2025/2026', 'First', 92.0, 'A', 'Uploaded', 1
  );

  // Brenda Vance - CS302 - Draft
  db.prepare(`INSERT INTO results (id, student_id, course_id, session, semester, score, grade, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'res-104', 'std-002', 'crs-cs302', '2025/2026', 'First', 64.5, 'C', 'Draft', 1
  );

  // Charles Xavier - MTH201 - Published
  db.prepare(`INSERT INTO results (id, student_id, course_id, session, semester, score, grade, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'res-105', 'std-003', 'crs-mth201', '2025/2026', 'First', 95.0, 'A', 'Published', 1
  );

  // Seed initial audit log entry
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, department_id, action, details, ip_address, user_agent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'aud-001', 'usr-admin', 'System Administrator (Ogude Dean)', 'Administrator', null,
    'SYSTEM_INIT', 'Database initialized and seeded with initial records.',
    '127.0.0.1', 'schull-internal/1.0', new Date().toISOString()
  );

  console.log('[schull.io] Seed complete.');
}

export default db;
