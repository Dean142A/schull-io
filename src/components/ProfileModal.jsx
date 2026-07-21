import React, { useState, useEffect } from 'react';
import { X, User, Lock, KeyRound, ShieldCheck, Check, AlertCircle, RefreshCw } from 'lucide-react';
import PasswordInput from './PasswordInput';

export default function ProfileModal({ isOpen, onClose, currentUser, onUpdateUser }) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | '2fa'
  const [fullName, setFullName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 2FA Management State
  const [totpSecret, setTotpSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [setupPassword, setSetupPassword] = useState('');
  const [totpSetupActive, setTotpSetupActive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.full_name || '');
    }
  }, [currentUser, isOpen]);

  if (!isOpen || !currentUser) return null;

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

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      setSuccess('Profile updated successfully!');
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

      setSuccess('Two-Factor Authentication (2FA) successfully enabled!');
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

      if (onUpdateUser) {
        onUpdateUser({ ...currentUser, two_factor_enabled: 0 });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(15, 15, 20, 0.65)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div className="modal-content card" style={{
        width: '100%',
        maxWidth: '520px',
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-modal)',
        padding: '28px',
        boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.25)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h2 className="h2">Account Profile & Security</h2>
            <p className="small">Manage your staff credentials and two-factor authentication.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--color-border)', paddingBottom: '10px' }}>
          <button
            className={`btn btn-sm ${activeTab === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setActiveTab('profile'); setError(''); setSuccess(''); }}
          >
            <User size={14} /> Profile & Password
          </button>
          <button
            className={`btn btn-sm ${activeTab === '2fa' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setActiveTab('2fa'); setError(''); setSuccess(''); }}
          >
            <ShieldCheck size={14} /> 2FA Security
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: '16px' }}>
            <Check size={16} /> <span>{success}</span>
          </div>
        )}

        {/* Tab 1: Profile & Password */}
        {activeTab === 'profile' && (
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
                <label className="label">Username (Immutable)</label>
                <input
                  type="text"
                  className="form-control"
                  value={currentUser.username}
                  disabled
                  style={{ background: 'var(--color-canvas)', cursor: 'not-allowed' }}
                />
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="label">Role</label>
                <input
                  type="text"
                  className="form-control"
                  value={currentUser.role}
                  disabled
                  style={{ background: 'var(--color-canvas)', cursor: 'not-allowed' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
              <h3 className="h3" style={{ marginBottom: '12px' }}>Change Password (Optional)</h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Current Password</label>
                  <PasswordInput
                    placeholder="Enter current password to verify"
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: 2FA Security */}
        {activeTab === '2fa' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', background: 'var(--color-canvas)', borderRadius: 'var(--radius-card)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Two-Factor Authentication</div>
                <div className="caption">
                  {currentUser.two_factor_enabled === 1 ? 'Status: Active & Protected' : 'Status: Disabled'}
                </div>
              </div>
              <span className={`badge ${currentUser.two_factor_enabled === 1 ? 'badge-published' : 'badge-draft'}`}>
                {currentUser.two_factor_enabled === 1 ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {currentUser.two_factor_enabled === 0 && !totpSetupActive && (
              <div>
                <p className="small" style={{ marginBottom: '14px' }}>
                  Enabling 2FA requires entering a 6-digit TOTP code generated by an authenticator app (e.g. Google Authenticator) every time you sign in.
                </p>
                <button className="btn btn-primary" onClick={handleStart2faSetup} disabled={loading}>
                  {loading ? 'Generating Secret...' : 'Set Up 2FA Authenticator'}
                </button>
              </div>
            )}

            {totpSetupActive && (
              <form onSubmit={handleEnable2fa} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', background: '#F8FAF5' }}>
                  <label className="label">Your 2FA Base32 Secret Key</label>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '16px', letterSpacing: '2px', color: 'var(--color-primary)', margin: '4px 0 8px 0' }}>
                    {totpSecret}
                  </div>
                  <p className="caption">Enter this key into your authenticator app to generate TOTP codes.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label className="label">Enter 6-Digit Code to Confirm & Enable</label>
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
                    {loading ? 'Enabling...' : 'Confirm & Activate 2FA'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setTotpSetupActive(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {currentUser.two_factor_enabled === 1 && (
              <form onSubmit={handleDisable2fa} style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '12px', borderTop: '1px solid var(--color-border)' }}>
                <h3 className="h3">Disable Two-Factor Authentication</h3>
                <p className="small">To disable 2FA, confirm your account password and a current 6-digit TOTP code.</p>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="label">Current Password</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="Password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="label">6-Digit TOTP Code</label>
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
                </div>

                <button type="submit" className="btn btn-danger" disabled={loading} style={{ alignSelf: 'flex-start' }}>
                  {loading ? 'Disabling...' : 'Disable 2FA Security'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
