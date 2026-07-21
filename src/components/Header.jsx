import React, { useState, useRef, useEffect } from 'react';
import { Shield, Building2, LogOut, UserCheck, Settings, ChevronDown, User } from 'lucide-react';
import NotificationCenter from './NotificationCenter';

export default function Header({ currentUser, onLogout, onOpenProfile }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initials generator
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="top-header" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>
          {currentUser ? `Welcome, ${currentUser.full_name}` : 'Public Access Portal'}
        </h2>
      </div>

      {currentUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <NotificationCenter currentUser={currentUser} />

          {currentUser.department_name && (
            <div className="badge badge-draft" style={{ background: '#F3F4F6' }}>
              <Building2 size={12} /> {currentUser.department_name}
            </div>
          )}

          <div className="badge badge-role">
            <Shield size={12} /> {currentUser.role}
          </div>

          {/* Profile Avatar Pill & Dropdown Trigger */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setDropdownOpen(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 10px 4px 6px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                cursor: 'pointer'
              }}
            >
              <div style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                background: 'var(--color-primary)',
                color: '#FFF',
                fontWeight: 700,
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {getInitials(currentUser.full_name)}
              </div>
              <span style={{ fontWeight: 600, fontSize: '13px' }}>{currentUser.username}</span>
              <ChevronDown size={14} style={{ color: 'var(--color-muted)' }} />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '220px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-modal)',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
                padding: '8px 0',
                zIndex: 1000,
                animation: 'tourFadeIn 0.15s ease-out'
              }}>
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)', marginBottom: '4px' }}>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-ink)' }}>{currentUser.full_name}</div>
                  <div className="caption" style={{ fontSize: '11px' }}>{currentUser.role}</div>
                </div>

                <button
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--color-ink)',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-canvas)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onOpenProfile) onOpenProfile();
                  }}
                >
                  <Settings size={14} style={{ color: 'var(--color-primary)' }} /> Edit Profile & Security
                </button>

                <div style={{ margin: '4px 0', borderTop: '1px solid var(--color-border)' }} />

                <button
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: 'var(--color-error)',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#FEF2F2'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onLogout) onLogout();
                  }}
                >
                  <LogOut size={14} /> Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
