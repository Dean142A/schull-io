import React, { useState } from 'react';
import { Lock, User, KeyRound, AlertCircle, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';

export default function LoginPage({ onLoginSuccess, demoUsers = [] }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLoginSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = { username, password };
      if (requires2fa) {
        payload.totp_code = totpCode;
      }

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      if (data.requires_2fa) {
        setRequires2fa(true);
        setLoading(false);
        return;
      }

      if (data.user) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoSelect = (demoUser) => {
    setUsername(demoUser.username);
    setPassword('password123');
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at 50% 20%, rgba(65, 0, 244, 0.06) 0%, var(--color-canvas) 70%)',
      padding: '20px',
      fontFamily: 'var(--font-family)'
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="wordmark" style={{ fontSize: '26px' }}>schull.io</span>
            <span className="badge" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', fontWeight: 700 }}>
              Security Portal
            </span>
          </div>
          <p className="caption" style={{ fontSize: '13px' }}>
            Token-Based Secure Academic Result Management System
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '32px', borderRadius: 'var(--radius-modal)', boxShadow: 'none', border: '1px solid var(--color-border)' }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '20px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {!requires2fa ? (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <h2 className="h2" style={{ marginBottom: '4px' }}>Staff Sign In</h2>
                <p className="small">Enter your credentials to access result management controls.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="label">Username or Email Address</label>
                <div style={{ position: 'relative', width: '100%' }}>
                  <User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)', zIndex: 1 }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. admin@schull.io or admin"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    style={{ paddingLeft: '38px', width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="label">Password</label>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', padding: '12px', justifyContent: 'center', marginTop: '4px' }}
              >
                {loading ? 'Authenticating...' : <>Sign In <ArrowRight size={16} /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'var(--color-primary-subtle)',
                  color: 'var(--color-primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px'
                }}>
                  <ShieldCheck size={24} />
                </div>
                <h2 className="h2" style={{ marginBottom: '4px' }}>Two-Factor Verification</h2>
                <p className="small">Enter the 6-digit TOTP code from your authenticator app.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="label">6-Digit 2FA Code</label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--color-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="123456"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                    style={{ paddingLeft: '38px', letterSpacing: '4px', fontWeight: '700', fontSize: '16px' }}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
              >
                {loading ? 'Verifying...' : 'Verify Code & Complete Sign In'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setRequires2fa(false); setTotpCode(''); }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Back to Sign In
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <p className="caption">schull.io Academic Security System &bull; Production v1.0</p>
        </div>
      </div>
    </div>
  );
}
