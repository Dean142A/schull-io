import express from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import db, { hashPassword } from '../db.js';
import { authenticateUser, requireAuth, authorize } from '../middleware/auth.js';
import { recordAuditLog } from '../middleware/auditLogger.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/results/student/:studentCode/history - Multi-term performance & term comparison for student portal (Public Access)
router.get('/student/:studentCode/history', (req, res) => {
  const { studentCode } = req.params;
  const normalized = studentCode.trim().replace(/-/g, '/');

  const student = db.prepare(`
    SELECT s.*, d.name as department_name, d.code as department_code
    FROM students s
    LEFT JOIN departments d ON s.department_id = d.id
    WHERE LOWER(s.student_code) = LOWER(?) OR LOWER(s.student_code) = LOWER(?) OR s.id = ?
  `).get(studentCode, normalized, studentCode);

  if (!student) {
    return res.status(404).json({ error: `Student record matching code '${studentCode}' was not found.` });
  }

  const results = db.prepare(`
    SELECT r.*, c.code as course_code, c.title as course_title
    FROM results r
    JOIN courses c ON r.course_id = c.id
    WHERE r.student_id = ?
    ORDER BY r.session DESC, r.semester DESC
  `).all(student.id);

  // Group by Term (Session + Semester)
  const termMap = {};
  results.forEach(r => {
    const termKey = `${r.session} (${r.semester} Semester)`;
    if (!termMap[termKey]) {
      termMap[termKey] = {
        session: r.session,
        semester: r.semester,
        termLabel: termKey,
        results: [],
        totalScore: 0,
        count: 0,
        average: 0
      };
    }
    termMap[termKey].results.push(r);
    termMap[termKey].totalScore += Number(r.score) || 0;
    termMap[termKey].count += 1;
  });

  const terms = Object.values(termMap).map(term => {
    term.average = term.count > 0 ? Number((term.totalScore / term.count).toFixed(1)) : 0;
    return term;
  });

  // Calculate Overall Averages and Growth Trajectory
  const overallAvg = results.length > 0 ? (results.reduce((a, b) => a + Number(b.score), 0) / results.length).toFixed(1) : 0;
  
  let growthTrajectory = 0;
  if (terms.length >= 2) {
    const latestAvg = terms[0].average;
    const previousAvg = terms[1].average;
    growthTrajectory = Number((latestAvg - previousAvg).toFixed(1));
  }

  res.json({
    student,
    overallAverage: overallAvg,
    growthTrajectory,
    terms,
    totalCoursesTaken: results.length
  });
});

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

  const departments = db.prepare(`SELECT * FROM departments ORDER BY name ASC`).all();
  const lecturers = db.prepare(`
    SELECT u.id, u.username, u.email, u.full_name, u.role, u.department_id, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.role IN ('Teacher', 'Supervisor')
    ORDER BY u.full_name ASC
  `).all();

  res.json({ students, courses, departments, lecturers });
});

