'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const ADMIN_EMAIL = 'paulo.loureiro.shp@gmail.com';

interface ShellUser {
  email: string;
  is_admin: boolean;
  hw_tier: string | null;
  gpu_name: string | null;
  os_type: string | null;
  frugal_version: string | null;
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

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
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

// ── Shell Layout ────────────────────────────────────────────────────────────

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<ShellUser | null>(null);
  const [loading, setLoading] = useState(true);

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
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Loading state
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading...</div>
      </div>
    );
  }

  // Not authenticated — inline login (PEÇA 5)
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 8, fontFamily: 'var(--mono)' }}>f</div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: 8, color: 'var(--text)' }}>frugal</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>Sign in to access your dashboard</p>
          <button
            onClick={() => {
              const redirectTo = `${window.location.origin}/auth/callback`;
              window.location.href =
                `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/auth/v1/authorize` +
                `?provider=github` +
                `&redirect_to=${encodeURIComponent(redirectTo)}` +
                `&scopes=read:user,public_repo`;
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              padding: '10px 20px', borderRadius: 8, fontSize: '0.9rem',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            <GitHubIcon />
            Continue with GitHub
          </button>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    document.cookie = 'sb-access-token=; max-age=0; path=/';
    window.location.href = '/';
  };

  const items = user.is_admin ? [...NAV_ITEMS, ADMIN_ITEM] : NAV_ITEMS;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="app-sidebar">
        {/* Logo */}
        <div style={{ padding: '20px 16px 24px', borderBottom: '1px solid var(--border)' }}>
          <a href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>f</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--text)', fontWeight: 600 }}>frugal</span>
          </a>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 8px' }}>
          {items.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`app-nav-link${active ? ' active' : ''}`}
              >
                <Icon />
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--accent)', color: '#000',
              display: 'grid', placeItems: 'center',
              fontSize: '0.75rem', fontWeight: 700,
            }}>
              {user.email[0].toUpperCase()}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {user.email}
            </span>
          </div>
          {user.gpu_name && (
            <div style={{
              fontSize: '0.7rem',
              color: 'var(--muted)',
              fontFamily: 'var(--mono)',
              padding: '4px 0',
              borderTop: '1px solid var(--border)',
              marginTop: 6,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}>
              <span style={{ color: 'var(--accent)' }}>{user.gpu_name}</span>
              <span>{user.os_type} · {user.hw_tier}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="app-nav-link"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
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
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
            {pageTitle(pathname)}
          </h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {user.frugal_version ? `v${user.frugal_version}` : 'v\u2014'}
          </span>
        </div>

        {children}
      </main>
    </div>
  );
}
