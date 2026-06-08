'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { env } from '../lib/env';
import { VersionBadge } from '../_components/VersionBadge';
import { formatGpuLabel } from '../onboarding/_lib/hardware';
import NavBar from '@/components/NavBar';

const ADMIN_EMAIL = 'paulo.loureiro.shp@gmail.com';

interface ShellUser {
  email: string;
  is_admin: boolean;
  hw_tier: string | null;
  gpu_name: string | null;
  os_type: string | null;
  frugal_version: string | null;
  last_sync_at: string | null;
}

// ── SVG Icons (inline, no deps) ────────────────────────────────────────────

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1"/>
      <rect x="9" y="1" width="6" height="6" rx="1"/>
      <rect x="1" y="9" width="6" height="6" rx="1"/>
      <rect x="9" y="9" width="6" height="6" rx="1"/>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 10a2 2 0 100-4 2 2 0 000 4z"/>
      <path d="M13.4 8a5.4 5.4 0 01-.05.7l1.5 1.2-1.4 2.4-1.8-.7a5 5 0 01-1.2.7l-.3 1.9H6.8l-.3-1.9a5 5 0 01-1.2-.7l-1.8.7-1.4-2.4 1.5-1.2A5.4 5.4 0 012.6 8a5.4 5.4 0 01.05-.7L1.1 6.1l1.4-2.4 1.8.7a5 5 0 011.2-.7L5.8 1.8h2.4l.3 1.9a5 5 0 011.2.7l1.8-.7 1.4 2.4-1.5 1.2c.04.23.05.46.05.7z"/>
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1L2 4v4c0 3.3 2.5 6.4 6 7.2C11.5 14.4 14 11.3 14 8V4L8 1zm3 8.3l-.7.7L8 7.7l-2.3 2.3-.7-.7L7.3 7 5 4.7l.7-.7L8 6.3l2.3-2.3.7.7L8.7 7l2.3 2.3z"/>
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3v-1.5H3.5v-9H6V2zm4.146 2.646L8.793 6H13v1H8.793l1.353 1.354-.707.707L6.586 6.5l2.853-2.854.707.707z" transform="rotate(180 8 8)"/>
    </svg>
  );
}

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
    </svg>
  );
}

// ── Brand logo — warm dark ready ──────────────────────────────────────────

function MooterLogo({ size = 32 }: { size?: number }) {
  // Matches landing MOOTER_MARK — horns grey (#B8C0C8), inner ear rose, head/muzzle pink.
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-label="Mooter logo">
      <path fill="#B8C0C8" d="M2 2c-1 1 1 7 4.5 8.5S11 6 10 6C6.5 6 4 0 2 2z"/>
      <path fill="#B8C0C8" d="M34 2c1 1-1 7-4.5 8.5S25 6 26 6c3.5 0 6-6 8-4z"/>
      <path fill="#F5D7D8" d="M4.5 3.5c-.5.5 1 5 3 6s3-3.5 2-3.5c-2 0-3.5-3-5-2.5z"/>
      <path fill="#F5D7D8" d="M31.5 3.5c.5.5-1 5-3 6s-3-3.5-2-3.5c2 0 3.5-3 5-2.5z"/>
      <path fill="#B8C0C8" d="M4 8s-4 2-4 11c0 0 6-1 7-3 0 0 2-12.25-3-8z"/>
      <path fill="#B8C0C8" d="M27.995 8.043s4 2 4 11c0 0-6-.999-7-2.999 0 0-2-12.251 3-8.001z"/>
      <path fill="#CCD3DA" d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z"/>
      <path fill="#EDAEB0" d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z"/>
      <ellipse fill="#C16A6F" cx="9.5" cy="26" rx="1.5" ry="3"/>
      <ellipse fill="#C16A6F" cx="26.5" cy="26" rx="1.5" ry="3"/>
      <path fill="#2C2F33" d="M11 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
      <path fill="#2C2F33" d="M21 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
    </svg>
  );
}

// ── Nav items ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { href: '/settings', label: 'Settings', icon: SettingsIcon },
];

const ADMIN_ITEM = { href: '/admin', label: 'Admin', icon: AdminIcon };

// ── Page titles ─────────────────────────────────────────────────────────────

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/admin')) return 'Admin';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Dashboard';
}

// Wave 10 B.2b.2 F-12 — friendly OS label for the sidebar (telemetry payload
// keeps the raw os_type; only the display is humanized).
function osLabel(os: string | null): string {
  if (os === 'win32') return 'Windows';
  if (os === 'darwin') return 'macOS';
  if (os === 'linux') return 'Linux';
  return os || 'Unknown OS';
}

