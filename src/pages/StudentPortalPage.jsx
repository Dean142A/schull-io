import React, { useState, useEffect } from 'react';
import { GraduationCap, TrendingUp, Award, BookOpen, Search, CheckCircle, Clock, Calendar, ArrowUpRight, ArrowDownRight, Layers, FileText, Printer } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import TranscriptPdfModal from '../components/TranscriptPdfModal';

export default function StudentPortalPage({ currentUser }) {
  const [studentCodeInput, setStudentCodeInput] = useState('STU/2026/001');
  const [selectedStudentCode, setSelectedStudentCode] = useState('STU/2026/001');
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transcriptModalOpen, setTranscriptModalOpen] = useState(false);

  const demoStudents = [
    { code: 'STU/2026/001', name: 'Alex Johnson (Computer Science)' },
    { code: 'STU/2026/002', name: 'Brenda Vance (Computer Science)' },
    { code: 'STU/2026/003', name: 'Charles Xavier (Mathematics)' },
  ];

  const fetchStudentHistory = async (code) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/results/student/${encodeURIComponent(code)}/history`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to fetch student performance history');

      setStudentData(data);
    } catch (err) {
      setError(err.message);
      setStudentData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentHistory(selectedStudentCode);
  }, [selectedStudentCode]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (studentCodeInput.trim()) {
      setSelectedStudentCode(studentCodeInput.trim());
    }
  };

  const student = studentData?.student;
  const terms = studentData?.terms || [];
  const growthTrajectory = studentData?.growthTrajectory || 0;
  const overallAvg = studentData?.overallAverage || 0;
  const totalCourses = studentData?.totalCoursesTaken || 0;

  // Calculate estimated GPA (4.0 Scale)
  const estimatedGpa = (Number(overallAvg) / 100 * 4.0).toFixed(2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1 className="h1">Student Multi-Term Performance & Progress Portal</h1>
            <span className="badge badge-published" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', fontWeight: 700 }}>
              Academic Growth Portal
            </span>
          </div>
          <p className="small">Track term-over-term academic performance, GPA progress, and subject grade trends.</p>
        </div>

        {studentData && (
          <button className="btn btn-primary" onClick={() => setTranscriptModalOpen(true)}>
            <FileText size={16} /> Download Official PDF Transcript
          </button>
        )}
      </div>

      {/* Student Lookup & Demo Switcher Bar */}
      <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
            <input
              type="text"
              className="form-control"
              placeholder="Enter Student Matriculation Code (e.g. STU-2025-001)"
              value={studentCodeInput}
              onChange={(e) => setStudentCodeInput(e.target.value)}
              style={{ paddingLeft: '38px', width: '100%' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching...' : 'View Performance History'}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span className="caption" style={{ fontWeight: 600 }}>Quick Student Switcher:</span>
          {demoStudents.map(s => (
            <button
              key={s.code}
              className={`btn btn-sm ${selectedStudentCode === s.code ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setStudentCodeInput(s.code);
                setSelectedStudentCode(s.code);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {student && (
        <>
          {/* Student Profile Card & Top Performance Metrics */}
          <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)', border: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  background: 'var(--color-primary-subtle)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '20px'
                }}>
                  <GraduationCap size={28} />
                </div>
                <div>
                  <h2 className="h2" style={{ fontSize: '22px' }}>{student.full_name}</h2>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="caption" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Matric Code: {student.student_code}</span>
                    <span className="caption">&bull;</span>
                    <span className="caption" style={{ fontWeight: 600 }}>Department: {student.department_name}</span>
                  </div>
                </div>
              </div>

              {growthTrajectory !== 0 && (
                <div className="badge" style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-pill)',
                  background: growthTrajectory > 0 ? '#ECFDF5' : '#FEF2F2',
                  color: growthTrajectory > 0 ? '#047857' : '#B91C1C',
                  border: `1px solid ${growthTrajectory > 0 ? '#A7F3D0' : '#FCA5A5'}`
                }}>
                  {growthTrajectory > 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  <strong>{growthTrajectory > 0 ? `+${growthTrajectory}%` : `${growthTrajectory}%`} Term Improvement Trajectory</strong>
                </div>
              )}
            </div>

            {/* Quick Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
              <div style={{ padding: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-muted)', marginBottom: '4px' }}>
                  <Award size={16} /> <span className="caption">Cumulative Average</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-primary)' }}>{overallAvg} / 100</div>
              </div>

              <div style={{ padding: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-muted)', marginBottom: '4px' }}>
                  <TrendingUp size={16} /> <span className="caption">Est. GPA (4.00 Scale)</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-success)' }}>{estimatedGpa}</div>
              </div>

              <div style={{ padding: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-muted)', marginBottom: '4px' }}>
                  <BookOpen size={16} /> <span className="caption">Completed Courses</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700 }}>{totalCourses} Subjects</div>
              </div>

              <div style={{ padding: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-muted)', marginBottom: '4px' }}>
                  <Layers size={16} /> <span className="caption">Academic Terms</span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700 }}>{terms.length} Terms</div>
              </div>
            </div>
          </div>

          {/* Multi-Term Progress & Historical Comparison */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 className="h2" style={{ fontSize: '20px' }}>Term-by-Term Progress & Subject Comparison</h2>
              <span className="caption">Historical Academic Record</span>
            </div>

            {terms.map((term, index) => (
              <div key={term.termLabel} className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Calendar size={20} style={{ color: 'var(--color-primary)' }} />
                    <h3 className="h3" style={{ fontSize: '18px' }}>{term.termLabel}</h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="caption" style={{ fontWeight: 600 }}>Term Average:</span>
                    <div style={{
                      padding: '4px 12px',
                      background: 'var(--color-primary-subtle)',
                      color: 'var(--color-primary)',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-pill)',
                      fontSize: '15px'
                    }}>
                      {term.average} / 100
                    </div>

                    {index === 0 && (
                      <span className="badge badge-published">Current Term</span>
                    )}
                  </div>
                </div>

                {/* Course Results Table */}
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Course Code</th>
                        <th>Course Title</th>
                        <th>Lifecycle Status</th>
                        <th>Score</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {term.results.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 700 }}>{r.course_code}</td>
                          <td>{r.course_title}</td>
                          <td><StatusBadge status={r.status} /></td>
                          <td style={{ fontWeight: 700, color: Number(r.score) < 40 ? 'var(--color-error)' : 'var(--color-ink)' }}>
                            {r.score}
                          </td>
                          <td>
                            <span className={`badge ${r.grade === 'A' ? 'badge-published' : (r.grade === 'F' ? 'badge-draft' : '')}`} style={{ fontWeight: 700 }}>
                              {r.grade}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <TranscriptPdfModal
        isOpen={transcriptModalOpen}
        onClose={() => setTranscriptModalOpen(false)}
        studentData={studentData}
      />
    </div>
  );
}
