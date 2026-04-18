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

function osLabel(os: string): string {
  if (os === 'win32') return 'Windows';
  if (os === 'darwin') return 'macOS';
  if (os === 'linux') return 'Linux';
  return os || 'unknown';
}

// ── Shared card style ────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding: 24,
  marginBottom: 16,
};

const sectionHeading: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 12px',
  fontWeight: 600,
};

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
      <div style={card}>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          No profile found.{' '}
          <a href="/onboarding" style={{ color: 'var(--accent)' }}>Complete onboarding</a>{' '}
          to set up your profile.
        </p>
      </div>
    );
  }

  const devices = profile.devices || [];

  return (
    <div style={{ maxWidth: 640 }}>
      {/* ── Profile ─────────────────────────────────────────────── */}
      <div style={card}>
        <h2 style={sectionHeading}>Profile</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--accent)', color: 'var(--bg)',
            display: 'grid', placeItems: 'center',
            fontSize: '1.4rem', fontWeight: 700,
            fontFamily: 'var(--font)',
            flexShrink: 0,
          }}>
            {profile.email[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: '1rem', fontWeight: 600,
              color: 'var(--text)', fontFamily: 'var(--font)',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {profile.email}
            </div>
            {profile.experience_level && (
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
                {profile.experience_level}
              </div>
            )}
          </div>
        </div>

        {profile.github_username && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderTop: '1px solid var(--border)',
            fontSize: '0.85rem',
          }}>
            <span style={{ color: 'var(--muted)' }}>GitHub</span>
            <a
              href={`https://github.com/${profile.github_username}`}
              target="_blank"
              rel="noopener"
              style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}
            >
              @{profile.github_username}
            </a>
          </div>
        )}

        {profile.hardware_tier && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderTop: '1px solid var(--border)',
            fontSize: '0.85rem',
          }}>
            <span style={{ color: 'var(--muted)' }}>Hardware</span>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>
              {profile.hardware_tier.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        <button
          onClick={handleLogout}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.15)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
          style={{
            marginTop: 16,
            padding: '8px 20px',
            background: 'rgba(212,106,90,0.08)',
            border: '1px solid rgba(212,106,90,0.25)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--tier-3)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
            fontFamily: 'var(--font)',
            transition: 'filter 0.15s ease',
          }}
        >
          Logout
        </button>
      </div>

      {/* ── Subscriptions ───────────────────────────────────────── */}
      <div style={card}>
        <h2 style={sectionHeading}>Subscriptions</h2>
        {profile.subscriptions && profile.subscriptions.length > 0 ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {profile.subscriptions.map((sub, i) => (
              <span key={i} className="status-pill ok">{sub}</span>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
            No subscriptions detected — run{' '}
            <code style={{
              fontFamily: 'var(--mono)',
              color: 'var(--accent)',
              background: 'var(--bg)',
              padding: '2px 6px',
              borderRadius: 'var(--r-sm)',
              fontSize: '0.8rem',
            }}>
              mooter-doctor
            </code>{' '}
            to auto-detect
          </p>
        )}
      </div>

      {/* ── Devices ─────────────────────────────────────────────── */}
      <div style={card}>
        <h2 style={sectionHeading}>Devices</h2>
        {devices.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
            No devices registered yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {devices.map((d, i) => (
              <div key={d.device_id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12,
                background: 'var(--surface)',
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{osIcon(d.os_type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.9rem', fontWeight: 500,
                    color: 'var(--text)',
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 200,
                    }}>
                      {d.device_name || 'Unknown device'}
                    </span>
                    {i === 0 && <span className="status-pill ok">Latest</span>}
                  </div>
                  <div style={{
                    fontSize: '0.75rem', color: 'var(--muted)',
                    fontFamily: 'var(--mono)', marginTop: 2,
                  }}>
                    {osLabel(d.os_type)} · {d.hw_tier?.replace(/_/g, ' ')}
                    {d.frugal_version && ` · v${d.frugal_version}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: '0.85rem',
                    color: 'var(--text)',
                    fontFamily: 'var(--mono)',
                  }}>
                    {(d.decisions_count || 0).toLocaleString()}
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--muted)',
                    marginTop: 2,
                  }}>
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
