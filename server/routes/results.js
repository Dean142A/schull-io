import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import db from '../db.js';
import { authenticateUser, requireAuth, authorize } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/auditLogger.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticateUser);
router.use(requireAuth);

// Helper to calculate Grade from Score
function calculateGrade(score) {
  if (score >= 70) return 'A';
  if (score >= 60) return 'B';
  if (score >= 50) return 'C';
  if (score >= 45) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}

// GET /api/results/directory - Registered Students & Courses
router.get('/directory', (req, res) => {
  const students = db.prepare(`
    SELECT s.*, d.name as department_name 
    FROM students s 
    JOIN departments d ON s.department_id = d.id 
    ORDER BY s.student_code ASC
  `).all();

  const courses = db.prepare(`
    SELECT c.*, d.name as department_name, u.full_name as lecturer_name 
    FROM courses c 
    JOIN departments d ON c.department_id = d.id 
    LEFT JOIN users u ON c.lecturer_id = u.id 
    ORDER BY c.code ASC
  `).all();

  res.json({ students, courses });
});

// GET /api/results - Filtered by User Scope (Department/Course)
router.get('/', (req, res) => {
  const { role, department_id, id: userId } = req.user;

  let query = `
    SELECT r.*, 
           s.student_code, s.full_name as student_name, s.department_id as student_dept_id,
           c.code as course_code, c.title as course_title, c.department_id as course_dept_id, c.lecturer_id,
           d.name as department_name,
           (SELECT id FROM tokens WHERE result_id = r.id AND is_used = 0 AND is_invalidated = 0 AND expires_at > datetime('now') LIMIT 1) as active_token_id
    FROM results r
    JOIN students s ON r.student_id = s.id
    JOIN courses c ON r.course_id = c.id
    JOIN departments d ON c.department_id = d.id
  `;

  const params = [];
  const conditions = [];

  if (role === 'Department Officer') {
    conditions.push(`c.department_id = ?`);
    params.push(department_id);
  } else if (role === 'Lecturer') {
    conditions.push(`c.lecturer_id = ?`);
    params.push(userId);
  }

  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }

  query += ` ORDER BY c.code ASC, s.student_code ASC`;

  const results = db.prepare(query).all(...params);
  res.json(results);
});

