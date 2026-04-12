'use client';

import { useEffect, useState } from 'react';

type Profile = {
  id: string;
  email?: string;
  hardware_tier?: string;
  subscriptions?: string | string[];
  install_completed?: boolean;
  install_completed_at?: string;
  frugal_version?: string;
  onboarding_completed?: boolean;
  created_at?: string;
  updated_at?: string;
};

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => {
        if (r.status === 401 || r.status === 403) throw new Error('Access denied — admin only');
        if (!r.ok) throw new Error('Server error');
        return r.json();
      })
      .then(data => { setProfiles(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div style={{ padding: '2rem', fontFamily: 'monospace' }}>Loading...</div>;
  if (error) return <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#f87171' }}>{error}</div>;

  const installed = profiles.filter(p => p.install_completed).length;

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', background: '#0a0a0a', minHeight: '100vh', color: '#e5e5e5' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>frugal admin</h1>
      <p style={{ color: '#888', marginBottom: '2rem', fontSize: '0.9rem' }}>
        {profiles.length} users · {installed} installed · {profiles.length - installed} pending
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              {['email', 'hardware', 'subscriptions', 'installed', 'version', 'onboarded', 'joined'].map(h => (
                <th key={h} style={{ border: '1px solid #333', padding: '6px 12px', textAlign: 'left', background: '#111', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profiles.map(p => (
              <tr key={p.id} style={{ background: p.install_completed ? '#0f1a0f' : 'transparent' }}>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.email ?? '—'}</td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.hardware_tier?.replace(/_/g, ' ') ?? '—'}</td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>
                  {Array.isArray(p.subscriptions) ? p.subscriptions.join(', ') : (p.subscriptions ?? '—')}
                </td>
                <td style={{ border: '1px solid #222', padding: '6px 12px', textAlign: 'center' }}>
                  {p.install_completed ? '✅' : '—'}
                </td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.frugal_version ?? '—'}</td>
                <td style={{ border: '1px solid #222', padding: '6px 12px', textAlign: 'center' }}>
                  {p.onboarding_completed ? '✓' : '—'}
                </td>
                <td style={{ border: '1px solid #222', padding: '6px 12px' }}>{p.created_at?.slice(0, 10) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
