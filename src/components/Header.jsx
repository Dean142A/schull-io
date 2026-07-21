import React from 'react';
import { Shield, Building2, User } from 'lucide-react';

export default function Header({ currentUser }) {
  return (
    <header className="top-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600 }}>
          {currentUser ? `Welcome, ${currentUser.full_name}` : 'Public Access Portal'}
        </h2>
      </div>

      {currentUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {currentUser.department_name && (
            <div className="badge badge-draft" style={{ background: '#F3F4F6' }}>
              <Building2 size={12} /> {currentUser.department_name}
            </div>
          )}

          <div className="badge badge-role">
            <Shield size={12} /> {currentUser.role}
          </div>
        </div>
      )}
    </header>
  );
}
