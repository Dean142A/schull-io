import React, { useState, useEffect } from 'react';
import { KeyRound, Clock, ShieldCheck, AlertCircle, RefreshCw, Download, Flag, CheckCircle, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import Skeleton from '../components/Skeleton';

export default function TokenPortalPage() {
  const [tokenInput, setTokenInput] = useState('');
  const [hasSession, setHasSession] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('');
  
  // Public Verification State
  const [verificationData, setVerificationData] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  // Appeal Modal state
  const [showAppealModal, setShowAppealModal] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [appealMessage, setAppealMessage] = useState('');
  const [appealError, setAppealError] = useState('');

  // Auto-fetch result if active httpOnly session cookie exists
  useEffect(() => {
    fetchSessionResult();

    const params = new URLSearchParams(window.location.search);
    const verifyCode = params.get('code');
    if (verifyCode) {
      handleVerifyTranscript(verifyCode);
    }
  }, []);

  const handleVerifyTranscript = async (code) => {
    setVerifying(true);
    setVerificationError('');
    setVerificationData(null);
    try {
      // Normalize e.g. STU-2026-001 -> STU/2026/001
      const cleaned = code.replace(/^TRNS-/, '').replace(/-/g, '/');
      const res = await fetch(`/api/tokens/verify-transcript/${encodeURIComponent(cleaned)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify transcript');
      setVerificationData(data);
    } catch (err) {
      setVerificationError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  // Session timer countdown
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - new Date().getTime();
      if (diff <= 0) {
        setTimeRemaining('Session Expired');
        clearInterval(interval);
        setResult(null);
        setHasSession(false);
        setError('Your viewing session has expired. Please request a new access token.');
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeRemaining(`${mins}m ${secs < 10 ? '0' : ''}${secs}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/tokens/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ raw_token: tokenInput.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid token');
      }

      setTokenInput('');
      setHasSession(true);
      await fetchSessionResult();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionResult = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tokens/view-result', {
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok) {
        setResult(null);
        setHasSession(false);
        if (res.status !== 401) {
          setError(data.error || 'Session invalid');
        }
        return;
      }

      setResult(data.result);
      setHasSession(true);
      setExpiresAt(data.session_expires_at);
    } catch (err) {
      setResult(null);
      setHasSession(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClearSession = async () => {
    await fetch('/api/tokens/exit-session', { method: 'POST', credentials: 'include' });
    setHasSession(false);
    setResult(null);
    setExpiresAt(null);
    setError('');
  };

  const handleDownloadPdf = () => {
    if (!result) return;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(59, 29, 130);
    doc.text('schull.io Academic Result Transcript', 20, 20);
    
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`Official Verified Document - Issued: ${new Date().toLocaleString()}`, 20, 28);
    doc.line(20, 32, 190, 32);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(`Student Name: ${result.student_name}`, 20, 44);
    doc.setFont('helvetica', 'normal');
    doc.text(`Student Code: ${result.student_code}`, 20, 52);
    doc.text(`Department: ${result.department_name}`, 20, 60);

    doc.line(20, 68, 190, 68);
    doc.text(`Course Code: ${result.course_code}`, 20, 78);
    doc.text(`Course Title: ${result.course_title}`, 20, 86);
    doc.text(`Academic Period: ${result.session} (${result.semester} Term)`, 20, 94);

    doc.setFillColor(245, 243, 255);
    doc.rect(20, 105, 170, 35, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(59, 29, 130);
    doc.text(`FINAL SCORE: ${result.score.toFixed(1)} / 100`, 30, 124);
    doc.text(`GRADE: ${result.grade}`, 135, 124);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('This transcript was generated from a single-use verified session on schull.io.', 20, 155);
    doc.text('Authenticity can be verified at http://localhost:3001/tokens', 20, 162);

    doc.save(`Transcript_${result.student_code.replace(/\//g, '_')}_${result.course_code}.pdf`);
  };

  const handleCreateAppeal = async (e) => {
    e.preventDefault();
    setAppealError('');
    setAppealMessage('');
    try {
      const res = await fetch('/api/tokens/appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: appealReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAppealMessage(data.message);
      setShowAppealModal(false);
      setAppealReason('');
      fetchSessionResult();
    } catch (err) {
      setAppealError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: '680px', margin: '20px auto 0 auto' }}>
      {/* Wordmark Title for Public Portal */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div className="wordmark" style={{ fontSize: '28px' }}>
          schull<span>.io</span>
        </div>
        <p className="caption" style={{ fontSize: '13px', marginTop: '4px' }}>
          Public Single-Use Academic Result Verification Portal
        </p>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {appealMessage && (
        <div className="alert" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#166534', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} /> <span>{appealMessage}</span>
        </div>
      )}


      {verificationError && (
        <div className="alert alert-error" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} /> <span>{verificationError}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setVerificationError('')} style={{ marginLeft: 'auto' }}>
            Dismiss
          </button>
        </div>
      )}

      {(verificationData || verifying) && (
        <div className="card" style={{ padding: '32px', marginBottom: '24px', borderTop: `4px solid ${verifying ? 'var(--color-primary)' : (verificationData.status === 'TAMPERED_COMPROMISED' ? 'var(--color-error)' : 'var(--color-success)')}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={24} style={{ color: verifying ? 'var(--color-primary)' : (verificationData.status === 'TAMPERED_COMPROMISED' ? 'var(--color-error)' : 'var(--color-success)') }} />
              <h2 className="h2">Transcript Authenticity Status</h2>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setVerificationData(null); }} disabled={verifying}>
              Clear Verification
            </button>
          </div>

          {verifying ? (
            <div style={{
              background: '#F1F5F9',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '16px',
              color: 'var(--color-primary)',
              marginBottom: '20px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <RefreshCw className="spin" size={20} />
              Verifying Cryptographic Transcript Signature...
            </div>
          ) : verificationData.status === 'TAMPERED_COMPROMISED' ? (
            <div style={{
              background: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: '8px',
              padding: '16px',
              color: '#991B1B',
              marginBottom: '20px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertCircle size={20} />
              CRITICAL WARNING: Cryptographic checksum validation failed. This transcript has been modified outside authorized channels!
            </div>
          ) : (
            <div style={{
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: '8px',
              padding: '16px',
              color: '#065F46',
              marginBottom: '20px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <CheckCircle size={20} />
              Verified Authentic: This document matches the secure registrar database.
            </div>
          )}

          <div style={{ background: 'var(--color-surface-hover)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Student Record</div>
            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>
              {verifying ? <Skeleton width={180} height={20} /> : verificationData.student.full_name}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '13px' }}>
              <span>Matric: <strong>{verifying ? <Skeleton width={80} /> : verificationData.student.student_code}</strong></span>
              <span>&bull;</span>
              <span>Department: <strong>{verifying ? <Skeleton width={120} /> : verificationData.student.department_name}</strong></span>
            </div>
          </div>

          <h3 className="h3" style={{ fontSize: '15px', marginBottom: '10px' }}>Secure Registrar Records</h3>
          <div className="table-container" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Session/Term</th>
                  <th>Score</th>
                  <th>Grade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {verifying ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td><Skeleton width={140} /></td>
                      <td><Skeleton width={100} /></td>
                      <td><Skeleton width={45} /></td>
                      <td><Skeleton width={30} /></td>
                      <td><Skeleton width={60} /></td>
                    </tr>
                  ))
                ) : (
                  verificationData.results.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{r.course_code}</strong><br/><span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{r.course_title}</span></td>
                      <td>{r.session}<br/><span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{r.semester} Term</span></td>
                      <td style={{ fontWeight: 700 }}>{r.score}</td>
                      <td><span className="badge badge-published">{r.grade}</span></td>
                      <td>
                        {r.isIntact ? (
                          <span className="badge badge-published" style={{ background: '#ECFDF5', color: '#047857' }}>Secure</span>
                        ) : (
                          <span className="badge badge-draft" style={{ background: '#FEF2F2', color: '#B91C1C' }}>TAMPERED</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--color-muted)', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
            <span>Registrar Signature: <strong>Ogude Dean</strong></span>
            <span>Verified: <strong>{verifying ? <Skeleton width={150} /> : new Date(verificationData.verification_timestamp).toLocaleString()}</strong></span>
          </div>
        </div>
      )}

      {/* Redemption Input Form (If no active session) */}
      {(!result && !verificationData && !verifying) ? (
        <div className="card" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <KeyRound size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 className="h2">Enter Access Token</h2>
          </div>

          <p className="small" style={{ marginBottom: '20px' }}>
            Parents and students can view academic records by entering a valid single-use token provided by your department officer.
          </p>

          <form onSubmit={handleRedeem}>
            <div className="form-group">
              <label>Single-Use Access Token</label>
              <input
                type="text"
                className="form-control"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '16px',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  padding: '12px',
                }}
                placeholder="e.g. SCH-XXXX-XXXX-XXXX"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px', padding: '12px' }}
              disabled={loading}
            >
              {loading ? 'Verifying Token...' : 'Access Academic Result'}
            </button>
          </form>

          <div className="caption" style={{ marginTop: '20px', textAlign: 'center', color: 'var(--color-muted)' }}>
            Tokens are valid for a single redemption only and expire automatically.
          </div>
        </div>
      ) : (
        /* Result View Card */
        <div className="card" style={{ padding: '32px' }}>
          {/* Active Session Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              background: 'var(--color-primary-subtle)',
              padding: '10px 16px',
              borderRadius: '8px',
              marginBottom: '24px',
              border: '1px solid #E2D5FF',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-primary)' }}>
              <Clock size={16} />
              <span>Session Time Remaining: <strong>{timeRemaining}</strong></span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-sm btn-secondary" onClick={handleDownloadPdf} title="Download Official PDF Transcript">
                <Download size={12} /> PDF Transcript
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => fetchSessionResult()} title="Re-verify Status">
                <RefreshCw size={12} /> Verify Realtime Status
              </button>
              <button className="btn btn-sm btn-tertiary" onClick={handleClearSession}>
                Exit Session
              </button>
            </div>
          </div>

          {/* Active Appeal Banner */}
          {result.active_appeal && (
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#92400E' }}>
                <Flag size={16} />
                <span>Verification Appeal Submitted: <strong>{result.active_appeal.status}</strong></span>
              </div>
              <span className="caption" style={{ color: '#B45309' }}>Submitted {new Date(result.active_appeal.created_at).toLocaleDateString()}</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <h1 className="h1" style={{ fontSize: '20px' }}>{result.student_name}</h1>
              <div className="caption">{result.student_code} • {result.department_name}</div>
            </div>

            <div className="badge badge-published">
              <ShieldCheck size={14} /> Official Verified Result
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--color-canvas)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
              <div className="caption">Course Code & Title</div>
              <div style={{ fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>{result.course_code}</div>
              <div className="caption" style={{ color: 'var(--color-ink)' }}>{result.course_title}</div>
            </div>

            <div style={{ background: 'var(--color-canvas)', padding: '12px', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
              <div className="caption">Academic Period</div>
              <div style={{ fontWeight: 700, fontSize: '15px', marginTop: '2px' }}>{result.session}</div>
              <div className="caption" style={{ color: 'var(--color-ink)' }}>{result.semester} Term</div>
            </div>
          </div>

          <div
            style={{
              background: '#F8F9FA',
              border: '2px dashed var(--color-border)',
              borderRadius: '8px',
              padding: '24px',
              textAlign: 'center',
            }}
          >
            <div className="caption" style={{ textTransform: 'uppercase' }}>Final Score & Grade</div>
            <div style={{ fontSize: '36px', fontWeight: 800, color: 'var(--color-ink)', margin: '4px 0' }}>
              {result.score.toFixed(1)} <span style={{ fontSize: '24px', color: 'var(--color-primary)' }}>({result.grade})</span>
            </div>
            <div className="caption" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
              Status: Published & Validated
            </div>
          </div>

          {/* Result Appeal Action */}
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAppealModal(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Flag size={14} /> Request Score Verification / Appeal Result
            </button>
          </div>

          <div className="caption" style={{ marginTop: '20px', textAlign: 'center', color: 'var(--color-muted)' }}>
            This session re-verifies the live status of the result on every interaction. If an administrator unpublishes this record, your access expires instantly.
          </div>
        </div>
      )}

      {/* Appeal Submission Modal */}
      {showAppealModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ width: '450px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="h2">Submit Result Appeal</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAppealModal(false)}><X size={14} /></button>
            </div>

            {appealError && (
              <div className="alert alert-error" style={{ marginBottom: '12px' }}>
                <AlertCircle size={14} /> {appealError}
              </div>
            )}

            <form onSubmit={handleCreateAppeal} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p className="small">
                Submit an official request for score re-checking or verification. Department officers will be notified to review the grade calculation.
              </p>
              <div>
                <label className="caption">Reason for Appeal / Score Discrepancy</label>
                <textarea
                  className="form-control"
                  rows="3"
                  required
                  placeholder="Describe the discrepancy (e.g. missing continuous assessment score)..."
                  value={appealReason}
                  onChange={e => setAppealReason(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAppealModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Submit Appeal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