// ── Shell Layout ────────────────────────────────────────────────────────────

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<ShellUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Wave 14 Day 4 (14B-B) — dashboard + settings adopt the landing dark palette
  // via .app-shell-dark (overrides the light .app-shell-root tokens). /admin
  // stays on the light parchment shell for now.
  const shellClass = pathname.startsWith('/admin') ? 'app-shell-root' : 'app-shell-root app-shell-dark';

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        if (data.email) {
          setUser({
            email: data.email,
            is_admin: data.email === ADMIN_EMAIL,
            hw_tier: data.hw_tier || null,
            gpu_name: data.gpu_name || null,
            os_type: data.os_type || null,
            frugal_version: data.frugal_version || null,
            last_sync_at: data.last_sync_at || null,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className={shellClass} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem', fontFamily: 'var(--font-sans), sans-serif' }}>Loading…</div>
      </div>
    );
  }

  // Not authenticated — hero login
  if (!user) {
    return <LoginHero />;
  }

  const handleLogout = () => {
    document.cookie = 'sb-access-token=; max-age=0; path=/';
    window.location.href = '/';
  };

  const items = user.is_admin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <div className={shellClass} style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="app-sidebar-logo" style={{ padding: '18px 16px 20px', borderBottom: '1px solid var(--border)' }}>
          <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MooterLogo size={24} />
            <span style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font-sans), sans-serif', letterSpacing: '-0.02em' }}>mooter</span>
          </a>
          <button
            className="app-sidebar-toggle"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle menu"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {sidebarOpen ? (
                <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z"/>
              ) : (
                <path d="M2 4.5h12a.5.5 0 010 1H2a.5.5 0 010-1zm0 3h12a.5.5 0 010 1H2a.5.5 0 010-1zm0 3h12a.5.5 0 010 1H2a.5.5 0 010-1z"/>
              )}
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {items.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`app-nav-link${active ? ' active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon />
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="app-sidebar-user" style={{ padding: '14px 14px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--accent)', color: 'var(--cream)',
              display: 'grid', placeItems: 'center',
              fontSize: '0.72rem', fontWeight: 700,
              flexShrink: 0,
              fontFamily: 'var(--font-sans), sans-serif',
            }}>
              {user.email[0].toUpperCase()}
            </div>
            <span style={{
              fontSize: '0.72rem', color: 'var(--text-2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
              fontFamily: 'var(--font-mono), monospace',
            }}>
              {user.email}
            </span>
          </div>
          {user.gpu_name && (
            <div style={{
              fontSize: '0.68rem',
              color: 'var(--muted)',
              fontFamily: 'var(--font-mono), monospace',
              padding: '6px 10px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)',
              marginBottom: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}>
              <span style={{ color: 'var(--accent-soft)' }}>{formatGpuLabel(user.gpu_name)}</span>
              <span>{osLabel(user.os_type)} · {user.hw_tier}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="app-nav-link"
            style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
          >
            <LogoutIcon />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        {/* Top bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)',
        }}>
          <h1 style={{
            fontSize: '1.4rem', fontWeight: 700, margin: 0, color: 'var(--text)',
            fontFamily: 'var(--font-sans), sans-serif', letterSpacing: '-0.02em',
          }}>
            {pageTitle(pathname)}
          </h1>
          <span style={{
            fontSize: '0.72rem', color: 'var(--muted)',
            fontFamily: 'var(--font-mono), monospace', letterSpacing: '0.04em',
          }}>
            {user.frugal_version
              ? <VersionBadge version={user.frugal_version} lastSync={user.last_sync_at} />
              : 'v—'}
          </span>
        </div>

        {children}
      </main>
    </div>
  );
}

// ── Login hero — split-screen dark (brand parity with the landing) ──────────

function LoginHero() {
  const handleLogin = () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    window.location.href =
      `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize` +
      `?provider=github` +
      `&redirect_to=${encodeURIComponent(redirectTo)}` +
      // Privacy-first (Wave 33.7): minimal scopes, no public_repo write grant.
      `&scopes=read:user,user:email`;
  };

  return (
    // app-shell-root keeps the .login-hero grid CSS; app-shell-dark flips the
    // tokens to the landing dark palette (Wave 15 F-A1). NavBar gives brand
    // parity + an escape back to the landing.
    <div className="app-shell-root app-shell-dark">
      <NavBar />
      <div className="login-hero">
        {/* Left — auth */}
        <div className="login-hero-left">
          <div style={{ maxWidth: 440 }}>
            {/* Brand lives in the NavBar above — no in-hero logo (Wave 15). */}
            {/* Headline */}
            <h1 style={{
              fontSize: 'clamp(2.2rem, 4.5vw, 2.9rem)',
              fontWeight: 700,
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
              color: 'var(--text)',
              fontFamily: 'var(--font-sans), sans-serif',
              margin: '0 0 16px',
            }}>
              Route smarter.
            </h1>

            <p style={{
              fontSize: '1rem',
              color: 'var(--text-2)',
              lineHeight: 1.55,
              maxWidth: 420,
              margin: '0 0 36px',
            }}>
              Sign in only for federated wisdom and cross-device sync. Mooter
              works fully offline without an account — sign-in just lets your
              savings and routing history follow you across machines.
            </p>

            {/* GitHub CTA */}
            <button
              onClick={handleLogin}
              style={{
                width: '100%',
                maxWidth: 360,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: 'var(--accent)',
                color: 'var(--cream)',
                border: 'none',
                padding: '12px 22px',
                borderRadius: 'var(--r-md)',
                fontSize: '0.95rem',
                fontWeight: 600,
                fontFamily: 'var(--font-sans), sans-serif',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                boxShadow: '0 12px 32px -8px rgba(194,95,101,0.4)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#a54e54'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; }}
            >
              <GitHubIcon size={18} />
              Continue with GitHub
            </button>

            <p style={{
              color: 'var(--muted)',
              fontSize: '0.72rem',
              marginTop: 12,
              fontFamily: 'var(--font-mono), monospace',
              letterSpacing: '0.04em',
            }}>
              Free forever · MIT · No credit card
            </p>
            <p style={{
              color: 'var(--muted)',
              fontSize: '0.72rem',
              marginTop: 8,
              lineHeight: 1.5,
              maxWidth: 360,
              fontFamily: 'var(--font-mono), monospace',
            }}>
              🔒 GitHub scopes: <code>read:user user:email</code> only. We never
              read your code or private repos.
            </p>
            {/* Wave 15 F-A2 — removed the seeded "community" stats. Friends-launch
                is Paulo's personal launch; real numbers live behind sign-in, not
                fabricated on the gate. */}
          </div>
        </div>

        {/* Right — statusline mockup */}
        <div className="login-hero-right">
          <LoginStatuslinePreview />
        </div>
      </div>
    </div>
  );
}

/* Static mockup of the mooter statusline — visual only */
function LoginStatuslinePreview() {
  return (
    <div style={{
      width: '100%', maxWidth: 440,
      background: '#0D0B08',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      boxShadow: '0 24px 60px -24px rgba(0,0,0,0.6)',
      fontFamily: 'var(--font-mono), monospace',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: '#181410',
        borderBottom: '1px solid #2A2218',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a332b' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a332b' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a332b' }} />
        <span style={{
          fontSize: 11, color: '#8A7A6A', letterSpacing: '0.04em',
          marginLeft: 6,
        }}>
          ~/app · claude-code · mooter active
        </span>
      </div>

      <div style={{
        padding: '18px 16px',
        fontSize: 12, lineHeight: 1.7, color: 'var(--text-2)',
      }}>
        <div style={{ color: 'var(--muted)' }}>$ mooter &quot;fix the login button&quot;</div>
        <div>
          <span style={{ color: 'var(--muted)' }}>  ├─ classify</span>{' '}
          <span style={{ color: 'var(--green)' }}>8ms</span>{' '}
          <span style={{ color: 'var(--muted)' }}>→ TRIVIAL</span>
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>  └─ route</span>{' '}
          <span style={{ color: 'var(--accent-soft)' }}>→ qwen2.5:3b</span>{' '}
          <span style={{ color: 'var(--green)' }}>$0.000</span>
        </div>
      </div>

      {/* Statusline */}
      <div style={{
        padding: '10px 14px',
        background: '#0A0807',
        borderTop: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-2)',
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <span style={{ color: 'var(--accent-soft)', fontWeight: 700 }}>mooter</span>
        <span style={{ color: 'var(--faint)' }}>│</span>
        <span style={{ color: 'var(--green)', fontWeight: 700 }}>T0</span>
        <span style={{ color: 'var(--faint)' }}>│</span>
        <span style={{ color: 'var(--text-2)' }}>42p</span>
        <span style={{ color: 'var(--faint)' }}>·</span>
        <span style={{ color: 'var(--yellow)' }}>$0.18 spent</span>
        <span style={{ color: 'var(--faint)', marginLeft: 'auto' }}>·</span>
        <span style={{ color: 'var(--green)', fontWeight: 700 }}>$1.68 saved</span>
      </div>

      {/* Second row — tier share */}
      <div style={{
        padding: '8px 14px 12px',
        background: '#0A0807',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: '0.08em' }}>routing</span>
        <div style={{ flex: 1, height: 6, background: '#1c1815', borderRadius: 3, overflow: 'hidden', display: 'flex', marginLeft: 8 }}>
          <span style={{ width: '58%', height: '100%', background: 'var(--tier-0)' }} />
          <span style={{ width: '22%', height: '100%', background: 'var(--tier-1)' }} />
          <span style={{ width: '14%', height: '100%', background: 'var(--tier-2)' }} />
          <span style={{ width: '6%',  height: '100%', background: 'var(--tier-3)' }} />
        </div>
      </div>
    </div>
  );
}