// GET /api/results/:id - Fetch single result with detailed history
router.get('/:id', (req, res) => {
  const result = db.prepare(`
    SELECT r.*, 
           s.student_code, s.full_name as student_name,
           c.code as course_code, c.title as course_title, c.department_id as course_dept_id, c.lecturer_id,
           d.name as department_name
    FROM results r
    JOIN students s ON r.student_id = s.id
    JOIN courses c ON r.course_id = c.id
    JOIN departments d ON c.department_id = d.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!result) {
    return res.status(404).json({ error: 'Result not found' });
  }

  // Scope check
  if (req.user.role === 'Department Officer' && result.course_dept_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Result belongs to another department' });
  }
  if (req.user.role === 'Lecturer' && result.lecturer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: Result belongs to another course' });
  }

  const history = db.prepare(`
    SELECT * FROM result_history WHERE result_id = ? ORDER BY timestamp DESC
  `).all(req.params.id);

  res.json({ result, history });
});

// POST /api/results - Create/Upload single result (Draft or Uploaded state)
router.post('/', authorize('MODIFY_RESULTS'), (req, res) => {
  const { student_id, course_id, session, semester, score, status = 'Uploaded' } = req.body;

  if (!student_id || !course_id || !session || !semester || score === undefined) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const course = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(course_id);
  if (!course) {
    return res.status(404).json({ error: 'Course not found' });
  }

  // Scope verification
  if (req.user.role === 'Lecturer' && course.lecturer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: You are not assigned to this course.' });
  }
  if (req.user.role === 'Department Officer' && course.department_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Course is outside your department.' });
  }

  const numScore = parseFloat(score);
  if (isNaN(numScore) || numScore < 0 || numScore > 100) {
    return res.status(400).json({ error: 'Invalid score value (must be 0–100)' });
  }

  const grade = calculateGrade(numScore);
  const id = 'res-' + crypto.randomUUID();

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO results (id, student_id, course_id, session, semester, score, grade, status, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, student_id, course_id, session, semester, numScore, grade, status);

      // Record history
      db.prepare(`
        INSERT INTO result_history (id, result_id, actor_id, actor_name, action_type, old_score, new_score, old_status, new_status, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, null, ?, null, ?, ?, ?)
      `).run('hist-' + crypto.randomUUID(), id, req.user.id, req.user.full_name, 'INITIAL_UPLOAD', numScore, status, 'Initial upload', new Date().toISOString());

      recordAuditLog(req, 'RESULT_UPLOAD', { result_id: id, student_id, course_id, score: numScore, status });
    })();

    res.status(201).json({ message: 'Result uploaded successfully', id });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Duplicate entry: Student already has a result record for this course in the specified session/semester.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/results/bulk-upload - Partial success CSV upload
router.post('/bulk-upload', authorize('MODIFY_RESULTS'), upload.single('file'), (req, res) => {
  let rows = [];

  if (req.file) {
    const csvContent = req.file.buffer.toString('utf-8');
    try {
      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      rows = records.map((rec, i) => {
        const rowObj = {};
        for (const k of Object.keys(rec)) {
          rowObj[k.trim().toLowerCase()] = rec[k];
        }
        return { rowIndex: i + 2, ...rowObj };
      });
    } catch (err) {
      return res.status(400).json({ error: `CSV Parse Error: ${err.message}` });
    }
    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or missing data rows' });
    }
  } else if (req.body.rows) {
    rows = req.body.rows.map((r, i) => ({ rowIndex: i + 1, ...r }));
  } else {
    return res.status(400).json({ error: 'No CSV file or rows provided' });
  }

  const successReports = [];
  const errorReports = [];

  for (const row of rows) {
    try {
      const student_code = row.student_code;
      const course_code = row.course_code;
      const session = row.session || '2025/2026';
      const semester = row.semester || 'First';
      const score = parseFloat(row.score);

      if (!student_code || !course_code || isNaN(score)) {
        errorReports.push({ row: row.rowIndex, error: 'Missing student_code, course_code, or numeric score' });
        continue;
      }

      if (score < 0 || score > 100) {
        errorReports.push({ row: row.rowIndex, error: `Invalid score ${score} (must be 0-100)` });
        continue;
      }

      const student = db.prepare(`SELECT id, department_id FROM students WHERE student_code = ?`).get(student_code);
      if (!student) {
        errorReports.push({ row: row.rowIndex, error: `Student code '${student_code}' not found` });
        continue;
      }

      const course = db.prepare(`SELECT id, department_id, lecturer_id FROM courses WHERE code = ?`).get(course_code);
      if (!course) {
        errorReports.push({ row: row.rowIndex, error: `Course code '${course_code}' not found` });
        continue;
      }

      // Scope Check
      if (req.user.role === 'Department Officer' && course.department_id !== req.user.department_id) {
        errorReports.push({ row: row.rowIndex, error: `Course '${course_code}' belongs to a different department` });
        continue;
      }
      if (req.user.role === 'Lecturer' && course.lecturer_id !== req.user.id) {
        errorReports.push({ row: row.rowIndex, error: `You are not assigned to course '${course_code}'` });
        continue;
      }

      const existing = db.prepare(`SELECT id, score, status FROM results WHERE student_id = ? AND course_id = ? AND session = ? AND semester = ?`).get(
        student.id, course.id, session, semester
      );

      if (existing && (existing.status === 'Locked' || existing.status === 'Published') && req.user.role !== 'Administrator') {
        errorReports.push({ row: row.rowIndex, error: `Result is ${existing.status}. Non-admins cannot overwrite locked/published records via bulk upload.` });
        continue;
      }

      const grade = calculateGrade(score);

      if (existing) {
        // Update
        db.prepare(`UPDATE results SET score = ?, grade = ?, version = version + 1 WHERE id = ?`).run(score, grade, existing.id);
        db.prepare(`
          INSERT INTO result_history (id, result_id, actor_id, actor_name, action_type, old_score, new_score, old_status, new_status, reason, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('hist-' + crypto.randomUUID(), existing.id, req.user.id, req.user.full_name, 'BULK_UPDATE', existing.score, score, existing.status, existing.status, 'Bulk CSV update', new Date().toISOString());
        
        successReports.push({ row: row.rowIndex, student_code, course_code, action: 'Updated' });
      } else {
        // Create
        const newId = 'res-' + crypto.randomUUID();
        db.prepare(`
          INSERT INTO results (id, student_id, course_id, session, semester, score, grade, status, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Uploaded', 1)
        `).run(newId, student.id, course.id, session, semester, score, grade);
        
        db.prepare(`
          INSERT INTO result_history (id, result_id, actor_id, actor_name, action_type, old_score, new_score, old_status, new_status, reason, timestamp)
          VALUES (?, ?, ?, ?, ?, null, ?, null, 'Uploaded', ?, ?)
        `).run('hist-' + crypto.randomUUID(), newId, req.user.id, req.user.full_name, 'BULK_UPLOAD', score, 'Bulk CSV upload', new Date().toISOString());

        successReports.push({ row: row.rowIndex, student_code, course_code, action: 'Created' });
      }
    } catch (err) {
      errorReports.push({ row: row.rowIndex, error: err.message });
    }
  }

  recordAuditLog(req, 'BULK_RESULT_UPLOAD', { success_count: successReports.length, error_count: errorReports.length });

  res.json({
    message: `Processed ${rows.length} rows: ${successReports.length} successful, ${errorReports.length} failed.`,
    successes: successReports,
    errors: errorReports,
  });
});

