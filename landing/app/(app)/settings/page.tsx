'use client';

import { useEffect, useState } from 'react';

interface Device {
  device_id: string;
  device_name: string;
  os_type: string;
  hw_tier: string;
  has_ollama: boolean;
  has_anthropic_key: boolean;
  frugal_version: string;
  decisions_count: number;
  savings_usd: number;
  last_sync_at: string;
}

interface Profile {
  id: string;
  email: string;
  hardware_tier: string;
  os_type: string;
  subscriptions: string[];
  onboarding_completed: boolean;
  github_username: string | null;
  experience_level: string;
  devices?: Device[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function osIcon(os: string): string {
  if (os === 'win32') return '\uD83E\uDE9F';
  if (os === 'darwin') return '\uD83C\uDF4E';
  return '\uD83D\uDC27';
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(async (data) => {
        if (!data.userId) return;
        const res = await fetch(`/api/profile?userId=${data.userId}`);
        if (res.ok) {
          const p = await res.json();
          setProfile(p);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    document.cookie = 'sb-access-token=; max-age=0; path=/';
    window.location.href = '/';
  };

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  if (!profile) {
    return (
      <div className="dashboard-card">
        <p>No profile found. <a href="/onboarding">Complete onboarding</a> to set up your profile.</p>
      </div>
    );
  }

  const devices = profile.devices || [];

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Profile section */}
      <div className="dashboard-card" style={{ marginBottom: 16 }}>
        <h2>Profile</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            background: 'var(--accent)', color: '#000',
            display: 'grid', placeItems: 'center',
            fontSize: '1.25rem', fontWeight: 700,
          }}>
            {profile.email[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 500 }}>{profile.email}</div>
            {profile.experience_level && (
              <div className="dashboard-muted" style={{ fontSize: '0.85rem' }}>{profile.experience_level}</div>
            )}
          </div>
        </div>
        {profile.github_username && (
          <div className="dashboard-field" style={{ marginBottom: 8 }}>
            <span className="dashboard-label">GitHub</span>
            <a
              href={`https://github.com/${profile.github_username}`}
              target="_blank"
              rel="noopener"
              style={{ color: 'var(--accent)', fontSize: '0.9rem', textDecoration: 'none' }}
            >
              @{profile.github_username}
            </a>
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            marginTop: 12,
            padding: '8px 20px',
            background: 'rgba(244,71,71,0.1)',
            border: '1px solid rgba(244,71,71,0.3)',
            borderRadius: 6,
            color: '#f47373',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          Logout
        </button>
      </div>

      {/* Subscriptions section */}
      <div className="dashboard-card" style={{ marginBottom: 16 }}>
        <h2>Subscriptions</h2>
        {profile.subscriptions && profile.subscriptions.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profile.subscriptions.map((sub, i) => (
              <span key={i} className="status-pill ok">{sub}</span>
            ))}
          </div>
        ) : (
          <p className="dashboard-muted" style={{ fontSize: '0.9rem' }}>
            No subscriptions detected — run <code>frugal-doctor</code> to auto-detect
          </p>
        )}
      </div>

      {/* Devices section */}
      <div className="dashboard-card">
        <h2>Devices</h2>
        {devices.length === 0 ? (
          <p className="dashboard-muted">No devices registered yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {devices.map((d, i) => (
              <div key={d.device_id} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 8,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '1.2rem' }}>{osIcon(d.os_type)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    {d.device_name || 'Unknown device'}
                    {i === 0 && <span className="status-pill ok" style={{ marginLeft: 8 }}>Latest</span>}
                  </div>
                  <div className="dashboard-muted" style={{ fontSize: '0.8rem' }}>
                    {d.hw_tier?.replace(/_/g, ' ')} {d.frugal_version && `· v${d.frugal_version}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem' }}>{d.decisions_count || 0} prompts</div>
                  <div className="dashboard-muted" style={{ fontSize: '0.75rem' }}>
                    {d.last_sync_at ? timeAgo(d.last_sync_at) : 'never'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
