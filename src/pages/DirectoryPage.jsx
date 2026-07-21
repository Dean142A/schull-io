import React, { useState, useEffect } from 'react';
import { Users, BookOpen, Building2, Search, RefreshCw } from 'lucide-react';

export default function DirectoryPage({ currentUser }) {
  const [data, setData] = useState({ students: [], courses: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('students');
  const [search, setSearch] = useState('');

  const fetchDirectory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/results/directory', {
        credentials: 'include'
      });
      const d = await res.json();
      setData(d);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="h1">Academic Registry & Course Directory</h1>
          <p className="small">View registered students, parent contact channels, and course lecturer assignments.</p>
        </div>

        <button className="btn btn-secondary" onClick={fetchDirectory}>
          <RefreshCw size={14} /> Refresh Directory
        </button>
      </div>

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
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student Code</th>
                <th>Full Name</th>
                <th>Department</th>
                <th>Parent Email</th>
                <th>Parent Phone</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }} className="caption">
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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '24px' }} className="caption">
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
