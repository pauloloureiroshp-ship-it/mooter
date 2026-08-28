'use client';

import { useEffect, useState } from 'react';
import { personaOption } from '../../onboarding/_lib/persona';
import { VersionBadge } from '../../_components/VersionBadge';
import { formatGpuLabel } from '../../onboarding/_lib/hardware';
import StatuslineCard from '@/components/StatuslineCard';

interface Device {
  device_id: string;
  device_name: string;
  os_type: string;
  hw_tier: string;
  gpu_name?: string | null;
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
  persona: string | null;
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

// Wave 60 — eyebrow used inside the enriched trust/statusline cards. Mirrors the
// landing <Eyebrow>; inline so it inherits the dark .app-shell-dark short tokens.
const eyebrow: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--accent)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  fontWeight: 600,
  fontFamily: 'var(--mono)',
};

// Wave 60 — read-only "what leaves your machine" matrix. The CLI owns these
// toggles (settings is read-only by design, per the W10 doctrine note below);
// this mirrors the real `~/.mooter/consent.json` defaults — off-by-default, never
// fabricated. `on` reflects the documented shipped default, not a live value.
const TELEMETRY_MATRIX: Array<{ label: string; desc: string; on: boolean; badge?: string }> = [
  { label: 'Telemetry · routing decisions', desc: 'Anonymous tier + latency + classifier outcome. Drives the savings chart.', on: false, badge: 'opt-in' },
  { label: 'Hub upload · regex patterns', desc: 'Helps the community classifier improve. Strict k-anonymity.', on: false },
  { label: 'Hub upload · pack feedback', desc: 'Trust score updates and quality regression flags.', on: false },
  { label: 'Forge · self-distillation training', desc: 'Trains LoRA adapters on your repo. Code never leaves the machine.', on: false, badge: 'wave 5' },
  { label: 'Weekly digest email', desc: 'A summary on Sundays. Easy to unsubscribe.', on: false },
  { label: 'Leaderboard appearance', desc: 'Show your rank on the community page. Pseudonymous.', on: false },
];