// POST /api/results/directory/students - Register New Student (Admin or Supervisor own dept)
router.post('/directory/students', authorize('MODIFY_RESULTS'), (req, res) => {
  const { student_code, full_name, department_id, parent_email, parent_phone } = req.body;

  if (!student_code || !full_name || !department_id) {
    return res.status(400).json({ error: 'student_code, full_name, and department_id are required' });
  }

  // Supervisor Scope Check
  if (req.user.role === 'Supervisor' && department_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: You can only register students for your assigned department.' });
  }

  const id = 'std-' + crypto.randomUUID();

  try {
    db.prepare(`
      INSERT INTO students (id, student_code, full_name, department_id, parent_email, parent_phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, student_code.trim().toUpperCase(), full_name.trim(), department_id, parent_email?.trim() || null, parent_phone?.trim() || null);

    recordAuditLog(req, 'STUDENT_REGISTERED', { student_id: id, student_code: student_code.trim().toUpperCase(), full_name: full_name.trim() });

    res.status(201).json({ message: 'Student registered successfully', id });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: `Student code '${student_code}' is already registered.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/results/directory/courses - Create New Course (Admin or Supervisor own dept)
router.post('/directory/courses', authorize('MODIFY_RESULTS'), (req, res) => {
  const { code, title, department_id, lecturer_id } = req.body;

  if (!code || !title || !department_id) {
    return res.status(400).json({ error: 'code, title, and department_id are required' });
  }

  if (req.user.role === 'Supervisor' && department_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: You can only create courses in your assigned department.' });
  }

  const id = 'crs-' + crypto.randomUUID();

  try {
    db.prepare(`
      INSERT INTO courses (id, code, title, department_id, lecturer_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, code.trim().toUpperCase(), title.trim(), department_id, lecturer_id || null);

    recordAuditLog(req, 'COURSE_CREATED', { course_id: id, code: code.trim().toUpperCase(), title: title.trim() });

    res.status(201).json({ message: 'Course created successfully', id });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: `Course code '${code}' already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
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

  if (role === 'Supervisor') {
    conditions.push(`c.department_id = ?`);
    params.push(department_id);
  } else if (role === 'Teacher') {
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
  if (req.user.role === 'Supervisor' && result.course_dept_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Result belongs to another department' });
  }
  if (req.user.role === 'Teacher' && result.lecturer_id !== req.user.id) {
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
  if (req.user.role === 'Teacher' && course.lecturer_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: You are not assigned to this course.' });
  }
  if (req.user.role === 'Supervisor' && course.department_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Course is outside your department.' });
  }

  const numScore = Math.round(parseFloat(score) * 10) / 10;
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
  const seenInBatch = new Set();

  for (const row of rows) {
    try {
      const student_code = row.student_code?.trim();
      const course_code = row.course_code?.trim();
      const session = row.session?.trim() || '2025/2026';
      const semester = row.semester?.trim() || 'First';
      const rawScore = parseFloat(row.score);

      if (!student_code || !course_code || isNaN(rawScore)) {
        errorReports.push({ row: row.rowIndex, error: 'Missing student_code, course_code, or numeric score' });
        continue;
      }

      const score = Math.round(rawScore * 10) / 10;

      if (score < 0 || score > 100) {
        errorReports.push({ row: row.rowIndex, error: `Invalid score ${score} (must be 0-100)` });
        continue;
      }

      // Batch Duplicate Detection
      const batchKey = `${student_code.toUpperCase()}_${course_code.toUpperCase()}_${session}_${semester}`;
      if (seenInBatch.has(batchKey)) {
        errorReports.push({ row: row.rowIndex, error: `Duplicate entry for student '${student_code}' and course '${course_code}' in the same upload batch.` });
        continue;
      }
      seenInBatch.add(batchKey);

      // Case-Insensitive Student Lookup
      const student = db.prepare(`SELECT id, department_id FROM students WHERE UPPER(student_code) = UPPER(?)`).get(student_code);
      if (!student) {
        errorReports.push({ row: row.rowIndex, error: `Student code '${student_code}' not found` });
        continue;
      }

      // Case-Insensitive Course Lookup
      const course = db.prepare(`SELECT id, department_id, lecturer_id FROM courses WHERE UPPER(code) = UPPER(?)`).get(course_code);
      if (!course) {
        errorReports.push({ row: row.rowIndex, error: `Course code '${course_code}' not found` });
        continue;
      }

      // Scope Check
      if (req.user.role === 'Supervisor' && course.department_id !== req.user.department_id) {
        errorReports.push({ row: row.rowIndex, error: `Course '${course_code}' belongs to a different department` });
        continue;
      }
      if (req.user.role === 'Teacher' && course.lecturer_id !== req.user.id) {
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
  if (req.user.role === 'Teacher') {
    if (existing.lecturer_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden: You are not assigned to this course.' });
    }
    if (existing.status === 'Locked' || existing.status === 'Published') {
      return res.status(403).json({ error: 'Forbidden: Teachers cannot modify results after they are Locked or Published.' });
    }
  }

  if (req.user.role === 'Supervisor') {
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

  const numScore = Math.round(parseFloat(score) * 10) / 10;
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

  if (req.user.role === 'Supervisor' && existing.course_dept_id !== req.user.department_id) {
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

  if (req.user.role === 'Supervisor' && existing.course_dept_id !== req.user.department_id) {
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

// GET /api/results/appeals - Staff view submitted result verification appeals
router.get('/appeals', authorize('MODIFY_RESULTS'), (req, res) => {
  let query = `
    SELECT a.*, r.score, r.grade, r.status as result_status,
           s.student_code, s.full_name as student_name,
           c.code as course_code, c.title as course_title, c.department_id
    FROM result_appeals a
    JOIN results r ON a.result_id = r.id
    JOIN students s ON r.student_id = s.id
    JOIN courses c ON r.course_id = c.id
  `;
  const params = [];

  if (req.user.role === 'Supervisor') {
    query += ` WHERE c.department_id = ?`;
    params.push(req.user.department_id);
  }

  query += ` ORDER BY a.created_at DESC`;

  const appeals = db.prepare(query).all(...params);
  res.json(appeals);
});

// POST /api/results/appeals/:id/status - Staff review & update appeal status
router.post('/appeals/:id/status', authorize('MODIFY_RESULTS'), (req, res) => {
  const { status, note } = req.body;
  const appealId = req.params.id;

  if (!['Reviewed', 'Resolved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Reviewed, Resolved, or Rejected.' });
  }

  const appeal = db.prepare(`SELECT * FROM result_appeals WHERE id = ?`).get(appealId);
  if (!appeal) {
    return res.status(404).json({ error: 'Appeal not found' });
  }

  db.prepare(`UPDATE result_appeals SET status = ? WHERE id = ?`).run(status, appealId);

  recordAuditLog(req, 'APPEAL_STATUS_UPDATE', { appeal_id: appealId, result_id: appeal.result_id, new_status: status, note });

  res.json({ message: `Appeal status updated to ${status}` });
});

// PUT /api/results/directory/students/:id - Edit Student Info
router.put('/directory/students/:id', authorize('MODIFY_RESULTS'), (req, res) => {
  const studentId = req.params.id;
  const { full_name, parent_email, parent_phone } = req.body;

  const existing = db.prepare(`SELECT * FROM students WHERE id = ?`).get(studentId);
  if (!existing) {
    return res.status(404).json({ error: 'Student not found' });
  }

  if (req.user.role === 'Supervisor' && existing.department_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Student belongs to another department.' });
  }

  db.prepare(`
    UPDATE students SET full_name = ?, parent_email = ?, parent_phone = ? WHERE id = ?
  `).run(full_name.trim(), parent_email?.trim() || null, parent_phone?.trim() || null, studentId);

  recordAuditLog(req, 'STUDENT_UPDATED', { student_id: studentId, full_name: full_name.trim() });

  res.json({ message: 'Student record updated successfully' });
});

// PUT /api/results/directory/courses/:id - Edit Course Info & Teacher Assignment
router.put('/directory/courses/:id', authorize('MODIFY_RESULTS'), (req, res) => {
  const courseId = req.params.id;
  const { title, lecturer_id } = req.body;

  const existing = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(courseId);
  if (!existing) {
    return res.status(404).json({ error: 'Course not found' });
  }

  if (req.user.role === 'Supervisor' && existing.department_id !== req.user.department_id) {
    return res.status(403).json({ error: 'Forbidden: Course belongs to another department.' });
  }

  db.prepare(`
    UPDATE courses SET title = ?, lecturer_id = ? WHERE id = ?
  `).run(title.trim(), lecturer_id || null, courseId);

  recordAuditLog(req, 'COURSE_UPDATED', { course_id: courseId, title: title.trim(), lecturer_id });

  res.json({ message: 'Course record updated successfully' });
});

// POST /api/results/directory/staff - Register New Staff Member (Admin only)
router.post('/directory/staff', (req, res) => {
  if (req.user.role !== 'Administrator') {
    return res.status(403).json({ error: 'Forbidden: Only Administrators can register staff members.' });
  }

  const { full_name, username, email, role, department_id, assigned_courses, new_course } = req.body;

  if (!full_name || !username || !email || !role || !department_id) {
    return res.status(400).json({ error: 'full_name, username, email, role, and department_id are required' });
  }

  if (!['Teacher', 'Supervisor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be Teacher or Supervisor.' });
  }

  const existing = db.prepare(`SELECT id FROM users WHERE username = ? OR email = ?`).get(username.trim().toLowerCase(), email.trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'A staff member with this username or email already exists.' });
  }

  const userId = 'usr-' + crypto.randomUUID();
  const defaultPassword = 'password123';
  const passwordHash = hashPassword(defaultPassword);

  db.transaction(() => {
    // 1. Insert user
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, full_name, role, department_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, username.trim().toLowerCase(), email.trim().toLowerCase(), passwordHash, full_name.trim(), role, department_id);

    // 2. If new course details are provided, create the new course on the fly!
    if (new_course && new_course.code && new_course.title) {
      const courseId = 'crs-' + crypto.randomUUID();
      db.prepare(`
        INSERT INTO courses (id, code, title, department_id, lecturer_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(courseId, new_course.code.trim().toUpperCase(), new_course.title.trim(), department_id, userId);

      recordAuditLog(req, 'COURSE_CREATED', { course_id: courseId, code: new_course.code.trim().toUpperCase(), title: new_course.title.trim() });
    }

    // 3. Assign existing courses
    if (Array.isArray(assigned_courses) && assigned_courses.length > 0) {
      for (const courseId of assigned_courses) {
        db.prepare(`UPDATE courses SET lecturer_id = ? WHERE id = ?`).run(userId, courseId);
      }
    }
  })();

  // Simulated Email Dispatch details
  const portalLink = `${req.protocol}://${req.get('host')}/`;
  const dispatchLog = `
    --------------------------------------------------
    SIMULATED EMAIL DISPATCH TO: ${email.trim()}
    SUBJECT: Welcome to schull.io - Staff Portal Access Details
    BODY:
    Hello ${full_name.trim()},
    Your profile has been created successfully as a ${role}.
    Your portal access credentials:
    - Portal Link: ${portalLink}
    - Username: ${username.trim().toLowerCase()}
    - Password: ${defaultPassword}
    Please setup your 2FA TOTP code upon first log in.
    --------------------------------------------------
  `;
  console.log(dispatchLog);

  recordAuditLog(req, 'STAFF_REGISTERED', { user_id: userId, username: username.trim().toLowerCase(), role, email: email.trim().toLowerCase() });
  recordAuditLog(req, 'EMAIL_DISPATCHED_NEW_USER', { user_id: userId, email: email.trim().toLowerCase() });

  res.status(201).json({
    message: `Staff registered successfully. Onboarding email sent to ${email.trim()}.`,
    userId,
    simulatedEmail: dispatchLog
  });
});

export default router;
