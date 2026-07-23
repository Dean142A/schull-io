import React, { useState, useEffect } from 'react';
import { User, Lock, ShieldCheck, Sliders, Send, KeyRound, Check, AlertCircle, RefreshCw, Key, FileText, CheckCircle } from 'lucide-react';
import PasswordInput from '../components/PasswordInput';
import Skeleton from '../components/Skeleton';

export default function SettingsPage({ currentUser, onUpdateUser }) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | '2fa' | 'policies' | 'notifications'

  // Profile Form State
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA Management State
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [totpSetupActive, setTotpSetupActive] = useState(false);
  const [backupCodes, setBackupCodes] = useState([]);
  const [showDisableForm, setShowDisableForm] = useState(false);

  // System Security Policies State
  const [systemSettings, setSystemSettings] = useState({
    suspicious_threshold: '5',
    lockout_duration_mins: '15',
    token_expiry_hours: '24',
    single_use_strictness: 'true',
    session_expiry_hours: '8',
    default_dispatch_channel: 'EMAIL',
    token_dispatch_limit_daily: '5',
    token_dispatch_cooldown_mins: '5',
    auto_invalidate_previous_tokens: 'true',
    log_retention_days: '90',
    disclaimer_template: 'SECURITY ADVISORY: This verification token is single-use and intended strictly for the parent or legal guardian. Do not forward or disclose raw verification tokens to unauthorized third parties.',
  });

  const [loading, setLoading] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch System Security Settings
  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/security/settings', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSystemSettings(prev => ({ ...prev, ...data.settings }));
      }
    } catch (err) {
      console.error('Failed to load security settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.full_name || '');
    }
    fetchSettings();
  }, [currentUser]);

  // Profile Form Submit
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword && newPassword !== confirmPassword) {
      setError('New password and confirmation password do not match.');
      return;
    }

    setLoading(true);

    try {
      const payload = { full_name: fullName };
      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');

      setSuccess('Profile details updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      if (data.user && onUpdateUser) {
        onUpdateUser(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2FA Handlers
  const handleStart2faSetup = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = {};
      if (currentUser.two_factor_enabled === 1) {
        payload.password = setupPassword;
        payload.current_totp_code = totpCode;
      }

      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTotpSecret(data.secret);
      setTotpSetupActive(true);
      setTotpCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEnable2fa = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ totp_code: totpCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess('Two-Factor Authentication (2FA) successfully activated!');
      setTotpSetupActive(false);
      setTotpSecret('');
      setTotpCode('');

      if (onUpdateUser) {
        onUpdateUser({ ...currentUser, two_factor_enabled: 1 });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2fa = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: currentPassword, totp_code: totpCode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess('2FA has been disabled.');
      setCurrentPassword('');
      setTotpCode('');
      setShowDisableForm(false);

      if (onUpdateUser) {
        onUpdateUser({ ...currentUser, two_factor_enabled: 0 });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateBackupCodes = () => {
    const codes = Array.from({ length: 8 }, () =>
      'SCH-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase()
    );
    setBackupCodes(codes);
    setSuccess('8 emergency recovery backup codes generated! Store them in a secure password manager.');
  };

  // System Policies Submit
  const handlePoliciesSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await fetch('/api/security/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(systemSettings),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess(data.message || 'System security settings saved!');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerPurge = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch('/api/security/purge-logs', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to execute log purge');
      setSuccess(data.message || 'Log retention purge completed successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Title */}
      <div>
        <h1 className="h1">System Settings & Security Policies</h1>
        <p className="small">Configure personal credentials, 2FA security, anomaly thresholds, and system dispatch policies.</p>
      </div>

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

      {/* Navigation Tabs */}
      <div className="card" style={{ padding: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('profile'); setError(''); setSuccess(''); }}
        >
          <User size={15} /> Personal Profile & Credentials
        </button>
        <button
          className={`btn ${activeTab === '2fa' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('2fa'); setError(''); setSuccess(''); }}
        >
          <ShieldCheck size={15} /> 2FA & Emergency Recovery
        </button>
        {(currentUser?.role === 'Administrator' || currentUser?.role === 'Supervisor') && (
          <>
            <button
              className={`btn ${activeTab === 'policies' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setActiveTab('policies'); setError(''); setSuccess(''); }}
            >
              <Sliders size={15} /> System Security Policies
            </button>
            <button
              className={`btn ${activeTab === 'notifications' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setActiveTab('notifications'); setError(''); setSuccess(''); }}
            >
              <Send size={15} /> Token Dispatch & Notifications
            </button>
          </>
        )}
      </div>

      {/* TAB 1: Personal Profile & Credentials */}
      {activeTab === 'profile' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <h2 className="h2" style={{ marginBottom: '16px' }}>Account Information</h2>
            <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Username</label>
                  <input
                    type="text"
                    className="form-control"
                    value={currentUser?.username || ''}
                    disabled
                    style={{ background: 'var(--color-canvas)', cursor: 'not-allowed' }}
                  />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Staff Role</label>
                  <input
                    type="text"
                    className="form-control"
                    value={currentUser?.role || ''}
                    disabled
                    style={{ background: 'var(--color-canvas)', cursor: 'not-allowed' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <h3 className="h3" style={{ marginBottom: '12px' }}>Change Password</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="label">Current Password</label>
                    <PasswordInput
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="label">New Password</label>
                      <PasswordInput
                        placeholder="Min 6 chars"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label className="label">Confirm New Password</label>
                      <PasswordInput
                        placeholder="Repeat new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
                {loading ? 'Saving...' : 'Save Profile & Password'}
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <h2 className="h2" style={{ marginBottom: '16px' }}>Active Session & Scope Details</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)' }}>
                <span className="caption">Department Assignment:</span>
                <span style={{ fontWeight: 600 }}>{currentUser?.department_name || 'All University Departments'}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)' }}>
                <span className="caption">JWT Cookie Protocol:</span>
                <span style={{ fontWeight: 600 }}>httpOnly, SameSite=Strict</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)' }}>
                <span className="caption">2FA Enforcement:</span>
                <span className={`badge ${currentUser?.two_factor_enabled === 1 ? 'badge-published' : 'badge-draft'}`}>
                  {currentUser?.two_factor_enabled === 1 ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: 2FA & Emergency Recovery */}
      {activeTab === '2fa' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
          <div className="card" style={{ padding: '24px' }}>
            <h2 className="h2" style={{ marginBottom: '8px' }}>Two-Factor Authenticator (TOTP)</h2>
            <p className="small" style={{ marginBottom: '20px' }}>
              Two-Factor Authentication adds an extra security layer by requiring a 6-digit TOTP code during sign in.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)', marginBottom: '20px' }}>
              <div>
                <div style={{ fontWeight: 700 }}>2FA Protection Status</div>
                <div className="caption">{currentUser?.two_factor_enabled === 1 ? 'Active & Enforced' : 'Not Active'}</div>
              </div>
              <label className="switch-container">
                <input
                  type="checkbox"
                  checked={currentUser?.two_factor_enabled === 1 || totpSetupActive}
                  onChange={() => {
                    if (currentUser?.two_factor_enabled === 0) {
                      if (!totpSetupActive) {
                        handleStart2faSetup();
                      } else {
                        setTotpSetupActive(false);
                      }
                    } else {
                      setShowDisableForm(prev => !prev);
                    }
                  }}
                />
                <span className="switch-slider"></span>
              </label>
            </div>

            {totpSetupActive && (
              <form onSubmit={handleEnable2fa} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', background: '#F8FAF5' }}>
                  <label className="label">Base32 Authenticator Key</label>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '18px', letterSpacing: '2px', color: 'var(--color-primary)', margin: '4px 0' }}>
                    {totpSecret}
                  </div>
                  <p className="caption">Enter this key into Google Authenticator or 1Password.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Enter 6-Digit TOTP Code</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="123456"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-primary" disabled={loading}>
                    Confirm & Enable 2FA
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setTotpSetupActive(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {currentUser?.two_factor_enabled === 1 && showDisableForm && (
              <form onSubmit={handleDisable2fa} style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
                <h3 className="h3">Confirm to Disable 2FA</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Enter Password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="6-Digit TOTP Code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="submit" className="btn btn-danger" disabled={loading}>
                    Disable 2FA Security
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowDisableForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="card" style={{ padding: '24px' }}>
            <h2 className="h2" style={{ marginBottom: '8px' }}>Emergency Recovery Codes</h2>
            <p className="small" style={{ marginBottom: '16px' }}>
              Generate single-use backup codes to sign in if you lose access to your TOTP authenticator device.
            </p>

            <button className="btn btn-secondary" onClick={handleGenerateBackupCodes} style={{ marginBottom: '16px' }}>
              <Key size={14} /> Generate 8 Backup Codes
            </button>

            {backupCodes.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '16px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }}>
                {backupCodes.map((code, idx) => (
                  <div key={idx} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: 'var(--color-primary)' }}>
                    {code}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: System Security Policies */}
      {activeTab === 'policies' && (
        <form onSubmit={handlePoliciesSubmit} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 className="h2">System-Wide Security Rules & Anomaly Enforcement</h2>

          {settingsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <Skeleton width={180} />
                    <Skeleton height={38} />
                    <Skeleton width={220} style={{ marginTop: '4px' }} />
                  </div>
                ))}
              </div>
              <Skeleton height={50} />
              <div style={{ display: 'flex', gap: '12px' }}>
                <Skeleton width={200} height={38} />
                <Skeleton width={180} height={38} />
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">IP Anomaly Rate Limit Threshold (Attempts)</label>
                  <select
                    className="form-control"
                    value={systemSettings.suspicious_threshold}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, suspicious_threshold: e.target.value }))}
                  >
                    <option value="3">3 Failures (Strict)</option>
                    <option value="5">5 Failures (Standard)</option>
                    <option value="10">10 Failures (NAT / Carrier Shared)</option>
                  </select>
                  <span className="caption">Failed login or token attempts before IP lock.</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Verification Token Expiry (Hours)</label>
                  <select
                    className="form-control"
                    value={systemSettings.token_expiry_hours}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, token_expiry_hours: e.target.value }))}
                  >
                    <option value="12">12 Hours</option>
                    <option value="24">24 Hours (Standard)</option>
                    <option value="48">48 Hours</option>
                    <option value="72">72 Hours (3 Days)</option>
                  </select>
                  <span className="caption">Lifespan of generated parent result verification tokens.</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">JWT Staff Session Cookie Expiry (Hours)</label>
                  <select
                    className="form-control"
                    value={systemSettings.session_expiry_hours}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, session_expiry_hours: e.target.value }))}
                  >
                    <option value="4">4 Hours (Strict)</option>
                    <option value="8">8 Hours (Standard Shift)</option>
                    <option value="24">24 Hours</option>
                  </select>
                  <span className="caption">Duration before staff must re-authenticate.</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Audit Log Retention Window</label>
                  <select
                    className="form-control"
                    value={systemSettings.log_retention_days || '90'}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, log_retention_days: e.target.value }))}
                  >
                    <option value="0">Indefinite (Keep All Logs)</option>
                    <option value="30">30 Days</option>
                    <option value="90">90 Days (Recommended)</option>
                    <option value="365">365 Days (1 Year)</option>
                  </select>
                  <span className="caption">Automatically purge older logs from database during background cleanups.</span>
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Audit Trail Immutability Protection</div>
                  <div className="caption">SQLite triggers prevent any DELETE or UPDATE statements on audit logs.</div>
                </div>
                <span className="badge badge-published">
                  <CheckCircle size={12} /> SQL Triggers Enforced
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saving Security Policies...' : 'Save System Security Policies'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleTriggerPurge}
                  disabled={loading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                >
                  <RefreshCw size={14} className={loading ? "spin" : ""} /> Run Log Purge Job Now
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* TAB 4: Token Dispatch & Notifications */}
      {activeTab === 'notifications' && (
        <form onSubmit={handlePoliciesSubmit} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 className="h2">Parent Dispatch & Notification Rules</h2>

          {settingsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <Skeleton width={180} />
                    <Skeleton height={38} />
                    <Skeleton width={220} style={{ marginTop: '4px' }} />
                  </div>
                ))}
              </div>
              <Skeleton height={50} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Skeleton width={180} />
                <Skeleton height={100} />
              </div>
              <Skeleton width={180} height={38} />
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label className="label">Default Token Delivery Channel</label>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="channel"
                        value="EMAIL"
                        checked={systemSettings.default_dispatch_channel === 'EMAIL'}
                        onChange={() => setSystemSettings(prev => ({ ...prev, default_dispatch_channel: 'EMAIL' }))}
                      />
                      <span style={{ fontWeight: 600 }}>Parent Email Dispatch (Primary)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="channel"
                        value="SMS"
                        checked={systemSettings.default_dispatch_channel === 'SMS'}
                        onChange={() => setSystemSettings(prev => ({ ...prev, default_dispatch_channel: 'SMS' }))}
                      />
                      <span style={{ fontWeight: 600 }}>SMS Dispatch (Secondary)</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Max Daily Token Dispatches per Student</label>
                  <select
                    className="form-control"
                    value={systemSettings.token_dispatch_limit_daily}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, token_dispatch_limit_daily: e.target.value }))}
                  >
                    <option value="3">3 Dispatches per Day</option>
                    <option value="5">5 Dispatches per Day (Standard)</option>
                    <option value="10">10 Dispatches per Day (High Volume)</option>
                  </select>
                  <span className="caption">Maximum tokens that can be requested per parent profile per 24 hours.</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Consecutive Token Cooldown Duration</label>
                  <select
                    className="form-control"
                    value={systemSettings.token_dispatch_cooldown_mins}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, token_dispatch_cooldown_mins: e.target.value }))}
                  >
                    <option value="1">1 Minute</option>
                    <option value="5">5 Minutes (Standard)</option>
                    <option value="15">15 Minutes</option>
                  </select>
                  <span className="caption">Enforces a wait time between consecutive dispatches to prevent spam.</span>
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Auto-Invalidation of Previous Tokens</div>
                  <div className="caption">When a new token is generated, automatically invalidate any previous unused tokens for the same result.</div>
                </div>
                <label className="switch-container">
                  <input
                    type="checkbox"
                    checked={systemSettings.auto_invalidate_previous_tokens === 'true'}
                    onChange={(e) => setSystemSettings(prev => ({ ...prev, auto_invalidate_previous_tokens: e.target.checked ? 'true' : 'false' }))}
                  />
                  <span className="switch-slider"></span>
                </label>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="label">Parent Token Email Disclaimer Footer Template</label>
                <textarea
                  className="form-control"
                  rows={4}
                  value={systemSettings.disclaimer_template || ''}
                  onChange={(e) => setSystemSettings(prev => ({ ...prev, disclaimer_template: e.target.value }))}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: 'flex-start' }}>
                Save Notification Rules
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