// Read-only toggle (visual mirror of CLI state; not interactive — the CLI owns it).
function Toggle({ on }: { on: boolean }) {
  return (
    <span aria-hidden style={{
      width: 38, height: 22, borderRadius: 999, flexShrink: 0,
      background: on ? 'var(--accent)' : 'var(--border-light)',
      border: `1px solid ${on ? 'var(--accent)' : 'var(--border-light)'}`,
      position: 'relative', display: 'inline-block',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: on ? 'var(--bg)' : 'var(--muted)',
      }} />
    </span>
  );
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

  // Wave 14 Day 2 F-7 — show a human hardware label (OS + formatted GPU) from
  // the latest device's real telemetry, not the raw coarse tier ("windows nvidia").
  const latestDevice = devices[0];
  const hardwareLabel =
    [
      latestDevice?.os_type ? osLabel(latestDevice.os_type) : null,
      formatGpuLabel(latestDevice?.gpu_name ?? null),
    ]
      .filter(Boolean)
      .join(' · ') || (profile.hardware_tier ? profile.hardware_tier.replace(/_/g, ' ') : null);

  return (
    <div style={{ maxWidth: 720, animation: 'fadeIn 0.4s ease both' }}>
      {/* ── Profile ─────────────────────────────────────────────── */}
      <div style={card}>
        <h2 style={sectionHeading}>Profile</h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--accent)', color: 'var(--cream)',
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
            {profile.experience_level && profile.experience_level !== 'unknown' && (
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

        {hardwareLabel && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0', borderTop: '1px solid var(--border)',
            fontSize: '0.85rem',
          }}>
            <span style={{ color: 'var(--muted)' }}>Hardware</span>
            <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>
              {hardwareLabel}
            </span>
          </div>
        )}

        {/* Wave 10 B.2b F-3 — read the real persisted persona (was showing
            experience_level="unknown"). "Other" is preserved honestly; the CTA
            re-runs the onboarding persona step rather than fabricating a value. */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 0', borderTop: '1px solid var(--border)',
          fontSize: '0.85rem',
        }}>
          <span style={{ color: 'var(--muted)' }}>Persona</span>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: 'var(--text)' }}>{personaOption(profile.persona).title}</span>
            <a href="/onboarding" style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>Change</a>
          </span>
        </div>

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
                    {d.frugal_version && (
                      <> · <VersionBadge version={d.frugal_version} lastSync={d.last_sync_at} /></>
                    )}
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

      {/* ── Hub & telemetry — read-only opt-in matrix (Wave 60) ──────
          Visual mirror of the CLI consent state. Every toggle is OFF by
          default; the CLI owns the real values (see the boundary note below).
          No fabricated "on" states — these reflect the shipped defaults. */}
      <div style={card}>
        <div style={{ marginBottom: 16 }}>
          <span style={eyebrow}>Hub &amp; telemetry · all opt-in</span>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.015em', margin: '8px 0 6px', color: 'var(--text)' }}>
            What leaves your machine
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
            Every toggle is off by default. Hub uploads use k-anonymity ≥
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>50</span> and differential-privacy noise ε=
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>1.0</span>. Change these with{' '}
            <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>mooter share</code> in your CLI.
          </p>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column',
          borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--border)',
        }}>
          {TELEMETRY_MATRIX.map((opt, i) => (
            <div key={opt.label} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '13px 16px',
              background: 'var(--surface)',
              borderBottom: i < TELEMETRY_MATRIX.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.85rem', color: 'var(--text)' }}>{opt.label}</strong>
                  {opt.badge && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      · {opt.badge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{opt.desc}</div>
              </div>
              <Toggle on={opt.on} />
            </div>
          ))}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: '0.74rem', color: 'var(--muted)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
          ⓘ Read-only mirror — the CLI is the source of truth. Toggle live with{' '}
          <code style={{ color: 'var(--accent)' }}>mooter share</code>.
        </p>
      </div>

      {/* ── What mooter collects when you opt-in (trust card, Wave 60) ── */}
      <div style={card}>
        <span style={eyebrow}>What mooter collects when you opt-in</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginTop: 14 }} className="m-stack">
          <div>
            <div style={{ ...eyebrow, color: 'var(--tier-0)', marginBottom: 8, display: 'block' }}>
              We collect · k-anon ≥50
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                ['Prompt SHA-256 hash', 'NOT prompt text'],
                ['Tier chosen + cost', 'NOT model response'],
                ['Pack used + confidence', 'NOT pack contents'],
                ['Latency in ms', 'NOT request payload'],
              ].map(([what, not]) => (
                <li key={what} style={{ fontSize: '0.8rem', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--tier-0)' }} aria-hidden>✓</span>{what}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '0.68rem', color: 'var(--muted)', paddingLeft: 18 }}>{not}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div style={{ ...eyebrow, color: 'var(--tier-3)', marginBottom: 8, display: 'block' }}>
              We never collect
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                'Your code · any part, any form',
                'Your prompts · text, screenshots, partial',
                'Model responses',
                'Repository URLs or commit messages',
                'File paths or directory structures',
              ].map(item => (
                <li key={item} style={{ fontSize: '0.8rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--tier-3)' }} aria-hidden>✗</span>{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--muted)' }}>
          Revoke anytime · <span style={{ color: 'var(--accent)' }}>mooter share OFF</span> · or delete{' '}
          <span style={{ color: 'var(--text)' }}>~/.mooter/consent.json</span>
        </div>
      </div>

      {/* ── Statusline preview — illustrative render (Wave 60) ────────
          Clearly labelled illustrative; not your live terminal. */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <span style={eyebrow}>Statusline preview</span>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.015em', margin: '6px 0 0', color: 'var(--text)' }}>
              How it renders in Claude Code
            </h3>
          </div>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--muted)', border: '1px dashed var(--border-light)', borderRadius: 'var(--r-sm)', padding: '2px 8px',
          }}>
            illustrative
          </span>
        </div>
        <StatuslineCard />
        <p style={{ margin: '12px 0 0', fontSize: '0.74rem', color: 'var(--muted)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
          Sample layout — your real statusline renders in your terminal once mooter is active.
        </p>
      </div>

      {/* Wave 10 B.2b.2 F-10 — settings is read-only by design (per doctrine).
          Make the boundary explicit so users know where to edit. */}
      <div style={{
        ...card,
        display: 'flex', gap: 10, alignItems: 'flex-start',
        fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6,
      }}>
        <span aria-hidden="true" style={{ flexShrink: 0 }}>ⓘ</span>
        <span>
          Telemetry, sync cadence &amp; adapter are managed in your CLI. Run{' '}
          <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>mooter quiet --help</code>{' '}
          for options.
        </span>
      </div>
    </div>
  );
}
