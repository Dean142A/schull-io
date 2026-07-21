import React from 'react';
import { LayoutDashboard, FileText, ShieldAlert, KeyRound, UserCheck, Shield, Users, Settings, GraduationCap } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, currentUser, demoUsers, onSwitchUser }) {
  const isPublicPortal = activeTab === 'portal';

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div style={{ paddingBottom: '24px', borderBottom: '1px solid var(--color-border)', marginBottom: '20px' }}>
        <div className="wordmark">
          schull<span>.io</span>
        </div>
        <div className="caption" style={{ marginTop: '2px' }}>
          academic result management
        </div>
      </div>

      {/* Navigation Items */}
      <nav style={{ flex: 1 }}>
        <div className="caption" style={{ marginBottom: '8px', paddingLeft: '8px', textTransform: 'uppercase' }}>
          Staff Management
        </div>

        <div
          className={`nav-item ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => setActiveTab('results')}
        >
          <FileText className="nav-icon" /> Results Directory
        </div>

        <div
          className={`nav-item ${activeTab === 'directory' ? 'active' : ''}`}
          onClick={() => setActiveTab('directory')}
        >
          <Users className="nav-icon" /> Student Registry
        </div>

        {(currentUser?.role === 'Administrator' || currentUser?.role === 'Supervisor') && (
          <div
            className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <LayoutDashboard className="nav-icon" /> Audit Trail
          </div>
        )}

        {currentUser?.role === 'Administrator' && (
          <div
            className={`nav-item ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <ShieldAlert className="nav-icon" /> Security Dashboard
          </div>
        )}

        <div
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings className="nav-icon" /> Settings & Security
        </div>

        <div style={{ marginTop: '24px', marginBottom: '8px', paddingLeft: '8px', textTransform: 'uppercase' }} className="caption">
          Public & Student Access
        </div>

        <div
          className={`nav-item ${activeTab === 'student-portal' ? 'active' : ''}`}
          onClick={() => setActiveTab('student-portal')}
        >
          <GraduationCap className="nav-icon" /> Student Progress Portal
        </div>

        <div
          className={`nav-item ${activeTab === 'portal' ? 'active' : ''}`}
          onClick={() => setActiveTab('portal')}
        >
          <KeyRound className="nav-icon" /> Token Redemption Portal
        </div>
      </nav>

      {/* Active User / Gated Role Switcher Widget */}
      {(import.meta.env.VITE_ENABLE_DEV_ROLE_SWITCHER === 'true' || import.meta.env.DEV) ? (
        <div style={{ background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <UserCheck size={14} style={{ color: 'var(--color-primary)' }} />
            <span className="caption" style={{ fontWeight: 600, color: 'var(--color-ink)' }}>Test Role Switcher (Dev Mode)</span>
          </div>
          <select
            className="form-control"
            style={{ fontSize: '12px', padding: '4px 8px' }}
            value={currentUser?.id || ''}
            onChange={(e) => {
              const user = demoUsers.find(u => u.id === e.target.value);
              if (user) onSwitchUser(user);
            }}
          >
            {demoUsers.map(u => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role}{u.department_code ? ` - ${u.department_code}` : ''})
              </option>
            ))}
          </select>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-muted)' }}>
            Current Role: <strong>{currentUser?.role}</strong>
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '12px' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--color-ink)' }}>
            {currentUser?.full_name || 'Authenticated User'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
            Role: <strong>{currentUser?.role}</strong>
          </div>
        </div>
      )}
    </aside>
  );
}