// PUT /api/results/:id - Update score with Optimistic Concurrency Control & Admin Override support
router.put('/:id', authorize('MODIFY_RESULTS'), (req, res) => {
  const { score, version, reason } = req.body;
  const resultId = req.params.id;

  if (score === undefined || version === undefined) {
    return res.status(400).json({ error: 'Missing required parameters: score, version' });
  }

  const existing = db.prepare(`
    SELECT r.*, c.department_id as course_dept_id, c.lecturer_id
    FROM results r
    JOIN courses c ON r.course_id = c.id
    WHERE r.id = ?
  `).get(resultId);

  if (!existing) {
    return res.status(404).json({ error: 'Result not found' });
  }

  // 1. Optimistic Concurrency Control (Version check)
  if (existing.version !== parseInt(version, 10)) {
    return res.status(409).json({
      error: 'Conflict: Result has been modified by another user since you loaded it. Please refresh and try again.',
      current_version: existing.version,
    });
  }

  // 2. Scope & Status Rules
  if (req.user.role === 'Lecturer') {
    if (existing.lecturer_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to this course.' });
    }
    if (existing.status === 'Locked' || existing.status === 'Published') {
      return res.status(403).json({ error: 'Forbidden: Lecturers cannot modify results after they are Locked or Published.' });
    }
  }

  if (req.user.role === 'Department Officer') {
    if (existing.course_dept_id !== req.user.department_id) {
      return res.status(403).json({ error: 'Forbidden: Course belongs to another department.' });
    }
    if (existing.status === 'Locked' || existing.status === 'Published') {
      return res.status(403).json({ error: 'Forbidden: Modifications after locking/publishing require an Administrator override.' });
    }
  }

  // 3. Admin Override requirement for Locked / Published
  const isLockedOrPublished = existing.status === 'Locked' || existing.status === 'Published';
  if (isLockedOrPublished && (!reason || reason.trim().length === 0)) {
    return res.status(400).json({ error: 'Administrator override reason is mandatory when modifying a Locked or Published result.' });
  }

  const numScore = parseFloat(score);
  const grade = calculateGrade(numScore);
  const newVersion = existing.version + 1;

  db.transaction(() => {
    db.prepare(`
      UPDATE results 
      SET score = ?, grade = ?, version = ?
      WHERE id = ? AND version = ?
    `).run(numScore, grade, newVersion, resultId, existing.version);

    db.prepare(`
      INSERT INTO result_history (id, result_id, actor_id, actor_name, action_type, old_score, new_score, old_status, new_status, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'hist-' + crypto.randomUUID(), resultId, req.user.id, req.user.full_name,
      isLockedOrPublished ? 'ADMIN_OVERRIDE_MODIFY' : 'SCORE_UPDATE',
      existing.score, numScore, existing.status, existing.status,
      reason || 'Routine score update', new Date().toISOString()
    );

    recordAuditLog(req, isLockedOrPublished ? 'ADMIN_OVERRIDE_MODIFY_RESULT' : 'UPDATE_RESULT_SCORE', {
      result_id: resultId, old_score: existing.score, new_score: numScore, reason, version: newVersion
    });
  })();

  res.json({ message: 'Result updated successfully', version: newVersion, score: numScore, grade });
});

// POST /api/results/:id/lock (Uploaded -> Locked)
router.post('/:id/lock', authorize('LOCK_RESULTS'), (req, res) => {
  const resultId = req.params.id;

  const existing = db.prepare(`
    SELECT r.*, c.department_id as course_dept_id
    FROM results r
    JOIN courses c ON r.course_id = c.id
    WHERE r.id = ?
  `).get(resultId);

  if (!existing) {
    return res.status(404).json({ error: 'Result not found' });
  }

  if (req.user.role === 'Department Officer' && existing.course_dept_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Result belongs to another department.' });
  }

  if (existing.status === 'Locked' || existing.status === 'Published') {
    return res.status(400).json({ error: `Result is already in '${existing.status}' status.` });
  }

  const newVersion = existing.version + 1;

  db.transaction(() => {
    db.prepare(`UPDATE results SET status = 'Locked', version = ? WHERE id = ?`).run(newVersion, resultId);

    db.prepare(`
      INSERT INTO result_history (id, result_id, actor_id, actor_name, action_type, old_score, new_score, old_status, new_status, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('hist-' + crypto.randomUUID(), resultId, req.user.id, req.user.full_name, 'STATUS_LOCK', existing.score, existing.score, existing.status, 'Locked', 'Locked for verification', new Date().toISOString());

    recordAuditLog(req, 'LOCK_RESULT', { result_id: resultId, previous_status: existing.status });
  })();

  res.json({ message: 'Result locked successfully', status: 'Locked', version: newVersion });
});

// POST /api/results/:id/publish (Locked -> Published ONLY)
router.post('/:id/publish', authorize('PUBLISH_RESULTS'), (req, res) => {
  const resultId = req.params.id;

  const existing = db.prepare(`
    SELECT r.*, c.department_id as course_dept_id
    FROM results r
    JOIN courses c ON r.course_id = c.id
    WHERE r.id = ?
  `).get(resultId);

  if (!existing) {
    return res.status(404).json({ error: 'Result not found' });
  }

  if (req.user.role === 'Department Officer' && existing.course_dept_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Result belongs to another department.' });
  }

  // Requirement 2.3: Publishing is only permitted from the Locked state (cannot move directly from Uploaded to Published)
  if (existing.status !== 'Locked') {
    return res.status(400).json({
      error: `Invalid lifecycle transition: Cannot publish a result in '${existing.status}' status. Results must be 'Locked' before publishing.`
    });
  }

  const newVersion = existing.version + 1;

  db.transaction(() => {
    db.prepare(`UPDATE results SET status = 'Published', version = ? WHERE id = ?`).run(newVersion, resultId);

    db.prepare(`
      INSERT INTO result_history (id, result_id, actor_id, actor_name, action_type, old_score, new_score, old_status, new_status, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('hist-' + crypto.randomUUID(), resultId, req.user.id, req.user.full_name, 'STATUS_PUBLISH', existing.score, existing.score, existing.status, 'Published', 'Published to student/parent portal', new Date().toISOString());

    recordAuditLog(req, 'PUBLISH_RESULT', { result_id: resultId });
  })();

  res.json({ message: 'Result published successfully', status: 'Published', version: newVersion });
});

// POST /api/results/:id/unpublish (Published -> Locked, Admin ONLY, mandatory reason)
router.post('/:id/unpublish', authorize('UNPUBLISH_RESULTS'), (req, res) => {
  const resultId = req.params.id;
  const { reason } = req.body;

  if (!reason || reason.trim().length === 0) {
    return res.status(400).json({ error: 'A mandatory reason is required to unpublish a result.' });
  }

  const existing = db.prepare(`SELECT * FROM results WHERE id = ?`).get(resultId);
  if (!existing) {
    return res.status(404).json({ error: 'Result not found' });
  }

  if (existing.status !== 'Published') {
    return res.status(400).json({ error: `Result is not currently Published (current status: '${existing.status}').` });
  }

  const newVersion = existing.version + 1;

  db.transaction(() => {
    db.prepare(`UPDATE results SET status = 'Locked', version = ? WHERE id = ?`).run(newVersion, resultId);

    db.prepare(`
      INSERT INTO result_history (id, result_id, actor_id, actor_name, action_type, old_score, new_score, old_status, new_status, reason, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('hist-' + crypto.randomUUID(), resultId, req.user.id, req.user.full_name, 'UNPUBLISH', existing.score, existing.score, 'Published', 'Locked', reason, new Date().toISOString());

    recordAuditLog(req, 'UNPUBLISH_RESULT', { result_id: resultId, reason });
  })();

  res.json({ message: 'Result unpublished successfully and reverted to Locked state.', status: 'Locked', version: newVersion });
});

export default router;
