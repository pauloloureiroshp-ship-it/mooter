'use client';

import { useEffect, useState } from 'react';

type AdminStats = {
  totalUsers: number;
  activeUsers: number;
  totalDecisions: number;
  avgSavingsPct: number;
  hardwareDist: Record<string, number>;
  subDist: Record<string, number>;
  users: {
    email: string;
    hardware: string;
    version: string | null;
    decisions: number;
    lastSync: string;
  }[];
};

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => {
        if (r.status === 401 || r.status === 403) throw new Error('Access denied \u2014 admin only');
        if (!r.ok) throw new Error('Server error');
        return r.json();
      })
      .then(data => { setStats(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="dashboard-page"><div className="dashboard-container"><div className="dashboard-loading">Loading...</div></div></div>;
  if (error) return <div className="dashboard-page"><div className="dashboard-container"><div style={{ color: '#f44747', padding: '2rem 0' }}>{error}</div></div></div>;
  if (!stats) return null;

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        <div className="dashboard-header">
          <a href="/dashboard" className="dashboard-brand">
            <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
            <span>frugal admin</span>
          </a>
        </div>

        <h1 className="dashboard-h1">Platform admin</h1>

        {/* Summary stats */}
        <div className="dashboard-card">
          <h2>Overview</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalUsers}</div>
              <div className="dashboard-label">TOTAL USERS</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--t0, #4ec9b0)' }}>{stats.activeUsers}</div>
              <div className="dashboard-label">ACTIVE (7D)</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{stats.totalDecisions}</div>
              <div className="dashboard-label">TOTAL DECISIONS</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--t0, #4ec9b0)' }}>{stats.avgSavingsPct}%</div>
              <div className="dashboard-label">AVG SAVINGS</div>
            </div>
          </div>
        </div>

        {/* Hardware distribution */}
        <div className="dashboard-card">
          <h2>Hardware distribution</h2>
          <div className="dashboard-grid">
            {Object.entries(stats.hardwareDist).sort((a, b) => b[1] - a[1]).map(([hw, count]) => (
              <div className="dashboard-field" key={hw}>
                <span className="dashboard-label">{hw.replace(/_/g, ' ')}</span>
                <span className="dashboard-val">{count} ({Math.round((count / stats.totalUsers) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Subscriptions */}
        {Object.keys(stats.subDist).length > 0 && (
          <div className="dashboard-card">
            <h2>Subscriptions</h2>
            <div className="dashboard-grid">
              {Object.entries(stats.subDist).sort((a, b) => b[1] - a[1]).map(([sub, count]) => (
                <div className="dashboard-field" key={sub}>
                  <span className="dashboard-label">{sub}</span>
                  <span className="dashboard-val">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users table */}
        <div className="dashboard-card">
          <h2>Users</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  {['Email', 'Hardware', 'Version', 'Decisions', 'Last sync'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted, #666)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.users.map((u, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                    <td style={{ padding: '6px 10px' }}>{u.email}</td>
                    <td style={{ padding: '6px 10px' }} className="dashboard-muted">{u.hardware?.replace(/_/g, ' ') || '\u2014'}</td>
                    <td style={{ padding: '6px 10px' }} className="dashboard-muted">{u.version || '\u2014'}</td>
                    <td style={{ padding: '6px 10px' }}>{u.decisions || 0}</td>
                    <td style={{ padding: '6px 10px' }} className="dashboard-muted">{u.lastSync?.slice(0, 10) || '\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
