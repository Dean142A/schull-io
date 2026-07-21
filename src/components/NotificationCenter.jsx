import React, { useState, useEffect, useRef } from 'react';
import { Bell, ShieldAlert, FileText, CheckCircle, X, Check, ArrowRight } from 'lucide-react';

export default function NotificationCenter({ currentUser }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      title: 'Pending Result Appeal',
      message: 'Alex Johnson submitted an appeal for CS101 (Score: 88.5).',
      time: '10 mins ago',
      type: 'appeal',
      read: false,
    },
    {
      id: 'notif-2',
      title: 'Security Advisory',
      message: 'Account lockout threshold reached after 5 failed login attempts.',
      time: '45 mins ago',
      type: 'security',
      read: false,
    },
    {
      id: 'notif-3',
      title: 'Grade Upload Ready',
      message: 'New draft scores uploaded for CS302 (Distributed Systems).',
      time: '2 hours ago',
      type: 'result',
      read: true,
    },
  ]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleDismiss = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(prev => !prev)}
        style={{ padding: '8px', position: 'relative', borderRadius: '50%' }}
        title="Notifications & Alerts"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            background: 'var(--color-error)',
            color: '#FFFFFF',
            fontSize: '10px',
            fontWeight: 800,
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--color-surface)',
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: '46px',
          width: '340px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-modal)',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.2)',
          zIndex: 9999,
          padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>System Notifications</span>
              <button 
                type="button" 
                onClick={() => setIsOpen(false)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center' }}
                title="Close notification panel"
              >
                <X size={14} />
              </button>
            </div>
            {unreadCount > 0 && (
              <button className="btn btn-tertiary" onClick={handleMarkAllRead} style={{ fontSize: '11px', padding: '2px 6px' }}>
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div className="caption" style={{ textAlign: 'center', padding: '20px' }}>
                No active notifications.
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-card)',
                    background: n.read ? 'var(--color-canvas)' : 'var(--color-primary-subtle)',
                    border: '1px solid var(--color-border)',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, fontSize: '13px', color: 'var(--color-ink)' }}>
                      {n.type === 'security' ? <ShieldAlert size={14} style={{ color: 'var(--color-error)' }} /> : <FileText size={14} style={{ color: 'var(--color-primary)' }} />}
                      <span>{n.title}</span>
                    </div>
                    <button
                      onClick={() => handleDismiss(n.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: '2px' }}
                    >
                      <X size={12} />
                    </button>
                  </div>

                  <p className="caption" style={{ marginTop: '4px', color: 'var(--color-ink)' }}>{n.message}</p>
                  <div className="caption" style={{ fontSize: '10px', marginTop: '6px', color: 'var(--color-muted)' }}>{n.time}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
