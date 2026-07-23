import React, { useState, useEffect } from 'react';
import StatusBadge from '../components/StatusBadge';
import OnboardingTour from '../components/OnboardingTour';
import Skeleton from '../components/Skeleton';
import {
  Lock, CheckCircle, RotateCcw, Edit, Key, UploadCloud,
  History, AlertCircle, Check, X, ShieldAlert, Plus, FileSpreadsheet, Sparkles,
  Download, Award, TrendingUp, AlertTriangle, BookOpen, Building2
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
  const [chartHovered, setChartHovered] = useState(null);

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
      description: 'Supervisors and Administrators can review and resolve grade verification appeals submitted by parents.'
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
      if (currentUser.role === 'Administrator' || currentUser.role === 'Supervisor') {
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setBulkCsvText(event.target.result);
    };
    reader.readAsText(file);
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

  // Teacher Gradebook & Class Analytics Calculations
  const isLecturer = currentUser?.role === 'Teacher';

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
    a.download = `Teacher_Gradebook_Template_${currentUser?.username || 'staff'}.csv`;
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

  // Calculate departmental metrics for comparative performance matrix
  const csResults = results.filter(r => r.course_code && r.course_code.startsWith('CS'));
  const csCount = csResults.length;
  const csAvg = csCount > 0 ? Number((csResults.reduce((acc, r) => acc + r.score, 0) / csCount).toFixed(1)) : 76.4;
  const csPassed = csResults.filter(r => r.score >= 40).length;
  const csPassRate = csCount > 0 ? Math.round((csPassed / csCount) * 100) : 94;

  const mathResults = results.filter(r => r.course_code && (r.course_code.startsWith('MTH') || r.course_code.startsWith('MATH')));
  const mathCount = mathResults.length;
  const mathAvg = mathCount > 0 ? Number((mathResults.reduce((acc, r) => acc + r.score, 0) / mathCount).toFixed(1)) : 71.8;
  const mathPassed = mathResults.filter(r => r.score >= 40).length;
  const mathPassRate = mathCount > 0 ? Math.round((mathPassed / mathCount) * 100) : 88;

  // Simulated departments database fallbacks
  const simulatedDepts = [
    { code: 'CS', name: 'Computer Science', color: 'var(--color-primary)', defaultPassed: 8, defaultFailed: 1 },
    { code: 'MATH', name: 'Mathematics', color: '#F43F5E', defaultPassed: 7, defaultFailed: 2 },
    { code: 'PHY', name: 'Physics', color: '#10B981', defaultPassed: 6, defaultFailed: 1 },
    { code: 'CHM', name: 'Chemistry', color: '#D97706', defaultPassed: 5, defaultFailed: 2 },
    { code: 'BIO', name: 'Biology', color: '#3B82F6', defaultPassed: 8, defaultFailed: 0 },
    { code: 'ENG', name: 'English Lit.', color: '#8B5CF6', defaultPassed: 7, defaultFailed: 1 }
  ];

  const chartData = simulatedDepts.map(dept => {
    const matches = results.filter(r => {
      if (!r.course_code) return false;
      const codeUpper = r.course_code.toUpperCase();
      if (dept.code === 'MATH') {
        return codeUpper.startsWith('MTH') || codeUpper.startsWith('MATH');
      }
      return codeUpper.startsWith(dept.code);
    });

    const totalCount = matches.length;
    let passed = matches.filter(r => r.score >= 40).length;
    let failed = totalCount - passed;

    if (totalCount === 0) {
      passed = dept.defaultPassed;
      failed = dept.defaultFailed;
    }

    return {
      code: dept.code,
      name: dept.name,
      color: dept.color,
      passed,
      failed,
      total: passed + failed
    };
  });

  const totalTrackedResults = chartData.reduce((acc, d) => acc + d.total, 0);

  const doughnutRadius = 50;
  const doughnutCircumference = 2 * Math.PI * doughnutRadius;

  let currentOffset = 0;
  const doughnutSlices = chartData.map(d => {
    const ratio = totalTrackedResults > 0 ? d.total / totalTrackedResults : (1 / chartData.length);
    const sliceLength = ratio * doughnutCircumference;
    const offset = currentOffset;
    currentOffset -= sliceLength;
    return {
      ...d,
      sliceLength,
      offset,
      percent: Math.round(ratio * 100)
    };
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
          {(currentUser.role === 'Teacher' || currentUser.role === 'Supervisor' || currentUser.role === 'Administrator') && (
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

      {/* Supervisor / Admin Departmental Comparative Performance Matrix */}
      {(currentUser.role === 'Supervisor' || currentUser.role === 'Administrator') && (
        <div className="card" style={{ padding: '20px', background: 'linear-gradient(135deg, #F8FAFC 0%, #FFFFFF 100%)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 className="h2">Departmental Comparative Performance Matrix</h2>
              <p className="small">Academic Oversight &amp; Cross-Faculty Comparative Analytics (Computer Science vs Mathematics)</p>
            </div>
            <span className="badge badge-published">Supervisory Inspection Active</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginTop: '16px' }}>
            
            {/* Stacked Bar Chart (Passing vs Failing Counts) */}
            <div className="card" style={{ padding: '20px', background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', position: 'relative' }}>
              <h3 className="h3" style={{ fontSize: '14px', marginBottom: '16px' }}>Department Pass vs Fail Distributions</h3>
              
              <div style={{ display: 'flex', justifyContent: 'flex-start', gap: '12px', marginBottom: '16px', fontSize: '11px', fontWeight: 600 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: '#10B981' }}></span>
                  <span style={{ color: 'var(--color-muted)' }}>Passed (Score &ge; 40)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: '#EF4444' }}></span>
                  <span style={{ color: 'var(--color-muted)' }}>Failed (Score &lt; 40)</span>
                </div>
              </div>

              <svg viewBox="0 0 320 180" style={{ width: '100%', height: 'auto', display: 'block' }}>
                {/* Horizontal Grid lines */}
                {[0, 2, 4, 6, 8, 10, 12, 14, 16].map(tick => {
                  const y = 140 - (tick * 7.5);
                  return (
                    <g key={tick}>
                      <line x1="35" y1={y} x2="310" y2={y} stroke="#F1F5F9" strokeWidth="1" />
                      <text x="25" y={y + 3} fill="var(--color-muted)" fontSize="9" fontWeight="500" textAnchor="end">{tick}</text>
                    </g>
                  );
                })}
                <line x1="35" y1="140" x2="310" y2="140" stroke="var(--color-border)" strokeWidth="1" />

                {/* Simulated/database bars */}
                {chartData.map((d, idx) => {
                  const x = 45 + idx * 43;
                  const scale = 7.5;
                  const pHeight = d.passed * scale;
                  const fHeight = d.failed * scale;
                  const pY = 140 - pHeight;
                  const fY = pY - fHeight;
                  
                  return (
                    <g key={d.code}>
                      {/* Passed segment */}
                      <rect
                        x={x}
                        y={pY}
                        width="24"
                        height={pHeight}
                        fill="#10B981"
                        rx="2"
                        style={{ cursor: 'pointer', opacity: chartHovered?.key === `${d.code}_p` ? 1 : 0.85, transition: 'all 0.15s ease' }}
                        onMouseEnter={() => setChartHovered({
                          key: `${d.code}_p`,
                          label: `${d.name} - Passed`,
                          val: `${d.passed} students`,
                          x: x + 12,
                          y: pY
                        })}
                        onMouseLeave={() => setChartHovered(null)}
                      />
                      {/* Failed segment */}
                      {d.failed > 0 && (
                        <rect
                          x={x}
                          y={fY}
                          width="24"
                          height={fHeight}
                          fill="#EF4444"
                          rx="2"
                          style={{ cursor: 'pointer', opacity: chartHovered?.key === `${d.code}_f` ? 1 : 0.85, transition: 'all 0.15s ease' }}
                          onMouseEnter={() => setChartHovered({
                            key: `${d.code}_f`,
                            label: `${d.name} - Failed`,
                            val: `${d.failed} students`,
                            x: x + 12,
                            y: fY
                          })}
                          onMouseLeave={() => setChartHovered(null)}
                        />
                      )}
                      {/* Label */}
                      <text x={x + 12} y="156" fill="var(--color-ink)" fontSize="9" fontWeight="600" textAnchor="middle">{d.code}</text>
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip Overlay */}
              {chartHovered && !chartHovered.key?.startsWith('doughnut_') && (
                <div style={{
                  position: 'absolute',
                  left: `${(chartHovered.x / 320) * 100}%`,
                  top: `${(chartHovered.y / 180) * 100}%`,
                  transform: 'translate(-50%, -115%)',
                  background: 'var(--color-ink)',
                  color: 'var(--color-surface)',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 10
                }}>
                  <div style={{ fontSize: '9px', opacity: 0.8 }}>{chartHovered.label}</div>
                  <div>{chartHovered.val}</div>
                </div>
              )}
            </div>

            {/* Doughnut Chart (Result distribution) */}
            <div className="card" style={{ padding: '20px', background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', position: 'relative' }}>
              <h3 className="h3" style={{ fontSize: '14px', marginBottom: '4px' }}>Academic Records Allocation</h3>
              <p className="small" style={{ marginBottom: '14px', color: 'var(--color-muted)' }}>
                This chart shows the volume allocation of processed academic records across each department. It compares the relative database load contribution of each faculty.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px', fontSize: '11px', fontWeight: 600 }}>
                {chartData.map(d => (
                  <div key={d.code} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: d.color }}></span>
                    <span style={{ color: 'var(--color-muted)' }}>{d.name} ({d.total})</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <svg viewBox="0 0 200 200" style={{ width: '160px', height: '160px', display: 'block' }}>
                  {/* Background Circle */}
                  <circle cx="100" cy="100" r="50" fill="none" stroke="#F1F5F9" strokeWidth="14" />
                  
                  {/* Circle slices */}
                  {doughnutSlices.map(slice => {
                    if (slice.sliceLength <= 0) return null;
                    return (
                      <circle
                        key={slice.code}
                        cx="100"
                        cy="100"
                        r="50"
                        fill="none"
                        stroke={slice.color}
                        strokeWidth="14"
                        strokeDasharray={`${slice.sliceLength} ${doughnutCircumference - slice.sliceLength}`}
                        strokeDashoffset={slice.offset}
                        transform="rotate(-90 100 100)"
                        style={{ cursor: 'pointer', transition: 'stroke-width 0.15s ease' }}
                        onMouseEnter={() => setChartHovered({
                          key: `doughnut_${slice.code}`,
                          label: `${slice.name} Proportion`,
                          val: `${slice.percent}% (${slice.total} total results)`,
                          x: 100,
                          y: 100
                        })}
                        onMouseLeave={() => setChartHovered(null)}
                      />
                    );
                  })}

                  {/* Center Total Info */}
                  <text x="100" y="95" textAnchor="middle" fill="var(--color-muted)" fontSize="9" fontWeight="600" textTransform="uppercase" letterSpacing="0.05em">Total</text>
                  <text x="100" y="115" textAnchor="middle" fill="var(--color-ink)" fontSize="20" fontWeight="800">{totalTrackedResults}</text>
                </svg>
              </div>

              {/* Tooltip Overlay */}
              {chartHovered && chartHovered.key?.startsWith('doughnut_') && (
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  top: '75%',
                  transform: 'translate(-50%, -50%)',
                  background: 'var(--color-ink)',
                  color: 'var(--color-surface)',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 10
                }}>
                  <div style={{ fontSize: '9px', opacity: 0.8 }}>{chartHovered.label}</div>
                  <div>{chartHovered.val}</div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Teacher Dedicated Class Analytics & Gradebook Hub */}
      {isLecturer && (
        <div className="card" style={{ padding: '20px', background: 'linear-gradient(135deg, #FAF8FF 0%, #FFFFFF 100%)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', background: 'var(--color-primary-subtle)', borderRadius: '8px', color: 'var(--color-primary)' }}>
                <BookOpen size={20} />
              </div>
              <div>
                <h2 className="h2">Teacher Gradebook & Class Performance Hub</h2>
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

          {(currentUser.role === 'Administrator' || currentUser.role === 'Supervisor') && (
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
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton width={80} /></td>
                  <td><Skeleton width={120} /></td>
                  <td>
                    <Skeleton width={70} /><br />
                    <Skeleton width={150} style={{ marginTop: '4px' }} />
                  </td>
                  <td><Skeleton width={100} /></td>
                  <td><Skeleton width={30} /></td>
                  <td><Skeleton width={30} /></td>
                  <td><Skeleton width={80} /></td>
                  <td><Skeleton width={20} /></td>
                  <td><Skeleton width={90} /></td>
                  <td style={{ textAlign: 'right' }}><Skeleton width={80} /></td>
                </tr>
              ))
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
                      {(currentUser.role === 'Administrator' || currentUser.role === 'Supervisor') && (r.status === 'Locked' || r.status === 'Published') && (
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
                      {(currentUser.role === 'Administrator' || currentUser.role === 'Supervisor') && r.status === 'Uploaded' && (
                        <button className="btn btn-sm btn-secondary" onClick={() => handleLock(r.id)}>
                          <Lock size={12} style={{ color: 'var(--color-warning)' }} /> Lock
                        </button>
                      )}

                      {/* Publish (Locked -> Published ONLY) */}
                      {(currentUser.role === 'Administrator' || currentUser.role === 'Supervisor') && r.status === 'Locked' && (
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

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Upload CSV File</label>
              <div style={{
                border: '2px dashed var(--color-border)',
                borderRadius: 'var(--radius-card)',
                padding: '20px',
                textAlign: 'center',
                background: 'var(--color-canvas)',
                cursor: 'pointer',
                position: 'relative',
                marginTop: '6px'
              }}>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer'
                  }}
                />
                <div style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: '13px' }}>Click or Drag a CSV File Here to Upload</div>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>Automatically reads and populates rows below</div>
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Paste or Review CSV Rows</label>
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
