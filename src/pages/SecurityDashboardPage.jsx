import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, User, Key, Settings, RefreshCw, CheckCircle, Lock, ShieldOff } from 'lucide-react';

export default function SecurityDashboardPage({ currentUser }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newThreshold, setNewThreshold] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/security/dashboard', {
        credentials: 'include',
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to load security dashboard');
      }

      const resultData = await res.json();
      setData(resultData);
      setNewThreshold(resultData.threshold.toString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchDashboard();
    }
  }, [currentUser]);

  if (!currentUser) {
    return <div className="caption" style={{ padding: '24px' }}>Loading session profile...</div>;
  }

  const handleUpdateThreshold = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/security/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ suspicious_threshold: newThreshold }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);

      setSuccess('Security threshold updated successfully.');
      fetchDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSimulateAttack = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/security/simulate-attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count: 6 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(data.message);
      fetchDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnlockUser = async (userId) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/security/unlock-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error);
      setSuccess(resData.message);
      fetchDashboard();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExportCsv = () => {
    window.open('/api/audit-logs/export', '_blank');
  };

  if (loading && !data) {
    return <div className="caption">Loading security dashboard...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="h1">Security & Anomaly Monitoring Dashboard</h1>
          <p className="small">Surfaces suspicious activity, brute-force IP patterns, and staff token generation volume.</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-danger btn-sm" onClick={handleSimulateAttack} title="Fires 6 simulated failed token attempts from IP 198.51.100.42">
            <ShieldAlert size={14} /> Simulate Brute-Force Attack
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
            Export Audit CSV
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchDashboard}>
            <RefreshCw size={14} /> Refresh Metrics
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={16} /> <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <CheckCircle size={16} /> <span>{success}</span>
        </div>
      )}

      {/* Top Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="card">
          <div className="caption" style={{ textTransform: 'uppercase' }}>Configured Threshold</div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px', color: 'var(--color-primary)' }}>
            {data?.threshold} <span style={{ fontSize: '13px', color: 'var(--color-muted)', fontWeight: 400 }}>failed attempts</span>
          </div>
          <div className="caption" style={{ marginTop: '4px' }}>Flags IPs exceeding limit</div>
        </div>

        <div className="card">
          <div className="caption" style={{ textTransform: 'uppercase' }}>Suspicious IP Entities</div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px', color: data?.ip_activity.filter(i => i.is_suspicious).length > 0 ? 'var(--color-error)' : 'var(--color-success)' }}>
            {data?.ip_activity.filter(i => i.is_suspicious).length || 0}
          </div>
          <div className="caption" style={{ marginTop: '4px' }}>Exceeding threshold or reuse attempt</div>
        </div>

        <div className="card">
          <div className="caption" style={{ textTransform: 'uppercase' }}>Token Generation Volume</div>
          <div style={{ fontSize: '28px', fontWeight: 700, marginTop: '4px', color: 'var(--color-ink)' }}>
            {data?.token_stats_by_staff.reduce((acc, s) => acc + s.total_tokens, 0) || 0}
          </div>
          <div className="caption" style={{ marginTop: '4px' }}>Generated by authorized staff</div>
        </div>
      </div>

      {/* Threshold Configuration Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Settings size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="h2">Tune Anomaly Threshold</h2>
        </div>

        <p className="small" style={{ marginBottom: '16px' }}>
          Adjust the failure count threshold for flagging suspicious IP addresses. Higher thresholds account for shared networks and mobile carrier NATs.
        </p>

        <form onSubmit={handleUpdateThreshold} style={{ display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '400px' }}>
          <input
            type="number"
            min="1"
            className="form-control"
            value={newThreshold}
            onChange={(e) => setNewThreshold(e.target.value)}
            style={{ width: '120px' }}
          />
          <button type="submit" className="btn btn-primary">
            Update Threshold
          </button>
        </form>
      </div>

      {/* Suspicious & Repeated Failed Attempts by IP */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <ShieldAlert size={18} style={{ color: 'var(--color-error)' }} />
          <h2 className="h2">Repeated Failed Login & Token Attempts (Grouped by IP)</h2>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Failed Logins</th>
                <th>Invalid Token Redemptions</th>
                <th>Token Reuse Attempts</th>
                <th>Total Failures</th>
                <th>Flag Status</th>
                <th>Last Incident</th>
              </tr>
            </thead>
            <tbody>
              {data?.ip_activity.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }} className="caption">
                    No failed security events recorded.
                  </td>
                </tr>
              ) : (
                data?.ip_activity.map(ipRow => (
                  <tr key={ipRow.ip_address} style={{ background: ipRow.is_suspicious ? '#FEF2F2' : 'transparent' }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ipRow.ip_address}</td>
                    <td>{ipRow.failed_logins}</td>
                    <td>{ipRow.failed_tokens}</td>
                    <td style={{ fontWeight: ipRow.reuse_attempts > 0 ? 700 : 400, color: ipRow.reuse_attempts > 0 ? 'var(--color-error)' : 'inherit' }}>
                      {ipRow.reuse_attempts}
                    </td>
                    <td style={{ fontWeight: 700 }}>{ipRow.attempt_count}</td>
                    <td>
                      {ipRow.is_suspicious ? (
                        <span className="badge" style={{ background: '#FEF2F2', color: 'var(--color-error)', border: '1px solid #FECACA' }}>
                          <AlertTriangle size={12} /> Suspicious IP
                        </span>
                      ) : (
                        <span className="badge badge-published">Normal</span>
                      )}
                    </td>
                    <td className="caption">{new Date(ipRow.last_attempt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff Token Generation Activity */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Key size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="h2">Staff Token Generation Volume & Activity</h2>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Role</th>
                <th>Department</th>
                <th>Tokens Generated</th>
                <th>Tokens Successfully Redeemed</th>
                <th>Invalidated Tokens</th>
              </tr>
            </thead>
            <tbody>
              {data?.token_stats_by_staff.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }} className="caption">
                    No staff token generation events recorded.
                  </td>
                </tr>
              ) : (
                data?.token_stats_by_staff.map(staff => (
                  <tr key={staff.staff_id}>
                    <td style={{ fontWeight: 600 }}>{staff.full_name} ({staff.username})</td>
                    <td><span className="badge badge-role" style={{ fontSize: '11px' }}>{staff.role}</span></td>
                    <td>{staff.department_name || 'All (Admin)'}</td>
                    <td style={{ fontWeight: 700 }}>{staff.total_tokens}</td>
                    <td style={{ color: 'var(--color-success)', fontWeight: 600 }}>{staff.redeemed_tokens}</td>
                    <td style={{ color: 'var(--color-muted)' }}>{staff.invalidated_tokens}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Locked or Disabled Staff Accounts */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Lock size={18} style={{ color: 'var(--color-error)' }} />
          <h2 className="h2">Locked & Disabled Staff Accounts</h2>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Failed Attempts</th>
                <th>Status</th>
                <th>Lock Expiry / Action</th>
              </tr>
            </thead>
            <tbody>
              {!data?.locked_users || data?.locked_users.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '20px' }} className="caption">
                    No staff accounts are currently locked or disabled.
                  </td>
                </tr>
              ) : (
                data?.locked_users.map(user => (
                  <tr key={user.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{user.username}</td>
                    <td>{user.full_name}</td>
                    <td><span className="badge badge-role" style={{ fontSize: '11px' }}>{user.role}</span></td>
                    <td style={{ color: 'var(--color-error)', fontWeight: 700 }}>{user.failed_login_attempts}</td>
                    <td>
                      {user.is_active === 0 ? (
                        <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>Deactivated</span>
                      ) : (
                        <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>Locked</span>
                      )}
                    </td>
                    <td>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleUnlockUser(user.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <ShieldOff size={14} /> Unlock Account
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
