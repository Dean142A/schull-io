import React, { useState, useEffect } from 'react';
import { Shield, Search, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import Skeleton from '../components/Skeleton';

export default function AuditLogsPage({ currentUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [ipFilter, setIpFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    setError('');

    try {
      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (actionFilter) queryParams.append('action', actionFilter);
      if (ipFilter) queryParams.append('ip', ipFilter);

      const res = await fetch(`/api/audit-logs?${queryParams.toString()}`, {
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch audit logs');
      }

      const data = await res.json();
      setLogs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchLogs();
    }
  }, [currentUser, actionFilter, ipFilter]);

  if (!currentUser) {
    return <div className="caption" style={{ padding: '24px' }}>Loading session profile...</div>;
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchLogs();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="h1">Append-Only Activity Audit Logs</h1>
          <p className="small">Comprehensive immutable log of system events, token redemptions, and state modifications.</p>
        </div>

        <button className="btn btn-secondary" onClick={fetchLogs}>
          <RefreshCw size={14} /> Refresh Logs
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} /> <span>{error}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '16px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search by action, actor, IP, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="form-control"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{ width: '200px' }}
          >
            <option value="">All Action Types</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="LOGIN_FAILED">LOGIN_FAILED</option>
            <option value="TOKEN_GENERATED">TOKEN_GENERATED</option>
            <option value="TOKEN_REDEMPTION_SUCCESS">TOKEN_REDEMPTION_SUCCESS</option>
            <option value="TOKEN_REUSE_ATTEMPT">TOKEN_REUSE_ATTEMPT (High Alert)</option>
            <option value="TOKEN_INVALID_ATTEMPT">TOKEN_INVALID_ATTEMPT</option>
            <option value="TOKEN_EXPIRED_ATTEMPT">TOKEN_EXPIRED_ATTEMPT</option>
            <option value="RESULT_UPLOAD">RESULT_UPLOAD</option>
            <option value="UPDATE_RESULT_SCORE">UPDATE_RESULT_SCORE</option>
            <option value="ADMIN_OVERRIDE_MODIFY_RESULT">ADMIN_OVERRIDE_MODIFY_RESULT</option>
            <option value="LOCK_RESULT">LOCK_RESULT</option>
            <option value="PUBLISH_RESULT">PUBLISH_RESULT</option>
            <option value="UNPUBLISH_RESULT">UNPUBLISH_RESULT</option>
            <option value="SECURITY_DASHBOARD_VIEW">SECURITY_DASHBOARD_VIEW</option>
          </select>

          <input
            type="text"
            className="form-control"
            placeholder="Filter by IP address..."
            value={ipFilter}
            onChange={(e) => setIpFilter(e.target.value)}
            style={{ width: '160px' }}
          />

          <button type="submit" className="btn btn-primary">
            <Search size={14} /> Filter
          </button>
        </form>
      </div>

      {/* Logs Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Role</th>
              <th>Action Event</th>
              <th>IP Address</th>
              <th>Details & Event Metadata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton width={140} /></td>
                  <td><Skeleton width={120} /></td>
                  <td><Skeleton width={90} /></td>
                  <td><Skeleton width={150} /></td>
                  <td><Skeleton width={110} /></td>
                  <td><Skeleton width={260} /></td>
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '24px' }} className="caption">
                  No audit log entries matching criteria.
                </td>
              </tr>
            ) : (
              logs.map(log => {
                const isSecurityAlert = log.action === 'TOKEN_REUSE_ATTEMPT' || log.action === 'LOGIN_FAILED';
                return (
                  <tr key={log.id} style={{ background: isSecurityAlert ? '#FEF2F2' : 'transparent' }}>
                    <td className="caption" style={{ whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{log.actor_name}</td>
                    <td>
                      <span className="badge badge-role" style={{ fontSize: '11px' }}>{log.actor_role}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '12px',
                          color: isSecurityAlert ? 'var(--color-error)' : 'var(--color-ink)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{log.ip_address}</td>
                    <td style={{ fontSize: '12px', maxWidth: '300px' }}>
                      <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', color: 'var(--color-muted)' }}>
                        {log.details}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
