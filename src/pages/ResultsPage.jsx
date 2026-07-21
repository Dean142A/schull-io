import React, { useState, useEffect } from 'react';
import StatusBadge from '../components/StatusBadge';
import OnboardingTour from '../components/OnboardingTour';
import {
  Lock, CheckCircle, RotateCcw, Edit, Key, UploadCloud,
  History, AlertCircle, Check, X, ShieldAlert, Plus, FileSpreadsheet, Sparkles,
  Download, Award, TrendingUp, AlertTriangle, BookOpen
} from 'lucide-react';

export default function ResultsPage({ currentUser }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [editModalResult, setEditModalResult] = useState(null);
  const [editScore, setEditScore] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const [unpublishModalResult, setUnpublishModalResult] = useState(null);
  const [unpublishReason, setUnpublishReason] = useState('');

  const [tokenModalData, setTokenModalData] = useState(null);

  const [historyModalResult, setHistoryModalResult] = useState(null);
  const [historyData, setHistoryData] = useState([]);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkReport, setBulkReport] = useState(null);

  // Appeals State
  const [appeals, setAppeals] = useState([]);
  const [activeTab, setActiveTab] = useState('results'); // 'results' | 'appeals'

  // Onboarding Tour State
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('schull_tour_results')) {
      setTourOpen(true);
    }
  }, []);

  const resultsTourSteps = [
    {
      targetId: 'tour-results-header',
      title: 'Academic Results Directory',
      description: 'Welcome to the Results Directory! Manage student scores through formal lifecycle states: Draft → Uploaded → Locked → Published.'
    },
    {
      targetId: 'tour-upload-actions',
      title: 'Score Upload Options',
      description: 'Authorized staff can upload individual student grades or import entire class spreadsheets via Bulk CSV Upload.'
    },
    {
      targetId: 'tour-filter-bar',
      title: 'Search & Status Filtering',
      description: 'Filter records by student name, code, or lifecycle status to quickly find and review grade entries.'
    },
    {
      targetId: 'tour-results-table',
      title: 'Cryptographic Tokens & Audit History',
      description: 'Once a result is Published, generate single-use parent verification tokens or view the immutable audit trail of score modifications.'
    },
    {
      targetId: 'tour-appeals-tab',
      title: 'Result Verification Appeals',
      description: 'Department Officers and Administrators can review and resolve grade verification appeals submitted by parents.'
    }
  ];

  const fetchAppeals = async () => {
    try {
      const res = await fetch('/api/results/appeals', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setAppeals(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateAppealStatus = async (appealId, newStatus) => {
    try {
      const res = await fetch(`/api/results/appeals/${appealId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`Appeal status updated to ${newStatus}`);
      fetchAppeals();
    } catch (err) {
      setError(err.message);
    }
  };

  const [singleUploadOpen, setSingleUploadOpen] = useState(false);
  const [newResultForm, setNewResultForm] = useState({
    student_id: 'std-001',
    course_id: 'crs-cs101',
    session: '2025/2026',
    semester: 'First',
    score: '',
  });

  const fetchResults = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/results', {
        credentials: 'include'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch results');
      }
      const data = await res.json();
      setResults(data);
      if (currentUser.role === 'Administrator' || currentUser.role === 'Department Officer') {
        fetchAppeals();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchResults();
    }
  }, [currentUser]);

  if (!currentUser) {
    return <div className="caption" style={{ padding: '24px' }}>Loading session profile...</div>;
  }

  // Lock Action
  const handleLock = async (resultId) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/results/${resultId}/lock`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Result locked successfully.');
      fetchResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // Publish Action
  const handlePublish = async (resultId) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/results/${resultId}/publish`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Result published successfully.');
      fetchResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // Unpublish Action (Admin only)
  const submitUnpublish = async () => {
    if (!unpublishReason.trim()) {
      setError('A mandatory reason is required to unpublish a result.');
      return;
    }
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/results/${unpublishModalResult.id}/unpublish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ reason: unpublishReason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Result unpublished successfully and returned to Locked status.');
      setUnpublishModalResult(null);
      setUnpublishReason('');
      fetchResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // Edit / Admin Override Submission (With OCC version check)
  const submitEdit = async () => {
    const isLockedOrPublished = editModalResult.status === 'Locked' || editModalResult.status === 'Published';
    if (isLockedOrPublished && !overrideReason.trim()) {
      setError('Administrator override reason is required for locked or published results.');
      return;
    }

    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/results/${editModalResult.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          score: editScore,
          version: editModalResult.version, // OCC version passing
          reason: overrideReason
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess('Result score updated successfully.');
      setEditModalResult(null);
      setEditScore('');
      setOverrideReason('');
      fetchResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // Token Generation
  const handleGenerateToken = async (resultId) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/tokens/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ result_id: resultId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTokenModalData(data);
      fetchResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // View Audit History
  const handleViewHistory = async (result) => {
    setHistoryModalResult(result);
    setHistoryData([]);
    try {
      const res = await fetch(`/api/results/${result.id}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.history) {
        setHistoryData(data.history);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Bulk Upload Submission
  const handleBulkUpload = async () => {
    setError('');
    setBulkReport(null);

    const lines = bulkCsvText.trim().split('\n');
    if (lines.length === 0) {
      setError('CSV content cannot be empty');
      return;
    }

    try {
      const res = await fetch('/api/results/bulk-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          rows: lines.map(line => {
            const parts = line.split(',').map(p => p.trim());
            return {
              student_code: parts[0],
              course_code: parts[1],
              score: parts[2],
              session: parts[3] || '2025/2026',
              semester: parts[4] || 'First'
            };
          })
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setBulkReport(data);
      fetchResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // Single Upload Submission
  const handleSingleUpload = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(newResultForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess('Single result uploaded successfully');
      setSingleUploadOpen(false);
      setNewResultForm({ student_id: 'std-001', course_id: 'crs-cs101', session: '2025/2026', semester: 'First', score: '' });
      fetchResults();
    } catch (err) {
      setError(err.message);
    }
  };

  // Lecturer Gradebook & Class Analytics Calculations
  const isLecturer = currentUser?.role === 'Lecturer';

  const scoresList = results.map(r => Number(r.score) || 0);
  const totalStudents = scoresList.length;
  const avgScore = totalStudents > 0 ? (scoresList.reduce((a, b) => a + b, 0) / totalStudents).toFixed(1) : 0;
  const highestScore = totalStudents > 0 ? Math.max(...scoresList).toFixed(1) : 0;
  const lowestScore = totalStudents > 0 ? Math.min(...scoresList).toFixed(1) : 0;
  const passCount = scoresList.filter(s => s >= 40.0).length;
  const passRate = totalStudents > 0 ? Math.round((passCount / totalStudents) * 100) : 0;
  const lowScoreAlerts = results.filter(r => Number(r.score) < 40.0);

  const gradeCounts = {
    A: scoresList.filter(s => s >= 70).length,
    B: scoresList.filter(s => s >= 60 && s < 70).length,
    C: scoresList.filter(s => s >= 50 && s < 60).length,
    D: scoresList.filter(s => s >= 45 && s < 50).length,
    E: scoresList.filter(s => s >= 40 && s < 45).length,
    F: scoresList.filter(s => s < 40).length,
  };

  const handleDownloadLecturerCsvTemplate = () => {
    let csv = 'student_code,student_name,course_code,session,semester,score\n';
    results.forEach(r => {
      csv += `"${r.student_code}","${r.student_name}","${r.course_code}","2025/2026","First","${r.score}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lecturer_Gradebook_Template_${currentUser?.username || 'staff'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = results.filter(r => {
    const matchesSearch =
      r.student_name.toLowerCase().includes(search.toLowerCase()) ||
      r.student_code.toLowerCase().includes(search.toLowerCase()) ||
      r.course_code.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <OnboardingTour
        tourKey="results"
        steps={resultsTourSteps}
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
      />

      {/* Header Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div id="tour-results-header">
          <h1 className="h1">Academic Results Directory</h1>
          <p className="small">Manage scores through lifecycle states: Draft → Uploaded → Locked → Published</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }} id="tour-upload-actions">
          <button className="btn btn-secondary" onClick={() => setTourOpen(true)}>
            Take Guided Tour
          </button>
          {(currentUser.role === 'Lecturer' || currentUser.role === 'Department Officer' || currentUser.role === 'Administrator') && (
            <>
              <button className="btn btn-secondary" onClick={() => setSingleUploadOpen(true)}>
                <Plus size={14} /> Upload Single Score
              </button>
              <button className="btn btn-secondary" onClick={() => setBulkModalOpen(true)}>
                <FileSpreadsheet size={14} /> Bulk CSV Import
              </button>
            </>
          )}
        </div>
      </div>

      {/* Lecturer Dedicated Class Analytics & Gradebook Hub */}
      {isLecturer && (
        <div className="card" style={{ padding: '20px', background: 'linear-gradient(135deg, #FAF8FF 0%, #FFFFFF 100%)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', background: 'var(--color-primary-subtle)', borderRadius: '8px', color: 'var(--color-primary)' }}>
                <BookOpen size={20} />
              </div>
              <div>
                <h2 className="h2">Lecturer Gradebook & Class Performance Hub</h2>
                <p className="small">Teaching Staff Workspace &bull; Assigned Course Analytics & Course CSV Template Exporter</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadLecturerCsvTemplate}>
                <Download size={14} /> Download Course CSV Template
              </button>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <div style={{ padding: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
              <span className="caption">Class Average Score</span>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-primary)', marginTop: '2px' }}>{avgScore} / 100</div>
            </div>

            <div style={{ padding: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
              <span className="caption">Class Pass Rate</span>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-success)', marginTop: '2px' }}>{passRate}%</div>
            </div>

            <div style={{ padding: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
              <span className="caption">Highest / Lowest Score</span>
              <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '2px' }}>{highestScore} / {lowestScore}</div>
            </div>

            <div style={{ padding: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)' }}>
              <span className="caption">Low-Score Warnings (&lt;40)</span>
              <div style={{ fontSize: '20px', fontWeight: 700, color: lowScoreAlerts.length > 0 ? 'var(--color-error)' : 'var(--color-muted)', marginTop: '2px' }}>
                {lowScoreAlerts.length} Student{lowScoreAlerts.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Grade Distribution Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="caption" style={{ fontWeight: 600 }}>Grade Distribution (A: 70+ | B: 60-69 | C: 50-59 | D: 45-49 | E: 40-44 | F: &lt;40)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {Object.entries(gradeCounts).map(([grade, count]) => (
                <div key={grade} className="badge" style={{ background: grade === 'F' && count > 0 ? '#FEF2F2' : 'var(--color-canvas)', color: grade === 'F' && count > 0 ? 'var(--color-error)' : 'var(--color-ink)', border: '1px solid var(--color-border)' }}>
                  <strong>{grade}:</strong> {count} Student{count !== 1 ? 's' : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Global Alerts */}
      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <Check size={16} /> <span>{success}</span>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="card" id="tour-filter-bar" style={{ padding: '14px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by student name, code, or course..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '280px' }}
          />

          {(currentUser.role === 'Administrator' || currentUser.role === 'Department Officer') && (
            <div style={{ display: 'flex', gap: '6px' }} id="tour-appeals-tab">
              <button
                className={`btn btn-sm ${activeTab === 'results' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('results')}
              >
                Results Directory
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'appeals' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('appeals')}
              >
                Verification Appeals ({appeals.filter(a => a.status === 'Pending').length} Pending)
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="caption">Status:</span>
          {['ALL', 'Draft', 'Uploaded', 'Locked', 'Published'].map(st => (
            <button
              key={st}
              className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter(st)}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Results Data Table */}
      {activeTab === 'results' && (
        <div className="table-container" id="tour-results-table">
        <table>
          <thead>
            <tr>
              <th>Student Code</th>
              <th>Student Name</th>
              <th>Course</th>
              <th>Department</th>
              <th>Score</th>
              <th>Grade</th>
              <th>Lifecycle State</th>
              <th>Version</th>
              <th>Active Token</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '24px' }} className="caption">
                  Loading results...
                </td>
              </tr>
            ) : filteredResults.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '24px' }} className="caption">
                  No matching student result records found.
                </td>
              </tr>
            ) : (
              filteredResults.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.student_code}</td>
                  <td>{r.student_name}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.course_code}</div>
                    <div className="caption">{r.course_title}</div>
                  </td>
                  <td>{r.department_name}</td>
                  <td style={{ fontWeight: 700 }}>{r.score.toFixed(1)}</td>
                  <td>
                    <span style={{ fontWeight: 700, padding: '2px 8px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '4px' }}>
                      {r.grade}
                    </span>
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="caption">v{r.version}</td>
                  <td>
                    {r.active_token_id ? (
                      <span className="badge badge-published" style={{ fontSize: '11px' }}>
                        <Key size={10} /> Active
                      </span>
                    ) : (
                      <span className="caption">None</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                      {/* Token Generation */}
                      {(currentUser.role === 'Administrator' || currentUser.role === 'Department Officer') && (r.status === 'Locked' || r.status === 'Published') && (
                        <button
                          className="btn btn-sm btn-primary"
                          title="Generate Access Token"
                          onClick={() => handleGenerateToken(r.id)}
                        >
                          <Key size={12} /> Generate
                        </button>
                      )}

                      {/* Edit Score */}
                      <button
                        className="btn btn-sm btn-secondary"
                        title="Edit score"
                        onClick={() => {
                          setEditModalResult(r);
                          setEditScore(r.score.toString());
                          setOverrideReason('');
                        }}
                      >
                        <Edit size={12} /> Edit
                      </button>

                      {/* Lock (Uploaded -> Locked) */}
                      {(currentUser.role === 'Administrator' || currentUser.role === 'Department Officer') && r.status === 'Uploaded' && (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleLock(r.id)}>
                          <Lock size={12} style={{ color: 'var(--color-warning)' }} /> Lock
                        </button>
                      )}

                      {/* Publish (Locked -> Published ONLY) */}
                      {(currentUser.role === 'Administrator' || currentUser.role === 'Department Officer') && r.status === 'Locked' && (
                        <button className="btn btn-sm btn-secondary" onClick={() => handlePublish(r.id)}>
                          <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> Publish
                        </button>
                      )}

                      {/* Unpublish (Published -> Locked, Admin ONLY) */}
                      {currentUser.role === 'Administrator' && r.status === 'Published' && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            setUnpublishModalResult(r);
                            setUnpublishReason('');
                          }}
                        >
                          <RotateCcw size={12} /> Unpublish
                        </button>
                      )}

                      {/* History */}
                      <button className="btn btn-sm btn-tertiary" onClick={() => handleViewHistory(r)}>
                        <History size={12} /> History
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Appeals Table */}
      {activeTab === 'appeals' && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Student Code & Name</th>
                <th>Course</th>
                <th>Score & Grade</th>
                <th>Appeal Reason</th>
                <th>Submitted Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {appeals.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px' }} className="caption">
                    No result verification appeals submitted yet.
                  </td>
                </tr>
              ) : (
                appeals.map(appeal => (
                  <tr key={appeal.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{appeal.student_name}</div>
                      <div className="caption">{appeal.student_code}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{appeal.course_code}</div>
                      <div className="caption">{appeal.course_title}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{appeal.score.toFixed(1)} ({appeal.grade})</div>
                    </td>
                    <td style={{ maxWidth: '250px', fontSize: '13px' }}>
                      {appeal.reason}
                    </td>
                    <td className="caption">
                      {new Date(appeal.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${appeal.status === 'Pending' ? 'badge-warning' : (appeal.status === 'Resolved' ? 'badge-published' : 'badge-draft')}`}>
                        {appeal.status}
                      </span>
                    </td>
                    <td>
                      {appeal.status === 'Pending' && (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleUpdateAppealStatus(appeal.id, 'Resolved')}
                          >
                            Resolve
                          </button>
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleUpdateAppealStatus(appeal.id, 'Rejected')}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit / Override Modal */}
      {editModalResult && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="h2" style={{ marginBottom: '12px' }}>
              Edit Result: {editModalResult.student_name} ({editModalResult.course_code})
            </h2>

            {(editModalResult.status === 'Locked' || editModalResult.status === 'Published') && (
              <div className="alert alert-warning">
                <ShieldAlert size={16} />
                <span>
                  This result is <strong>{editModalResult.status}</strong>. Modifications require an <strong>Administrator Override</strong> and a mandatory audit reason.
                </span>
              </div>
            )}

            <div className="form-group">
              <label>Current Status</label>
              <div><StatusBadge status={editModalResult.status} /></div>
            </div>

            <div className="form-group">
              <label>Current Score / Version</label>
              <div style={{ fontSize: '13px' }}>
                Score: <strong>{editModalResult.score}</strong> | Version: <strong>v{editModalResult.version}</strong>
              </div>
            </div>

            <div className="form-group">
              <label>New Score (0 – 100)</label>
              <input
                type="number"
                step="0.1"
                className="form-control"
                value={editScore}
                onChange={(e) => setEditScore(e.target.value)}
              />
            </div>

            {(editModalResult.status === 'Locked' || editModalResult.status === 'Published') && (
              <div className="form-group">
                <label>Administrator Override Reason (Mandatory)</label>
                <textarea
                  className="form-control"
                  placeholder="Explain why this locked/published record is being modified..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setEditModalResult(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Unpublish Modal */}
      {unpublishModalResult && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="h2" style={{ marginBottom: '12px' }}>
              Unpublish Result: {unpublishModalResult.student_name} ({unpublishModalResult.course_code})
            </h2>

            <div className="alert alert-warning">
              <RotateCcw size={16} />
              <span>
                Unpublishing reverts this record from <strong>Published</strong> to <strong>Locked</strong> state. Active student viewing sessions will be revoked immediately.
              </span>
            </div>

            <div className="form-group">
              <label>Mandatory Unpublish Reason</label>
              <textarea
                className="form-control"
                placeholder="Specify reason for reverting publication (e.g. grading error correction)..."
                value={unpublishReason}
                onChange={(e) => setUnpublishReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setUnpublishModalResult(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={submitUnpublish}>Confirm Unpublish</button>
            </div>
          </div>
        </div>
      )}

      {/* Generated Raw Token Display Modal */}
      {tokenModalData && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ textAlign: 'center' }}>
            <h2 className="h2" style={{ color: 'var(--color-success)', marginBottom: '8px' }}>
              Single-Use Token Generated
            </h2>

            <p className="small">
              Token generated for <strong>{tokenModalData.student_name}</strong> ({tokenModalData.course_code})
            </p>

            <div className="token-display-box">
              {tokenModalData.raw_token}
            </div>

            <div className="alert alert-info" style={{ textAlign: 'left', marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <div>
                <strong>Security Notice:</strong> Raw tokens are <strong>never stored</strong> in the database (only a SHA-256 hash). Copy this token now. It will expire at {new Date(tokenModalData.expires_at).toLocaleString()} and become invalid immediately upon first redemption.
              </div>
            </div>

            {/* Email & SMS Dispatch Controls */}
            <div style={{ background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px', marginBottom: '16px', textAlign: 'left' }}>
              <div className="caption" style={{ fontWeight: 600, color: 'var(--color-ink)', marginBottom: '6px' }}>
                Direct Parent Dispatch
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/tokens/dispatch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          token_id: tokenModalData.token_id,
                          email: tokenModalData.parent_email || 'parent@example.com'
                        })
                      });
                      const d = await res.json();
                      alert(d.message);
                    } catch (err) { alert(err.message); }
                  }}
                >
                  Dispatch Email to {tokenModalData.parent_email || 'parent@example.com'}
                </button>

                <button
                  className="btn btn-sm btn-secondary"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/tokens/dispatch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          result_id: tokenModalData.result_id,
                          raw_token: tokenModalData.raw_token,
                          channel: 'SMS',
                          destination: tokenModalData.parent_phone || '+15550192834'
                        })
                      });
                      const d = await res.json();
                      alert(d.message);
                    } catch (err) { alert(err.message); }
                  }}
                >
                  SMS to {tokenModalData.parent_phone || '+15550192834'}
                </button>
              </div>
            </div>

            <button className="btn btn-primary" onClick={() => setTokenModalData(null)}>
              I Have Copied the Token
            </button>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {historyModalResult && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '650px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="h2">Result Audit Trail</h2>
              <button className="btn btn-tertiary" onClick={() => setHistoryModalResult(null)}><X size={16} /></button>
            </div>

            <p className="small" style={{ marginBottom: '16px' }}>
              Complete history for <strong>{historyModalResult.student_name}</strong> ({historyModalResult.course_code})
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {historyData.length === 0 ? (
                <div className="caption">No historical edits recorded.</div>
              ) : (
                historyData.map(h => (
                  <div key={h.id} style={{ border: '1px solid var(--color-border)', borderRadius: '6px', padding: '12px', background: 'var(--color-canvas)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>{h.action_type}</span>
                      <span className="caption">{new Date(h.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="caption" style={{ color: 'var(--color-ink)' }}>
                      Actor: <strong>{h.actor_name}</strong>
                    </div>
                    {h.new_score !== null && (
                      <div className="caption">
                        Score change: {h.old_score !== null ? `${h.old_score} → ` : ''} <strong>{h.new_score}</strong>
                      </div>
                    )}
                    {h.reason && (
                      <div className="caption" style={{ marginTop: '4px', fontStyle: 'normal', color: 'var(--color-muted)' }}>
                        Reason: "{h.reason}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk CSV Modal */}
      {bulkModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <h2 className="h2" style={{ marginBottom: '8px' }}>Bulk CSV Upload</h2>
            <p className="small" style={{ marginBottom: '16px' }}>
              Format: <code>student_code, course_code, score, session, semester</code>
            </p>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Paste CSV Rows</label>
                <button
                  type="button"
                  className="btn btn-tertiary btn-sm"
                  onClick={() => setBulkCsvText('STU/2026/001, CS101, 89.5, 2025/2026, First\nSTU/2026/002, CS101, 94.0, 2025/2026, First\nSTU/2026/003, MTH201, 78.5, 2025/2026, First')}
                >
                  Load Sample CSV Data
                </button>
              </div>
              <textarea
                className="form-control"
                style={{ height: '120px', fontFamily: 'monospace', fontSize: '12px' }}
                placeholder="STU/2026/001, CS101, 88.5, 2025/2026, First&#10;STU/2026/002, CS101, 92.0, 2025/2026, First"
                value={bulkCsvText}
                onChange={(e) => setBulkCsvText(e.target.value)}
              />
            </div>

            {bulkReport && (
              <div style={{ marginTop: '14px', padding: '12px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{bulkReport.message}</div>
                {bulkReport.errors.length > 0 && (
                  <div style={{ marginTop: '8px', color: 'var(--color-error)', fontSize: '12px' }}>
                    <strong>Row Error Reports (Invalid rows did not fail valid entries):</strong>
                    <ul style={{ paddingLeft: '18px', marginTop: '4px' }}>
                      {bulkReport.errors.map((err, idx) => (
                        <li key={idx}>Row {err.row}: {err.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => { setBulkModalOpen(false); setBulkReport(null); }}>Close</button>
              <button className="btn btn-primary" onClick={handleBulkUpload}>Process Batch</button>
            </div>
          </div>
        </div>
      )}

      {/* Single Upload Modal */}
      {singleUploadOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 className="h2" style={{ marginBottom: '16px' }}>Upload Student Score</h2>
            <form onSubmit={handleSingleUpload}>
              <div className="form-group">
                <label>Student ID / Code</label>
                <select
                  className="form-control"
                  value={newResultForm.student_id}
                  onChange={(e) => setNewResultForm({ ...newResultForm, student_id: e.target.value })}
                >
                  <option value="std-001">Alex Johnson (STU/2026/001)</option>
                  <option value="std-002">Brenda Vance (STU/2026/002)</option>
                  <option value="std-003">Charles Xavier (STU/2026/003)</option>
                  <option value="std-004">Diana Prince (STU/2026/004)</option>
                  <option value="std-005">Evan Wright (STU/2026/005)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Course</label>
                <select
                  className="form-control"
                  value={newResultForm.course_id}
                  onChange={(e) => setNewResultForm({ ...newResultForm, course_id: e.target.value })}
                >
                  <option value="crs-cs101">CS101 - Intro to Computer Science</option>
                  <option value="crs-cs302">CS302 - Distributed Systems</option>
                  <option value="crs-mth201">MTH201 - Linear Algebra</option>
                </select>
              </div>

              <div className="form-group">
                <label>Score (0 – 100)</label>
                <input
                  type="number"
                  step="0.1"
                  className="form-control"
                  placeholder="e.g. 85.5"
                  value={newResultForm.score}
                  onChange={(e) => setNewResultForm({ ...newResultForm, score: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setSingleUploadOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Upload Score</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
