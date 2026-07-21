import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ResultsPage from './pages/ResultsPage';
import TokenPortalPage from './pages/TokenPortalPage';
import AuditLogsPage from './pages/AuditLogsPage';
import SecurityDashboardPage from './pages/SecurityDashboardPage';
import DirectoryPage from './pages/DirectoryPage';
import LoginPage from './pages/LoginPage';

export default function App() {
  const [demoUsers, setDemoUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('results');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch demo users for role switching
    fetch('/api/auth/demo-users')
      .then(res => res.json())
      .then(users => setDemoUsers(users))
      .catch(err => console.error('Failed to load demo users:', err));

    // 2. Check active JWT session via /api/auth/me
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then(data => {
        setCurrentUser(data.user);
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSwitchUser = async (user) => {
    try {
      const res = await fetch('/api/auth/dev-switch-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
        if (user.role === 'Lecturer' && (activeTab === 'audit' || activeTab === 'security')) {
          setActiveTab('results');
        } else if (user.role === 'Department Officer' && activeTab === 'security') {
          setActiveTab('results');
        }
      }
    } catch (err) {
      console.error('Failed to switch role:', err);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'Helvetica Neue, sans-serif' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#4100F4' }}>
          schull.io loading system engine...
        </div>
      </div>
    );
  }

  if (!currentUser && activeTab !== 'portal') {
    return (
      <LoginPage
        onLoginSuccess={(user) => setCurrentUser(user)}
        demoUsers={demoUsers}
      />
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        demoUsers={demoUsers}
        onSwitchUser={handleSwitchUser}
      />

      <div className="main-content">
        <Header currentUser={activeTab === 'portal' ? null : currentUser} onLogout={handleLogout} />

        <main className="page-body">
          {activeTab === 'results' && <ResultsPage currentUser={currentUser} />}
          {activeTab === 'directory' && <DirectoryPage currentUser={currentUser} />}
          {activeTab === 'portal' && <TokenPortalPage />}
          {activeTab === 'audit' && <AuditLogsPage currentUser={currentUser} />}
          {activeTab === 'security' && <SecurityDashboardPage currentUser={currentUser} />}
        </main>
      </div>
    </div>
  );
}
