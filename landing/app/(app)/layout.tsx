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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="app-sidebar-logo" style={{ padding: '20px 16px 24px', borderBottom: '1px solid var(--border)' }}>
          <a href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.25rem' }}>🐮</span>
            <span style={{ fontSize: '0.95rem', color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font)' }}>mooter</span>
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
        <nav style={{ flex: 1, padding: '12px 8px' }}>
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
        <div className="app-sidebar-user" style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--accent)', color: 'var(--bg)',
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

// ── Login hero ──────────────────────────────────────────────────────────────

type LoginStats = { prompt_count: number; savings_pct: number; savings_usd: number };

function useLoginStats(): LoginStats {
  const [stats, setStats] = useState<LoginStats>({
    prompt_count: 1437,
    savings_pct: 89.9,
    savings_usd: 6.29,
  });
  useEffect(() => {
    const hubBase =
      process.env.NEXT_PUBLIC_MOOTER_HUB_URL ||
      process.env.NEXT_PUBLIC_FRUGAL_HUB_URL ||
      'https://mooter-hub.frugal-hub.workers.dev';
    fetch(`${hubBase}/api/stats`, { signal: AbortSignal.timeout(3000) })
      .then(r => r.json())
      .then(data => {
        if (data?.prompt_count) {
          setStats({
            prompt_count: data.prompt_count,
            savings_pct: data.avg_savings_pct ?? 89.9,
            savings_usd: data.total_savings_usd ?? 6.29,
          });
        }
      })
      .catch(() => {});
  }, []);
  return stats;
}

function LoginHero() {
  const stats = useLoginStats();

  const handleLogin = () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    window.location.href =
      `${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}/auth/v1/authorize` +
      `?provider=github` +
      `&redirect_to=${encodeURIComponent(redirectTo)}` +
      `&scopes=read:user,public_repo`;
  };

  const fmtNum = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'clamp(3rem, 8vw, 5rem) 24px',
    }}>
      {/* Inline keyframes for the logo float + glow — mirrors landing's .hero-logo-mark */}
      <style>{`
        @keyframes mooter-logo-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: 560, textAlign: 'center' }}>
        {/* Logo mark (proper cow, not emoji) */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            animation: 'mooter-logo-float 5s ease-in-out infinite',
            filter: 'drop-shadow(0 16px 40px rgba(255, 107, 53, 0.32))',
            willChange: 'transform',
          }}>
            <MooterLogo size={104} />
          </div>
        </div>

        {/* Headline — mirrors landing exactly */}
        <h1 style={{
          fontSize: 'clamp(2.2rem, 5vw, 3.2rem)',
          fontWeight: 700,
          letterSpacing: '-0.04em',
          lineHeight: 1.05,
          color: 'var(--text)',
          fontFamily: 'var(--font)',
          margin: '0 0 1rem',
        }}>
          Route smarter. <span style={{ color: 'var(--accent)' }}>Ship faster.</span>
        </h1>

        <p style={{
          fontSize: '1rem',
          color: 'var(--muted)',
          lineHeight: 1.6,
          maxWidth: 460,
          margin: '0 auto 36px',
        }}>
          mooter picks the cheapest model that can actually do each prompt — locally when possible,
          Claude Max when it matters. Your keys stay on your machine.
        </p>

        {/* Live stats strip — numbers from the community, matches landing's counter aesthetic */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 32,
          padding: '18px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
        }}>
          <StatCell value={fmtNum(stats.prompt_count)} label="prompts routed" accent />
          <StatCell value={`${stats.savings_pct.toFixed(1)}%`} label="avg savings" />
          <StatCell value={`$${stats.savings_usd.toFixed(2)}`} label="saved (community)" />
        </div>

        {/* CTA */}
        <button
          onClick={handleLogin}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
          style={{
            width: '100%',
            maxWidth: 360,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'var(--accent)',
            color: '#000',
            border: 'none',
            padding: '0.9rem 2rem',
            borderRadius: 'var(--r-md)',
            fontSize: '1rem',
            fontWeight: 700,
            fontFamily: 'var(--font)',
            cursor: 'pointer',
            transition: 'filter 0.15s ease',
            boxShadow: '0 10px 30px rgba(255, 107, 53, 0.28)',
          }}
        >
          <GitHubIcon />
          Sign in with GitHub
        </button>

        <p style={{
          color: 'var(--muted)',
          fontSize: '0.78rem',
          marginTop: 12,
          fontFamily: 'var(--font)',
        }}>
          30 seconds · no credit card · your API keys stay local
        </p>

        {/* Providers row — mirrors landing's "routes to:" badge row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginTop: '2.5rem', flexWrap: 'wrap', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>routes to:</span>
          <OllamaIcon size={18} />
          <AnthropicIcon size={18} />
          <OpenAIIcon size={18} />
          <GeminiIcon size={18} />
          <QwenIcon size={18} />
          <DeepSeekIcon size={18} />
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>+ more</span>
        </div>
      </div>
    </div>
  );
}

function StatCell({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      <div style={{
        fontSize: '1.35rem',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color: accent ? 'var(--accent)' : 'var(--text)',
        fontFamily: 'var(--font)',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.68rem',
        color: 'var(--muted)',
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 500,
      }}>
        {label}
      </div>
    </div>
  );
}

// ── Brand logo + provider icons (mirror landing page.tsx:300-397) ──────────

function MooterLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" aria-label="Mooter logo">
      <rect x="14" y="22" width="72" height="64" rx="17" fill="#1C1209" />
      <rect x="6" y="32" width="17" height="22" rx="8.5" fill="#1C1209" />
      <rect x="77" y="32" width="17" height="22" rx="8.5" fill="#1C1209" />
      <rect x="9" y="34" width="13" height="18" rx="6.5" fill="#F5EDD4" />
      <rect x="78" y="34" width="13" height="18" rx="6.5" fill="#F5EDD4" />
      <rect x="17" y="24" width="66" height="60" rx="14" fill="#F5EDD4" />
      <circle cx="36" cy="46" r="6" fill="#1C1209" />
      <circle cx="64" cy="46" r="6" fill="#1C1209" />
      <circle cx="38" cy="44" r="2" fill="white" />
      <circle cx="66" cy="44" r="2" fill="white" />
      <rect x="24" y="58" width="52" height="26" rx="13" fill="#FF6B35" />
      <ellipse cx="38" cy="71" rx="5.5" ry="5" fill="#C04A0C" />
      <ellipse cx="62" cy="71" rx="5.5" ry="5" fill="#C04A0C" />
    </svg>
  );
}

function AnthropicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ededed">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  );
}

function OllamaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002z" />
    </svg>
  );
}

function OpenAIIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

function GeminiIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#8E75B2">
      <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
    </svg>
  );
}

function QwenIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#7C5CFC">
      <text x="3" y="18" fontFamily="Arial" fontWeight="800" fontSize="16">Q</text>
    </svg>
  );
}

function DeepSeekIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#4D8EFF">
      <text x="2" y="18" fontFamily="Arial" fontWeight="800" fontSize="16">D</text>
    </svg>
  );
}
