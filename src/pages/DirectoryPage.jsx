import React, { useState, useEffect } from 'react';
import { Users, BookOpen, Building2, Search, RefreshCw, Plus, CheckCircle, AlertCircle, X, Edit, Sparkles } from 'lucide-react';
import OnboardingTour from '../components/OnboardingTour';

export default function DirectoryPage({ currentUser }) {
  const [data, setData] = useState({ students: [], courses: [], departments: [], lecturers: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('students');
  const [search, setSearch] = useState('');

  // Onboarding Tour State
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('schull_tour_directory')) {
      setTourOpen(true);
    }
  }, []);

  const directoryTourSteps = [
    {
      targetId: 'tour-dir-header',
      title: 'Academic Registry Directory',
      description: 'Manage student profiles, parent contact channels for token delivery, and department course assignments.'
    },
    {
      targetId: 'tour-dir-actions',
      title: 'Register Students & Courses',
      description: 'Department Officers and Admins can register new students with parent contact emails and create department courses.'
    },
    {
      targetId: 'tour-dir-table',
      title: 'Student Contact & Course Roster',
      description: 'View student matriculation codes, parent email/phone contact details, and assigned course lecturers.'
    }
  ];

  // Modals state
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [editCourse, setEditCourse] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New Student Form
  const [studentForm, setStudentForm] = useState({
    student_code: '',
    full_name: '',
    department_id: '',
    parent_email: '',
    parent_phone: ''
  });

  // New Course Form
  const [courseForm, setCourseForm] = useState({
    code: '',
    title: '',
    department_id: '',
    lecturer_id: ''
  });

  const fetchDirectory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/results/directory', {
        credentials: 'include'
      });
      const d = await res.json();
      setData(d);
      if (currentUser?.role === 'Department Officer' && currentUser?.department_id) {
        setStudentForm(prev => ({ ...prev, department_id: currentUser.department_id }));
        setCourseForm(prev => ({ ...prev, department_id: currentUser.department_id }));
      } else if (d.departments?.length > 0) {
        setStudentForm(prev => ({ ...prev, department_id: d.departments[0].id }));
        setCourseForm(prev => ({ ...prev, department_id: d.departments[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchDirectory();
    }
  }, [currentUser]);

  if (!currentUser) {
    return <div className="caption" style={{ padding: '24px' }}>Loading session profile...</div>;
  }

  const isStaffManager = currentUser.role === 'Administrator' || currentUser.role === 'Department Officer';

  const handleRegisterStudent = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/results/directory/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(studentForm)
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setSuccess(resData.message);
      setShowStudentModal(false);
      setStudentForm({ student_code: '', full_name: '', department_id: studentForm.department_id, parent_email: '', parent_phone: '' });
      fetchDirectory();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/results/directory/students/${editStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editStudent)
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setSuccess(resData.message);
      setEditStudent(null);
      fetchDirectory();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/results/directory/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(courseForm)
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setSuccess(resData.message);
      setShowCourseModal(false);
      setCourseForm({ code: '', title: '', department_id: courseForm.department_id, lecturer_id: '' });
      fetchDirectory();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateCourse = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/results/directory/courses/${editCourse.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editCourse)
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setSuccess(resData.message);
      setEditCourse(null);
      fetchDirectory();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredStudents = data.students.filter(s =>
    s.full_name.toLowerCase().includes(search.toLowerCase()) ||
    s.student_code.toLowerCase().includes(search.toLowerCase()) ||
    s.department_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredCourses = data.courses.filter(c =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.department_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <OnboardingTour
        tourKey="directory"
        steps={directoryTourSteps}
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div id="tour-dir-header">
          <h1 className="h1">Academic Registry & Course Directory</h1>
          <p className="small">Manage registered students, parent contact channels, and course lecturer assignments.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }} id="tour-dir-actions">
          <button className="btn btn-secondary" onClick={() => setTourOpen(true)}>
            <Sparkles size={14} style={{ color: 'var(--color-primary)' }} /> Take Guided Tour
          </button>
          {isStaffManager && (
            <>
              <button className="btn btn-primary" onClick={() => setShowStudentModal(true)}>
                <Plus size={14} /> Register Student
              </button>
              <button className="btn btn-secondary" onClick={() => setShowCourseModal(true)}>
                <Plus size={14} /> Create Course
              </button>
            </>
          )}
          <button className="btn btn-secondary" onClick={fetchDirectory}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', color: '#991B1B', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '6px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {/* Filter Bar */}
      <div className="card" style={{ padding: '14px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <input
          type="text"
          className="form-control"
          placeholder="Search by name, code, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '280px' }}
        />

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn btn-sm ${tab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('students')}
          >
            <Users size={12} /> Students ({filteredStudents.length})
          </button>

          <button
            className={`btn btn-sm ${tab === 'courses' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('courses')}
          >
            <BookOpen size={12} /> Courses ({filteredCourses.length})
          </button>
        </div>
      </div>

      {/* Students Table */}
      {tab === 'students' && (
        <div className="table-container" id="tour-dir-table">
          <table>
            <thead>
              <tr>
                <th>Student Code</th>
                <th>Full Name</th>
                <th>Department</th>
                <th>Parent Email</th>
                <th>Parent Phone</th>
                {isStaffManager && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isStaffManager ? 6 : 5} style={{ textAlign: 'center', padding: '24px' }} className="caption">
                    Loading registry data...
                  </td>
                </tr>
              ) : (
                filteredStudents.map(s => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.student_code}</td>
                    <td style={{ fontWeight: 500 }}>{s.full_name}</td>
                    <td>{s.department_name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{s.parent_email}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{s.parent_phone}</td>
                    {isStaffManager && (
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditStudent(s)}>
                          <Edit size={12} /> Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Courses Table */}
      {tab === 'courses' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Course Code</th>
                <th>Course Title</th>
                <th>Department</th>
                <th>Assigned Lecturer</th>
                {isStaffManager && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isStaffManager ? 5 : 4} style={{ textAlign: 'center', padding: '24px' }} className="caption">
                    Loading course directory...
                  </td>
                </tr>
              ) : (
                filteredCourses.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.code}</td>
                    <td style={{ fontWeight: 500 }}>{c.title}</td>
                    <td>{c.department_name}</td>
                    <td>{c.lecturer_name || 'Unassigned'}</td>
                    {isStaffManager && (
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditCourse(c)}>
                          <Edit size={12} /> Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Student Modal */}
      {showStudentModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="h2">Register New Student</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowStudentModal(false)}><X size={14} /></button>
            </div>
            <form onSubmit={handleRegisterStudent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="caption">Student Code (e.g. STU/2026/009)</label>
                <input type="text" className="form-control" required value={studentForm.student_code} onChange={e => setStudentForm({ ...studentForm, student_code: e.target.value })} />
              </div>
              <div>
                <label className="caption">Full Name</label>
                <input type="text" className="form-control" required value={studentForm.full_name} onChange={e => setStudentForm({ ...studentForm, full_name: e.target.value })} />
              </div>
              <div>
                <label className="caption">Department</label>
                <select className="form-control" disabled={currentUser.role === 'Department Officer'} value={studentForm.department_id} onChange={e => setStudentForm({ ...studentForm, department_id: e.target.value })}>
                  {data.departments?.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="caption">Parent Email</label>
                <input type="email" className="form-control" value={studentForm.parent_email} onChange={e => setStudentForm({ ...studentForm, parent_email: e.target.value })} />
              </div>
              <div>
                <label className="caption">Parent Phone</label>
                <input type="tel" className="form-control" value={studentForm.parent_phone} onChange={e => setStudentForm({ ...studentForm, parent_phone: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowStudentModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Student</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editStudent && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="h2">Edit Student: {editStudent.student_code}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditStudent(null)}><X size={14} /></button>
            </div>
            <form onSubmit={handleUpdateStudent} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="caption">Full Name</label>
                <input type="text" className="form-control" required value={editStudent.full_name} onChange={e => setEditStudent({ ...editStudent, full_name: e.target.value })} />
              </div>
              <div>
                <label className="caption">Parent Email</label>
                <input type="email" className="form-control" value={editStudent.parent_email || ''} onChange={e => setEditStudent({ ...editStudent, parent_email: e.target.value })} />
              </div>
              <div>
                <label className="caption">Parent Phone</label>
                <input type="tel" className="form-control" value={editStudent.parent_phone || ''} onChange={e => setEditStudent({ ...editStudent, parent_phone: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditStudent(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update Student</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Course Modal */}
      {showCourseModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="h2">Create New Course</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCourseModal(false)}><X size={14} /></button>
            </div>
            <form onSubmit={handleCreateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="caption">Course Code (e.g. CS401)</label>
                <input type="text" className="form-control" required value={courseForm.code} onChange={e => setCourseForm({ ...courseForm, code: e.target.value })} />
              </div>
              <div>
                <label className="caption">Course Title</label>
                <input type="text" className="form-control" required value={courseForm.title} onChange={e => setCourseForm({ ...courseForm, title: e.target.value })} />
              </div>
              <div>
                <label className="caption">Department</label>
                <select className="form-control" disabled={currentUser.role === 'Department Officer'} value={courseForm.department_id} onChange={e => setCourseForm({ ...courseForm, department_id: e.target.value })}>
                  {data.departments?.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="caption">Assigned Lecturer (Optional)</label>
                <select className="form-control" value={courseForm.lecturer_id} onChange={e => setCourseForm({ ...courseForm, lecturer_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {data.lecturers?.map(l => (
                    <option key={l.id} value={l.id}>{l.full_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCourseModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Course</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editCourse && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="h2">Edit Course: {editCourse.code}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditCourse(null)}><X size={14} /></button>
            </div>
            <form onSubmit={handleUpdateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="caption">Course Title</label>
                <input type="text" className="form-control" required value={editCourse.title} onChange={e => setEditCourse({ ...editCourse, title: e.target.value })} />
              </div>
              <div>
                <label className="caption">Assigned Lecturer</label>
                <select className="form-control" value={editCourse.lecturer_id || ''} onChange={e => setEditCourse({ ...editCourse, lecturer_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {data.lecturers?.map(l => (
                    <option key={l.id} value={l.id}>{l.full_name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditCourse(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Update Course</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
