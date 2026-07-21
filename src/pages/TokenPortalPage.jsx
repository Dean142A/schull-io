import React, { useState, useEffect } from 'react';
import { KeyRound, Clock, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

export default function TokenPortalPage() {
  const [tokenInput, setTokenInput] = useState('');
  const [hasSession, setHasSession] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState('');

  // Auto-fetch result if active httpOnly session cookie exists
  useEffect(() => {
    fetchSessionResult();
  }, []);

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

      {/* Redemption Input Form (If no active session) */}
      {!result ? (
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
              <button className="btn btn-sm btn-secondary" onClick={() => window.print()} title="Print or Save PDF Transcript">
                Print Official Transcript
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => fetchSessionResult()} title="Re-verify Status">
                <RefreshCw size={12} /> Verify Realtime Status
              </button>
              <button className="btn btn-sm btn-tertiary" onClick={handleClearSession}>
                Exit Session
              </button>
            </div>
          </div>

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
              <div className="caption" style={{ color: 'var(--color-ink)' }}>{result.semester} Semester</div>
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

          <div className="caption" style={{ marginTop: '24px', textAlign: 'center', color: 'var(--color-muted)' }}>
            This session re-verifies the live status of the result on every interaction. If an administrator unpublishes this record, your access expires instantly.
          </div>
        </div>
      )}
    </div>
  );
}
