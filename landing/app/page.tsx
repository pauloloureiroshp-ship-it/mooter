'use client';

import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

function loginWithGitHub() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get('cli') === '1') {
    sessionStorage.setItem('cli_login', '1');
  }
  const redirectTo = `${window.location.origin}/auth/callback`;
  window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectTo)}`;
}

/* -----------------------------------------------------------------
 * ErrorBoundary
 * ----------------------------------------------------------------- */

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e: Error) { console.warn('[ErrorBoundary]', e.message); }
  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

/* -----------------------------------------------------------------
 * Hooks
 * ----------------------------------------------------------------- */

function useInView(ref: RefObject<HTMLDivElement | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

function useCommunityStats() {
  const [stats, setStats] = useState({
    prompt_count: 1437,
    savings_pct: 89.9,
    savings_usd: 6.29,
    user_count: 1,
  });
  const [live, setLive] = useState(false);

  useEffect(() => {
    const fetchStats = () =>
      fetch(
        (process.env.NEXT_PUBLIC_MOOTER_HUB_URL ||
          process.env.NEXT_PUBLIC_FRUGAL_HUB_URL ||
          'https://mooter-hub.frugal-hub.workers.dev') + '/api/stats',
        { signal: AbortSignal.timeout(3000) },
      )
        .then(r => r.json())
        .then(data => {
          if (data?.prompt_count) {
            setStats({
              prompt_count: data.prompt_count,
              savings_pct: data.avg_savings_pct ?? 90.2,
              savings_usd: data.total_savings_usd ?? 6.29,
              user_count: data.user_count ?? 1,
            });
            setLive(true);
          }
        })
        .catch(() => {});

    fetchStats();
    const id = setInterval(fetchStats, 30_000);
    return () => clearInterval(id);
  }, []);

  return { stats, live };
}

function Reveal({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  return (
    <div ref={ref} className={`reveal ${visible ? 'visible' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}

function scrollTo(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function AnimatedNumber({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const visible = useInView(ref as RefObject<HTMLDivElement | null>);

  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    let start = 0;
    const end = value;
    const duration = 1200;
    const step = (end / duration) * 16;
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); return; }
      setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [visible, value]);

  return (
    <span ref={ref as React.RefObject<HTMLSpanElement>}>
      {prefix}{decimals > 0 ? display.toFixed(decimals) : Math.floor(display).toLocaleString()}{suffix}
    </span>
  );
}

/* -----------------------------------------------------------------
 * Router Animation — live classification terminal
 * ----------------------------------------------------------------- */

const ROUTER_DEMOS = [
  { prompt: 'make this button blue', tier: 'T0', model: 'qwen2.5:3b · free', ms: 9, cost: '$0.000', conf: 98, color: '#22c55e' },
  { prompt: 'rename userInfo to currentUser', tier: 'T0', model: 'qwen2.5:3b · free', ms: 7, cost: '$0.000', conf: 99, color: '#22c55e' },
  { prompt: 'app crashes only on mobile', tier: 'T2', model: 'Sonnet', ms: 21, cost: '$0.010', conf: 87, color: '#a78bfa' },
  { prompt: 'write unit tests for auth', tier: 'T1', model: 'Haiku', ms: 14, cost: '$0.001', conf: 91, color: '#3b82f6' },
  { prompt: 'redesign DB for multi-tenant', tier: 'T3', model: 'Opus · guardrail', ms: 28, cost: '$0.050', conf: 97, color: '#f87171' },
];

function RouterAnimation() {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'classifying' | 'done'>('typing');

  const cur = ROUTER_DEMOS[idx];

  useEffect(() => {
    let typeInterval: ReturnType<typeof setInterval>;
    let t: ReturnType<typeof setTimeout>;

    setPhase('typing');
    setTyped(0);

    let i = 0;
    typeInterval = setInterval(() => {
      i++;
      setTyped(i);
      if (i >= cur.prompt.length) {
        clearInterval(typeInterval);
        t = setTimeout(() => {
          setPhase('classifying');
          t = setTimeout(() => {
            setPhase('done');
            t = setTimeout(() => setIdx(x => (x + 1) % ROUTER_DEMOS.length), 2800);
          }, 480);
        }, 180);
      }
    }, 26);

    return () => { clearInterval(typeInterval); clearTimeout(t); };
  }, [idx, cur.prompt.length]);

  return (
    <div className="router-anim" aria-label="Mooter routing demo">
      <div className="ra-header">
        <span className="ra-dot ra-dot-red" />
        <span className="ra-dot ra-dot-yellow" />
        <span className="ra-dot ra-dot-green" />
        <span className="ra-title">mooter · classify.js · &lt;50ms</span>
      </div>

      <div className="ra-body">
        <div className="ra-line">
          <span className="ra-ps1">›</span>{' '}
          <span className="ra-cmd">mooter classify</span>{' '}
          <span className="ra-arg">&ldquo;{cur.prompt.slice(0, typed)}&rdquo;</span>
          {phase === 'typing' && <span className="ra-cursor" />}
        </div>

        {phase !== 'typing' && (
          <div className="ra-output">
            {phase === 'classifying' ? (
              <span className="ra-classifying-txt">
                classifying<span style={{ animation: 'blink 1s steps(3) infinite' }}>…</span>
              </span>
            ) : (
              <div className="ra-result-row">
                <span className="ra-tier" style={{ color: cur.color, borderColor: cur.color }}>
                  {cur.tier}
                </span>
                <span className="ra-result-model" style={{ color: cur.color }}>{cur.model}</span>
                <span className="ra-result-meta">{cur.ms}ms</span>
                <span className="ra-result-cost" style={{ color: cur.color }}>{cur.cost}</span>
                <span className="ra-result-meta">{cur.conf}% conf ✓</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ra-footer">
        {ROUTER_DEMOS.map((d, i) => (
          <span
            key={i}
            className={`ra-pip ${i === idx ? 'ra-pip-active' : ''}`}
            style={i === idx ? { background: cur.color } : {}}
          />
        ))}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------
 * Animated Tier Bar
 * ----------------------------------------------------------------- */

function AnimatedTierBar({
  pct, color, label, cost, delay = 0,
}: { pct: number; color: string; label: string; cost: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref as RefObject<HTMLDivElement | null>);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (!visible || triggered) return;
    const t = setTimeout(() => setTriggered(true), delay);
    return () => clearTimeout(t);
  }, [visible, delay, triggered]);

  return (
    <div className="tier-bar" ref={ref}>
      <div className="tier-label">
        {label}<br />
        <span style={{ fontSize: '0.7rem', color, fontFamily: 'var(--mono)' }}>{cost}</span>
      </div>
      <div className="tier-track">
        <div
          className="tier-fill"
          style={{
            width: triggered ? `${pct}%` : '0%',
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            transition: `width 1.5s cubic-bezier(0.4, 0, 0.2, 1)`,
          }}
        />
      </div>
      <div className="tier-pct-label" style={{ color }}>
        {pct}%
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------
 * Mooter Logo (improved cow head SVG)
 * ----------------------------------------------------------------- */

function MooterLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Mooter logo"
    >
      <path fill="#E8DCC8" d="M1 1c-1.01.99 1 8 5 9s4-5 3-5C5 5 3.042-1 1 1z" />
      <path fill="#E8DCC8" d="M35.297 1c1.011.99-1 8-5 9s-4-5-3-5c4 0 5.959-6 8-4z" />
      <path fill="#B8C0C8" d="M4 8s-4 2-4 11c0 0 6-1 7-3 0 0 2-12.25-3-8z" />
      <path fill="#B8C0C8" d="M27.995 8.043s4 2 4 11c0 0-6-.999-7-2.999 0 0-2-12.251 3-8.001z" />
      <path fill="#CCD3DA" d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z" />
      <path fill="#EDAEB0" d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z" />
      <ellipse fill="#C16A6F" cx="9.5" cy="26" rx="1.5" ry="3" />
      <ellipse fill="#C16A6F" cx="26.5" cy="26" rx="1.5" ry="3" />
      <path fill="#2C2F33" d="M11 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z" />
      <path fill="#2C2F33" d="M21 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z" />
    </svg>
  );
}

/* -----------------------------------------------------------------
 * Provider icons
 * ----------------------------------------------------------------- */

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

/* -----------------------------------------------------------------
 * GitHub Icon
 * ----------------------------------------------------------------- */

function GitHubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/* -----------------------------------------------------------------
 * VS Code Icon
 * ----------------------------------------------------------------- */

function VSCodeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#007ACC">
      <path d="M17.583.063a1.5 1.5 0 0 0-.875.375L8.29 7.689 3.375 3.95a1 1 0 0 0-1.293.082L.32 5.752a1 1 0 0 0 0 1.415L4.167 12 .32 16.833a1 1 0 0 0 0 1.415l1.762 1.72a1 1 0 0 0 1.293.082L8.29 16.31l8.418 7.252a1.5 1.5 0 0 0 .875.375A1.5 1.5 0 0 0 19.083 22.5V1.5A1.5 1.5 0 0 0 17.583.063zM17.5 18.27l-6.82-6.27 6.82-6.27z" />
    </svg>
  );
}

/* -----------------------------------------------------------------
 * Install Block
 * ----------------------------------------------------------------- */

const INSTALL_BASH =
  'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';
const INSTALL_NPM = 'npx @mooter/cli install';

function InstallBlock({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'npm' | 'bash'>('bash');
  const [copied, setCopied] = useState(false);
  const cmd = mode === 'npm' ? INSTALL_NPM : INSTALL_BASH;

  const copy = () => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="install-block">
      <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: 3 }}>
        <button
          onClick={() => setMode('npm')}
          style={{
            padding: '4px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: mode === 'npm' ? 'var(--accent)' : 'none',
            color: mode === 'npm' ? '#000' : 'var(--muted)',
            border: 'none',
          }}
        >
          npm
        </button>
        <button
          onClick={() => setMode('bash')}
          style={{
            padding: '4px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: mode === 'bash' ? 'var(--accent)' : 'none',
            color: mode === 'bash' ? '#000' : 'var(--muted)',
            border: 'none',
          }}
        >
          bash
        </button>
      </div>

      <button className={`btn btn-primary ${compact ? '' : 'hero-cta'}`} onClick={copy}
        style={{ background: 'var(--accent)', color: '#000' }}>
        {copied ? '✓ Copied!' : 'Copy install command'}
      </button>

      <div className="install-cmd" onClick={copy} style={{ maxWidth: 580 }}>{cmd}</div>
      <div className="install-note">
        {mode === 'npm'
          ? 'Requires: Node.js ≥18 · Claude Code · local models recommended'
          : 'Requires: Node.js ≥18 · Claude Code · curl'}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------
 * NAV — scroll-aware, cleaner
 * ----------------------------------------------------------------- */

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className="nav"
      style={{
        background: scrolled ? 'rgba(10,10,10,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        transition: 'background 0.3s, backdrop-filter 0.3s, border-bottom 0.3s',
      }}
    >
      <div className="container nav-row">
        <a href="#top" onClick={scrollTo('top')} className="brand">
          <MooterLogo size={42} />
          <span className="nav-brand-name">mooter</span>
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollTo('how')}>How it works</a>
          <a href="#models" onClick={scrollTo('models')}>Models</a>
          <a href="#demo" onClick={scrollTo('demo')}>Demo</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
          <a href="#install" onClick={scrollTo('install')}>Install</a>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <a
            href="https://github.com/pauloloureiroshp-ship-it/frugal"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
            aria-label="GitHub"
          >
            <GitHubIcon size={18} />
          </a>
          <button
            onClick={loginWithGitHub}
            className="btn btn-sm btn-ghost"
            style={{ cursor: 'pointer' }}
          >
            Sign in
          </button>
          <a href="#install" onClick={scrollTo('install')} className="btn btn-sm btn-primary"
            style={{ background: 'var(--accent)', color: '#000', fontWeight: 700 }}>
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}

/* -----------------------------------------------------------------
 * HERO — Two-column, new headline
 * ----------------------------------------------------------------- */

function Hero() {
  const { stats, live } = useCommunityStats();

  return (
    <section id="top" className="hero">
      <div className="container" style={{ maxWidth: 1100 }}>
        <div className="hero-grid">
          {/* Left column — copy */}
          <div className="hero-copy" style={{ maxWidth: 620 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 0.9rem',
              borderRadius: 999,
              border: '1px solid rgba(232,136,138,0.25)',
              background: 'rgba(232,136,138,0.06)',
              fontSize: '0.78rem',
              color: 'var(--accent)',
              marginBottom: '1.5rem',
              fontWeight: 500,
            }}>
              Open Source · Free forever · MIT License
            </div>

            <h1 className="hero-title" style={{ textAlign: 'left', maxWidth: 580 }}>
              You have the setup.{' '}
              <span style={{ color: 'var(--accent)' }}>You just don&apos;t know it yet.</span>
            </h1>

            <p className="hero-subtitle" style={{ textAlign: 'left', maxWidth: 560, marginLeft: 0 }}>
              Your GPU, your subscriptions, your local models — you&apos;re already paying for a powerful AI setup.
              But Claude Code defaults to Opus for everything. Even renaming a variable.
              Mooter maps your entire environment and routes every prompt to the optimal model.{' '}
              <strong style={{ color: 'var(--text)' }}>Same results. Up to 90% less cost. Your project never stops.</strong>
            </p>

            <div className="hero-cta-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2rem' }}>
              <a
                href="#install"
                onClick={scrollTo('install')}
                className="btn btn-primary"
                style={{ background: 'var(--accent)', color: '#000', fontWeight: 700, padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}
              >
                Get started
              </a>
              <a
                href="#demo"
                onClick={scrollTo('demo')}
                className="btn btn-ghost"
                style={{ padding: '0.75rem 1.75rem', fontSize: '0.95rem' }}
              >
                See it in action
              </a>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', marginTop: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22 17.607c-.786 2.28-3.139 6.317-5.563 6.361-1.608.031-2.125-.953-3.963-.953-1.837 0-2.412.923-3.932.983-2.572.099-6.542-5.827-6.542-10.995 0-4.747 3.308-7.1 6.198-7.143 1.55-.028 3.014 1.045 3.959 1.045.949 0 2.727-1.29 4.596-1.101.782.033 2.979.315 4.389 2.377-3.741 2.442-3.158 7.549.858 9.426zm-5.222-17.607c-2.826.114-5.132 3.079-4.81 5.531 2.612.203 5.118-2.725 4.81-5.531z"/></svg>
                macOS
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                Windows
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--muted)' }}>
                <VSCodeIcon size={14} />
                VS Code
              </span>
            </div>

            {/* Metrics row */}
            <div className="hero-metrics" style={{
              display: 'flex',
              gap: '2rem',
              marginTop: '2.5rem',
              flexWrap: 'wrap',
            }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                  <AnimatedNumber value={stats.prompt_count} suffix="+" />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>prompts routed</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                  ~<AnimatedNumber value={stats.savings_pct} decimals={0} suffix="%" />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>avg savings</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--text)' }}>10+</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>models supported</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>&lt;50ms</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>classification</div>
              </div>
            </div>


            {live && (
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }} />
                live stats from community hub
              </div>
            )}
          </div>

          {/* Right column — Router Animation */}
          <div>
            <RouterAnimation />
            <div className="hero-providers" style={{ marginTop: '1rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginRight: 8 }}>routes to:</span>
              <OllamaIcon size={16} />
              <AnthropicIcon size={16} />
              <OpenAIIcon size={16} />
              <GeminiIcon size={16} />
              <QwenIcon size={16} />
              <DeepSeekIcon size={16} />
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 6 }}>+ more</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * THE PROBLEM — You don't know what you already have + scenarios
 * ----------------------------------------------------------------- */

function ProblemSection() {
  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">
            You&apos;re already paying.{' '}
            <span style={{ color: 'var(--accent)' }}>You&apos;re just not optimizing.</span>
          </h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Your GPU can run models locally at $0. Your subscription includes tokens you never fully use.
            Claude Code defaults to Opus for everything — even renaming a variable. Mooter fixes this.
          </p>
        </Reveal>

        <div className="steps-grid stagger" style={{ marginTop: '2rem' }}>
          <Reveal className="step-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="step-num" style={{ fontSize: '1.5rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div className="step-title">Hardware underused</div>
            <div className="step-desc">
              Your GPU can run 14B-parameter models at $0. Claude Code ignores it and sends every prompt to a paid API.
            </div>
          </Reveal>

          <Reveal className="step-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="step-num" style={{ fontSize: '1.5rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div className="step-title">Subscription leaking</div>
            <div className="step-desc">
              You pay $20–200/month. Like Netflix, the bill comes whether you optimize or not. 84% of prompts don&apos;t need Opus.
            </div>
          </Reveal>

          <Reveal className="step-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="step-num" style={{ fontSize: '1.5rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="step-title">No budget control</div>
            <div className="step-desc">
              No daily ceiling. No token tracking. You find out you overspent when it&apos;s already too late.
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="scenarios-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '2.5rem' }}>
            <div style={{ padding: '1rem 1.25rem', borderRadius: 10, border: '1px solid rgba(76,175,106,0.2)', background: 'rgba(76,175,106,0.04)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--green)', marginBottom: '0.5rem' }}>Tokens expiring? Full power.</div>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>End of month, 80% unused. Mooter uses Opus for everything — you already paid for it.</p>
            </div>
            <div style={{ padding: '1rem 1.25rem', borderRadius: 10, border: '1px solid rgba(212,106,90,0.2)', background: 'rgba(212,106,90,0.04)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--tier-3)', marginBottom: '0.5rem' }}>Budget tight? Economy mode.</div>
              <p style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1.5, margin: 0 }}>Burned through tokens early. Local models for trivial, Opus only for critical. Project never stops.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * HOW IT WORKS — The routing engine
 * ----------------------------------------------------------------- */

function HowItWorks() {
  return (
    <section id="how" className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">The routing engine. 167 patterns. &lt;50ms. $0 to classify.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Every prompt passes through a 4-stage pipeline before reaching any model.
            Pure regex — no API calls, no network round-trips, no cost to route.
          </p>
        </Reveal>

        <div className="steps-grid stagger" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '2.5rem' }}>
          <Reveal className="step-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="step-num" style={{ fontSize: '1.5rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <div className="step-title">1. Classify</div>
            <div className="step-desc">
              167 regex patterns analyze complexity, risk signals, and intent in &lt;50ms.
              Locally. On your machine. No LLM needed to decide which LLM to use.
            </div>
          </Reveal>

          <Reveal className="step-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="step-num" style={{ fontSize: '1.5rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="step-title">2. Profile</div>
            <div className="step-desc">
              Your GPU, RAM, installed models, subscription tier, and budget ceiling are all factored in.
              The routing decision is unique to YOUR setup — not a generic config.
            </div>
          </Reveal>

          <Reveal className="step-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="step-num" style={{ fontSize: '1.5rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                <line x1="4" y1="4" x2="9" y2="9" />
              </svg>
            </div>
            <div className="step-title">3. Route</div>
            <div className="step-desc">
              Prompt goes to the optimal model. Local models when free is enough.
              Haiku for quick tasks. Sonnet for reasoning.
              Opus only when architecture, security, or production demands it.
            </div>
          </Reveal>

          <Reveal className="step-card" style={{ '--i': 3 } as React.CSSProperties}>
            <div className="step-num" style={{ fontSize: '1.5rem' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="step-title">4. Validate</div>
            <div className="step-desc">
              Every routing decision is logged with time, cost, and quality metrics.
              The savings algorithm is validated transparently.
              If a cheaper model can&apos;t handle it, guardrails escalate automatically.
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div style={{
            marginTop: '3rem',
            padding: '2rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1.5rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              How a prompt flows through mooter
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              flexWrap: 'wrap',
            }}>
              {[
                { label: 'Your prompt', color: 'var(--text)', bg: 'rgba(255,255,255,0.06)' },
                null,
                { label: 'classify.js', sub: '167 patterns · <50ms', color: 'var(--accent)', bg: 'rgba(232,136,138,0.08)' },
                null,
                { label: 'Profile match', sub: 'HW + SW + Sub + Budget', color: 'var(--tier-1)', bg: 'rgba(90,155,212,0.08)' },
                null,
                { label: 'Route', sub: 'T0/T1/T2/T3', color: 'var(--tier-2)', bg: 'rgba(168,139,212,0.08)' },
                null,
                { label: 'Best model responds', color: 'var(--green)', bg: 'rgba(76,175,106,0.08)' },
              ].map((item, i) => item === null ? (
                <svg key={i} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="14 7 19 12 14 17" /></svg>
              ) : (
                <div key={i} style={{
                  padding: '0.6rem 1rem',
                  borderRadius: 10,
                  border: `1px solid ${item.color}33`,
                  background: item.bg,
                  textAlign: 'center',
                  minWidth: 100,
                }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: item.color }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 2 }}>{item.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * MODELS — Every model has a specialty
 * ----------------------------------------------------------------- */

function ModelsSection() {
  const tiers = [
    {
      tier: 'T0',
      name: 'Local (Free, your hardware)',
      color: 'var(--tier-0, #4ec9b0)',
      models: [
        { name: 'qwen2.5:3b', desc: 'Fast triage, renames, commit messages', req: '2GB VRAM' },
        { name: 'qwen2.5-coder:14b', desc: 'Code-specialized local model', req: '9GB VRAM' },
        { name: 'qwen3:30b', desc: 'Advanced local reasoning', req: '20GB VRAM' },
        { name: 'gemma4:e4b', desc: 'Google\'s latest, multimodal', req: '8GB VRAM' },
        { name: 'deepseek-r1:7b', desc: 'Math and logic specialist', req: '4GB VRAM' },
      ],
    },
    {
      tier: 'T1',
      name: 'Claude Haiku',
      color: 'var(--tier-1, #3b82f6)',
      costLabel: '~$0.001/prompt',
      desc: 'Quick explanations, docstrings, simple transforms',
      models: [],
    },
    {
      tier: 'T2',
      name: 'Claude Sonnet',
      color: 'var(--tier-2, #a78bfa)',
      costLabel: '~$0.003/prompt',
      desc: 'Bug investigation, root cause analysis, technical planning',
      models: [],
    },
    {
      tier: 'T3',
      name: 'Claude Opus',
      color: 'var(--tier-3, #f87171)',
      costLabel: '~$0.015/prompt',
      desc: 'Architecture decisions, security reviews, production deploys',
      guardrail: 'Guardrail-protected: migrations, secrets, and deploys are ALWAYS routed here',
      models: [],
    },
  ];

  return (
    <section id="models" className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Every model has a specialty. Opus isn&apos;t always the answer.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            A brain surgeon shouldn&apos;t put on band-aids. Each model excels at different complexity
            levels — and mooter knows which one fits each prompt.
          </p>
        </Reveal>

        <div style={{ display: 'grid', gap: '1.25rem', marginTop: '2.5rem' }}>
          {tiers.map((t) => (
            <Reveal key={t.tier}>
              <div style={{
                background: 'var(--surface, rgba(255,255,255,0.03))',
                border: `1px solid ${t.color}22`,
                borderRadius: 12,
                padding: '1.25rem 1.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: t.models.length > 0 ? '1rem' : 0 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.6rem',
                    borderRadius: 6,
                    border: `1px solid ${t.color}`,
                    color: t.color,
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}>
                    {t.tier}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)' }}>{t.name}</span>
                  {t.costLabel && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: t.color }}>{t.costLabel}</span>
                  )}
                </div>

                {t.desc && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: t.models.length > 0 ? '0 0 0.75rem' : 0 }}>
                    {t.desc}
                  </p>
                )}

                {t.guardrail && (
                  <p style={{
                    color: t.color,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    marginTop: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    {t.guardrail}
                  </p>
                )}

                {t.models.length > 0 && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.6rem',
                  }}>
                    {t.models.map((m) => (
                      <div key={m.name} style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8,
                        padding: '0.6rem 0.8rem',
                      }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.82rem', fontWeight: 600, color: t.color }}>
                          {m.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>{m.desc}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--faint, #555)', marginTop: 3 }}>{m.req}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * DEMO — Interactive classify.js
 * ----------------------------------------------------------------- */

type PromptDemo = {
  prompt: string;
  category: string;
  classifyOutput: {
    tier: string;
    tierLabel: string;
    confidence: number;
    reasoning: string;
    matchedPatterns: string[];
    latencyMs: number;
  };
  model: string;
  modelShort: string;
  costPer1k: string;
  thisCost: string;
  opusCost: string;
  responseTime: string;
  tierColor: string;
  tierBg: string;
  savingPct: number;
  logo: ReactNode;
  whyThisModel: string;
};

const PROMPTS: PromptDemo[] = [
  {
    prompt: 'make this button blue and add a hover animation',
    category: 'UI tweak · Every vibe session',
    classifyOutput: {
      tier: 'T0',
      tierLabel: 'Free · Local · Instant',
      confidence: 0.98,
      reasoning: 'TRIVIAL fast-path: colour change + CSS animation. Single-element UI edit. No logic, no state, no risk.',
      matchedPatterns: ['TRIVIAL: colour/style change', 'TRIVIAL: CSS animation', 'short_prompt (<50 chars)', 'no_risk_signals'],
      latencyMs: 9,
    },
    model: 'qwen2.5:3b · local',
    modelShort: 'Local',
    costPer1k: '$0.000',
    thisCost: '$0.000',
    opusCost: '$0.050',
    responseTime: '0.3s',
    tierColor: 'var(--t0)',
    tierBg: 'rgba(78,201,176,0.07)',
    savingPct: 100,
    logo: <OllamaIcon />,
    whyThisModel: "Changing a button colour doesn't need a $120/h brain surgeon. A local model does it in 0.3s, free, while you sip your coffee. Without Mooter, Claude charges you $0.05 for this. Every. Single. Time.",
  },
  {
    prompt: 'my app crashes when I click submit but only on mobile, help',
    category: 'Bug hunt · Happens 10x a day',
    classifyOutput: {
      tier: 'T2',
      tierLabel: 'Sonnet · Smart enough',
      confidence: 0.87,
      reasoning: 'MED_RISK: "crashes" + "mobile" + conditional behaviour. Debugging intent, cross-platform context. Needs reasoning but not architecture review.',
      matchedPatterns: ['MED_RISK: crashes/bug', 'platform_specific: mobile', 'conditional_behaviour', 'debug_intent'],
      latencyMs: 21,
    },
    model: 'Claude Sonnet 4.6',
    modelShort: 'Sonnet',
    costPer1k: '$0.010',
    thisCost: '$0.010',
    opusCost: '$0.050',
    responseTime: '2.3s',
    tierColor: 'var(--t2)',
    tierBg: 'rgba(220,220,170,0.07)',
    savingPct: 80,
    logo: <AnthropicIcon />,
    whyThisModel: 'This bug needs real reasoning — understanding mobile event handling, touch events, viewport differences. Sonnet nails it at $0.01. Opus would answer the same thing for $0.05. Mooter knows the difference.',
  },
  {
    prompt: 'I need to build a payment system with Stripe, subscriptions, webhooks and fraud detection',
    category: 'New feature · High stakes',
    classifyOutput: {
      tier: 'T3',
      tierLabel: 'Opus · Maximum intelligence',
      confidence: 0.97,
      reasoning: 'HIGH_RISK: "payment" + "Stripe" + "webhooks" + "fraud detection". Financial data, security implications, multi-system architecture. Guardrail locked — cannot be demoted.',
      matchedPatterns: ['HIGH_RISK: payment/financial', 'HIGH_RISK: webhooks', 'HIGH_RISK: fraud/security', 'multi_system_scope', 'guardrail_locked'],
      latencyMs: 28,
    },
    model: 'Claude Opus 4.6',
    modelShort: 'Opus',
    costPer1k: '$0.050',
    thisCost: '$0.050',
    opusCost: '$0.050',
    responseTime: '6.1s',
    tierColor: 'var(--t3)',
    tierBg: 'rgba(244,115,115,0.07)',
    savingPct: 0,
    logo: <AnthropicIcon />,
    whyThisModel: "This is exactly what Opus is for. Payments, fraud, webhooks — one wrong decision and your users' money is at risk. Mooter never cuts corners here. Full power. No compromise.",
  },
];

function ClassifyBadge({ tier, color }: { tier: string; color: string }) {
  return <span className="classify-badge" style={{ color, borderColor: color }}>{tier}</span>;
}

function ConfidenceBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="conf-bar-wrap">
      <div className="conf-bar-track">
        <div className="conf-bar-fill" style={{ width: `${value * 100}%`, background: color }} />
      </div>
      <span className="conf-bar-label">{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function PromptCard({ p, index, active, onClick }: {
  p: PromptDemo; index: number; active: boolean; onClick: () => void;
}) {
  return (
    <div
      className={`prompt-card ${active ? 'prompt-card-active' : ''}`}
      style={{ '--pc-color': p.tierColor, '--pc-bg': p.tierBg } as React.CSSProperties}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div className="pc-left">
        <div className="pc-num" style={{ color: p.tierColor }}>{String(index + 1).padStart(2, '0')}</div>
        <div className="pc-cat">{p.category}</div>
      </div>
      <div className="pc-prompt">&ldquo;{p.prompt}&rdquo;</div>
      <div className="pc-right">
        <div className="pc-model-chip" style={{ color: p.tierColor, borderColor: p.tierColor }}>
          {p.logo}
          <span>{p.modelShort}</span>
        </div>
        <div className="pc-cost" style={{ color: p.tierColor }}>{p.thisCost}</div>
      </div>
    </div>
  );
}

function SavingsCalculator() {
  const [prompts, setPrompts] = useState(200);

  const promptOptions = [50, 100, 200, 500];

  // Cost per prompt at Opus rate (rough estimate)
  const opusCostPerPrompt = 0.045;
  const monthlyOpusCost = prompts * 30 * opusCostPerPrompt;

  // With mooter: weighted average
  const mooterCostPerPrompt = (0.84 * 0) + (0.05 * 0.001) + (0.08 * 0.003) + (0.03 * 0.015);
  const monthlyMooterCost = prompts * 30 * mooterCostPerPrompt;

  const savings = monthlyOpusCost - monthlyMooterCost;
  const savingsPct = monthlyOpusCost > 0 ? Math.round((savings / monthlyOpusCost) * 100) : 0;

  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">How much could you save?</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">Adjust your usage below. No signup required.</p>
        </Reveal>

        <Reveal>
          <div style={{
            maxWidth: 700,
            margin: '2rem auto 0',
            padding: '2rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
          }}>
            {/* Prompts per day */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
                Prompts per day: <strong style={{ color: 'var(--text)' }}>{prompts}</strong>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {promptOptions.map(v => (
                  <button
                    key={v}
                    onClick={() => setPrompts(v)}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: 8,
                      border: prompts === v ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: prompts === v ? 'rgba(232,136,138,0.1)' : 'var(--surface-2)',
                      color: prompts === v ? 'var(--accent)' : 'var(--muted)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      fontFamily: 'var(--mono)',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Results */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: '1rem',
              alignItems: 'center',
              marginTop: '1.5rem',
              padding: '1.5rem',
              background: 'var(--bg)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Without mooter</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--tier-3)', textDecoration: 'line-through', opacity: 0.7 }}>
                  ${monthlyOpusCost.toFixed(0)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>per month</div>
              </div>

              <div style={{ fontSize: '1.5rem', color: 'var(--accent)' }}>&rarr;</div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>With mooter</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                  ${monthlyMooterCost.toFixed(0)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>per month</div>
              </div>
            </div>

            <div style={{
              textAlign: 'center',
              marginTop: '1rem',
              padding: '0.75rem',
              borderRadius: 8,
              background: 'rgba(76,175,106,0.08)',
              border: '1px solid rgba(76,175,106,0.15)',
            }}>
              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                ${savings.toFixed(0)} saved/month
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: '0.75rem' }}>
                ({savingsPct}% reduction)
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function DemoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, 0.1);
  const [active, setActive] = useState(0);
  const [showClassify, setShowClassify] = useState(false);
  const [classifyDone, setClassifyDone] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let timeout: ReturnType<typeof setTimeout>;
    let idx = 0;
    const cycle = () => {
      setActive(idx % PROMPTS.length);
      setShowClassify(false);
      setClassifyDone(false);
      timeout = setTimeout(() => {
        setShowClassify(true);
        timeout = setTimeout(() => {
          setClassifyDone(true);
          idx++;
          timeout = setTimeout(cycle, 3200);
        }, 900);
      }, 400);
    };
    timeout = setTimeout(cycle, 500);
    return () => clearTimeout(timeout);
  }, [visible]);

  const handleClick = (i: number) => {
    setActive(i);
    setShowClassify(false);
    setClassifyDone(false);
    setTimeout(() => { setShowClassify(true); }, 200);
    setTimeout(() => { setClassifyDone(true); }, 900);
  };

  const p = PROMPTS[active];
  const totalReal = PROMPTS.reduce((s, x) => s + parseFloat(x.thisCost.replace('$', '')), 0);
  const totalOpus = PROMPTS.reduce((s, x) => s + parseFloat(x.opusCost.replace('$', '')), 0);
  const totalSaved = totalOpus - totalReal;
  const totalPct = Math.round((totalSaved / totalOpus) * 100);

  return (
    <section id="demo" className="section section-alt">
      <div ref={ref} className="container">
        <Reveal>
          <h2 className="section-h2">The routing decision, made visible.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Three real prompts. Click each one to see what mooter classifies, how confident
            it is, and why it picked that model. This is the decision that happens in 9–28ms
            before every single prompt you send.
          </p>
        </Reveal>

        <Reveal>
          <div className="prompt-list">
            {PROMPTS.map((pr, i) => (
              <PromptCard key={i} p={pr} index={i} active={active === i} onClick={() => handleClick(i)} />
            ))}
          </div>
        </Reveal>

        <Reveal>
          <div className="demo-explainer" style={{ '--de-color': p.tierColor, '--de-bg': p.tierBg } as React.CSSProperties}>
            <div className="de-left">
              <div className="de-section-label">classify.js output · {p.classifyOutput.latencyMs}ms</div>
              <div className={`de-classify ${showClassify ? 'de-classify-visible' : ''}`}>
                <div className="de-classify-header">
                  <span className="de-cli-prompt">$</span>
                  <span className="de-cli-cmd"> node classify.js <span className="de-cli-arg">&ldquo;{p.prompt.substring(0, 40)}{p.prompt.length > 40 ? '...' : ''}&rdquo;</span></span>
                </div>
                <div className={`de-classify-result ${classifyDone ? 'de-classify-result-visible' : ''}`}>
                  <div className="de-json-line">
                    <span className="de-json-key">tier</span>
                    <span className="de-json-sep">: </span>
                    <ClassifyBadge tier={`"${p.classifyOutput.tier}"`} color={p.tierColor} />
                  </div>
                  <div className="de-json-line">
                    <span className="de-json-key">confidence</span>
                    <span className="de-json-sep">: </span>
                    <ConfidenceBar value={p.classifyOutput.confidence} color={p.tierColor} />
                  </div>
                  <div className="de-json-line de-json-reasoning">
                    <span className="de-json-key">reasoning</span>
                    <span className="de-json-sep">: </span>
                    <span className="de-json-str">&ldquo;{p.classifyOutput.reasoning}&rdquo;</span>
                  </div>
                  <div className="de-json-line">
                    <span className="de-json-key">matched</span>
                    <span className="de-json-sep">: </span>
                    <span className="de-patterns">
                      {p.classifyOutput.matchedPatterns.map((pat, j) => (
                        <span key={j} className="de-pattern-chip">{pat}</span>
                      ))}
                    </span>
                  </div>
                  <div className="de-json-line">
                    <span className="de-json-key">latency_ms</span>
                    <span className="de-json-sep">: </span>
                    <span className="de-json-num">{p.classifyOutput.latencyMs}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="de-right">
              <div className="de-section-label">Routing decision</div>
              <div className={`de-result ${classifyDone ? 'de-result-visible' : ''}`}>
                <div className="de-result-model">
                  <div className="de-result-icon">{p.logo}</div>
                  <div>
                    <div className="de-result-name">{p.model}</div>
                    <div className="de-result-tier" style={{ color: p.tierColor }}>{p.classifyOutput.tier} · {p.classifyOutput.tierLabel}</div>
                  </div>
                </div>
                <div className="de-cost-row">
                  <div className="de-cost-item">
                    <span className="de-cost-label">This cost</span>
                    <span className="de-cost-val" style={{ color: p.tierColor }}>{p.thisCost}</span>
                  </div>
                  <div className="de-cost-item">
                    <span className="de-cost-label">Opus would cost</span>
                    <span className="de-cost-val de-cost-muted">{p.opusCost}</span>
                  </div>
                  <div className="de-cost-item">
                    <span className="de-cost-label">Saved</span>
                    <span className="de-cost-val" style={{ color: 'var(--green)' }}>
                      {p.savingPct}%
                    </span>
                  </div>
                </div>
                <div className="de-why">
                  <div className="de-why-text">{p.whyThisModel}</div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="de-savings-summary">
            <div className="demo-math">
              <span style={{ color: 'var(--muted)', textDecoration: 'line-through' }}>
                ${totalOpus.toFixed(3)} without mooter
              </span>
              <span style={{ color: 'var(--accent)' }}>→</span>
              <span style={{ color: 'var(--green)' }}>${totalReal.toFixed(3)} with mooter</span>
            </div>
            <div className="demo-note">
              {totalPct}% saved on just these 3 prompts.
              Multiply by 200 prompts/day × 30 days.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * BEFORE / AFTER — KEEP AS-IS
 * ----------------------------------------------------------------- */

function BeforeAfterSection() {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Same prompts. Different bill.</h2>
        </Reveal>

        <div className="ba-wrapper">
          <Reveal>
            <div className="ba-panel ba-panel-before">
              <div className="ba-title-bar ba-title-bar-before">
                <span className="ba-dot ba-dot-red" />
                <span className="ba-dot ba-dot-yellow" />
                <span className="ba-dot ba-dot-green" />
                <span style={{ marginLeft: 8 }}>Without Mooter</span>
              </div>
              <div className="ba-body">
                <div>$ git commit -m &quot;fix login button color&quot;</div>
                <div className="ba-dim">  claude-3-opus-20240229</div>
                <div className="ba-cost-bad">  → $0.048 · 6.2s</div>
                <hr className="ba-divider" />
                <div>$ explain this TypeError in console</div>
                <div className="ba-dim">  claude-3-opus-20240229</div>
                <div className="ba-cost-bad">  → $0.051 · 7.1s</div>
                <hr className="ba-divider" />
                <div>$ rename var userInfo to currentUser</div>
                <div className="ba-dim">  claude-3-opus-20240229</div>
                <div className="ba-cost-bad">  → $0.039 · 5.4s</div>
                <hr className="ba-divider" />
                <div>$ refactor auth module for multi-tenant</div>
                <div className="ba-dim">  claude-3-opus-20240229</div>
                <div className="ba-cost-bad">  → $0.052 · 8.1s</div>
                <hr className="ba-divider" />
                <div className="ba-cost-bad" style={{ fontWeight: 700 }}>Session total: $0.190</div>
              </div>
              <div className="ba-statusline ba-statusline-before">
                claude-3-opus · API · billing active
              </div>
            </div>
          </Reveal>

          <Reveal>
            <div className="ba-panel ba-panel-after">
              <div className="ba-title-bar ba-title-bar-after">
                <span className="ba-dot ba-dot-orange" />
                <span className="ba-dot ba-dot-green" />
                <span className="ba-dot ba-dot-green" />
                <span style={{ marginLeft: 8 }}>With Mooter</span>
              </div>
              <div className="ba-body">
                <div>$ git commit -m &quot;fix login button color&quot;</div>
                <div className="ba-tier0">  T0 → qwen2.5:3b (local)</div>
                <div className="ba-cost-good">  → $0.000 · 0.4s · saved $0.048</div>
                <hr className="ba-divider" />
                <div>$ explain this TypeError in console</div>
                <div className="ba-tier1">  T1 → Claude Haiku</div>
                <div className="ba-cost-good">  → $0.001 · 1.1s · saved $0.050</div>
                <hr className="ba-divider" />
                <div>$ rename var userInfo to currentUser</div>
                <div className="ba-tier0">  T0 → qwen2.5:3b (local)</div>
                <div className="ba-cost-good">  → $0.000 · 0.3s · saved $0.039</div>
                <hr className="ba-divider" />
                <div>$ refactor auth module for multi-tenant</div>
                <div className="ba-tier3">  T3 → Claude Opus (guardrail: architecture)</div>
                <div className="ba-accent">  → $0.052 · 8.1s · correct model</div>
                <hr className="ba-divider" />
                <div className="ba-cost-good" style={{ fontWeight: 700 }}>Session total: $0.053 · saved $0.137 (72%)</div>
              </div>
              <div className="ba-statusline">
                T0·qwen2.5:3b · 0.3s · $0.137 saved
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', marginTop: '2rem' }}>
          <div className="ba-total ba-total-before">
            <div style={{ color: 'var(--muted)', marginBottom: 4, fontSize: '0.78rem' }}>WITHOUT MOOTER</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f47373' }}>$0.190</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>4 prompts · 4x Opus · avg 6.7s</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', fontSize: '1.5rem' }}>→</div>
          <div className="ba-total ba-total-after">
            <div style={{ color: 'var(--muted)', marginBottom: 4, fontSize: '0.78rem' }}>WITH MOOTER</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--green)' }}>$0.053</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>4 prompts · right model each · avg 2.5s</div>
            <div className="ba-savings-pill">72% saved · faster on 3 of 4</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * COMPARE TABLE — KEEP AS-IS
 * ----------------------------------------------------------------- */

function ComparisonSection() {
  type Row = {
    feature: string;
    mooter: { val: string; note?: string; win?: boolean };
    litelLm: { val: string; note?: string };
    openRouter: { val: string; note?: string };
    cursor: { val: string; note?: string };
    plain: { val: string; note?: string };
  };

  const rows: Row[] = [
    {
      feature: 'Works with Claude Code natively',
      mooter: { val: '✅ Yes', win: true, note: 'Hook-based, no proxy' },
      litelLm: { val: '⚠️ Partial', note: 'Requires custom config' },
      openRouter: { val: '❌ No', note: 'Different CLI needed' },
      cursor: { val: '❌ No', note: 'Cursor-only' },
      plain: { val: '✅ Yes', note: 'But no routing' },
    },
    {
      feature: 'Zero proxy / no interception',
      mooter: { val: '✅ Yes', win: true, note: 'No MitM, no security risk' },
      litelLm: { val: '❌ No', note: 'Requires a proxy server' },
      openRouter: { val: '❌ No', note: 'Cloud proxy' },
      cursor: { val: '❌ No', note: 'Intercepts all requests' },
      plain: { val: '✅ Yes', note: 'Direct to Anthropic' },
    },
    {
      feature: 'Local model support',
      mooter: { val: '✅ Yes', win: true, note: 'Hardware-aware, auto-configured' },
      litelLm: { val: '✅ Yes', note: 'Manual config required' },
      openRouter: { val: '❌ No', note: 'Cloud only' },
      cursor: { val: '⚠️ Partial', note: 'Limited, no VRAM-aware' },
      plain: { val: '❌ No', note: 'API only' },
    },
    {
      feature: 'Hardware-aware routing',
      mooter: { val: '✅ Yes', win: true, note: 'GPU probe at install' },
      litelLm: { val: '❌ No', note: 'Manual setup' },
      openRouter: { val: '❌ No' },
      cursor: { val: '❌ No' },
      plain: { val: '❌ No' },
    },
    {
      feature: 'Subscription-aware routing',
      mooter: { val: '✅ Yes', win: true, note: 'Claude Max, API, free tiers' },
      litelLm: { val: '❌ No' },
      openRouter: { val: '❌ No' },
      cursor: { val: '❌ No' },
      plain: { val: '❌ No' },
    },
    {
      feature: 'Classification latency',
      mooter: { val: '⚡ &lt;50ms', win: true, note: 'Pure regex, no API call' },
      litelLm: { val: '~200ms', note: 'LLM-based routing' },
      openRouter: { val: '50–200ms', note: 'Cloud round-trip' },
      cursor: { val: 'N/A', note: 'No routing layer' },
      plain: { val: 'N/A' },
    },
    {
      feature: 'Community-improved patterns',
      mooter: { val: '✅ Yes', win: true, note: 'Weekly from anon deltas' },
      litelLm: { val: '❌ No' },
      openRouter: { val: '❌ No' },
      cursor: { val: '❌ No' },
      plain: { val: '❌ No' },
    },
    {
      feature: 'Free to use',
      mooter: { val: '✅ Free', win: true, note: 'MIT open source' },
      litelLm: { val: '✅ Free', note: 'OSS, self-host' },
      openRouter: { val: '⚠️ Markup', note: 'Adds 5–10% to API cost' },
      cursor: { val: '$20/mo', note: 'Subscription required' },
      plain: { val: '✅ Free', note: 'API costs still apply' },
    },
  ];

  return (
    <section id="compare" className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Not a proxy. Not a wrapper. A new paradigm.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Every other routing solution sits between you and your models. Mooter is a hook, not a proxy.
            It runs in your process, on your machine, with no network dependency.
          </p>
        </Reveal>

        <Reveal>
          <div className="comp-scroll">
            <table className="comp-table">
              <thead>
                <tr>
                  <th className="comp-th-feat">Feature</th>
                  <th className="comp-th comp-th-frugal">
                    <span className="comp-th-name">Mooter</span>
                    <span className="comp-th-sub">mooter.ai</span>
                  </th>
                  <th className="comp-th">
                    <span className="comp-th-name">LiteLLM</span>
                    <span className="comp-th-sub">proxy-based</span>
                  </th>
                  <th className="comp-th">
                    <span className="comp-th-name">OpenRouter</span>
                    <span className="comp-th-sub">cloud proxy</span>
                  </th>
                  <th className="comp-th">
                    <span className="comp-th-name">Cursor</span>
                    <span className="comp-th-sub">Cursor-only</span>
                  </th>
                  <th className="comp-th">
                    <span className="comp-th-name">Plain CC</span>
                    <span className="comp-th-sub">no router</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.feature} className={`comp-tr ${i % 2 === 0 ? 'comp-tr-active' : ''}`}>
                    <td className="comp-td-feat">{row.feature}</td>
                    <td className="comp-td comp-td-frugal">
                      <span className={`comp-val ${row.mooter.win ? 'comp-win' : ''}`}
                        dangerouslySetInnerHTML={{ __html: row.mooter.val }} />
                      {row.mooter.note && <span className="comp-note">{row.mooter.note}</span>}
                    </td>
                    <td className="comp-td">
                      <span className="comp-val comp-no">{row.litelLm.val}</span>
                      {row.litelLm.note && <span className="comp-note">{row.litelLm.note}</span>}
                    </td>
                    <td className="comp-td">
                      <span className="comp-val comp-no">{row.openRouter.val}</span>
                      {row.openRouter.note && <span className="comp-note">{row.openRouter.note}</span>}
                    </td>
                    <td className="comp-td">
                      <span className="comp-val comp-no">{row.cursor.val}</span>
                      {row.cursor.note && <span className="comp-note">{row.cursor.note}</span>}
                    </td>
                    <td className="comp-td">
                      <span className="comp-val comp-no">{row.plain.val}</span>
                      {row.plain.note && <span className="comp-note">{row.plain.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * PERSONALIZATION + ALGORITHM — Configured for you, gets smarter
 * ----------------------------------------------------------------- */

function PersonalizationSection() {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Built for your setup. Gets smarter every day.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            At install, mooter scans your hardware, software, and subscription. The result is a routing
            profile unique to you — that improves automatically as the community grows.
          </p>
        </Reveal>

        <div className="pillars stagger" style={{ marginTop: '2rem' }}>
          <Reveal className="pillar" style={{ '--i': 0 } as React.CSSProperties}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem', opacity: 0.9 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
              </svg>
            </div>
            <h3>Hardware + Software scan</h3>
            <p>GPU, VRAM, RAM, installed models, APIs. RTX 4090 gets qwen3:30b. MacBook Air gets qwen2.5:3b. Both save — at different scales.</p>
          </Reveal>

          <Reveal className="pillar" style={{ '--i': 1 } as React.CSSProperties}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem', opacity: 0.9 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <h3>Subscription + Budget</h3>
            <p>Max, Pro, or API? Each has different economics. Set a daily ceiling. Mooter adjusts in real time — more local near limits, full power when tokens expire.</p>
          </Reveal>

          <Reveal className="pillar" style={{ '--i': 2 } as React.CSSProperties}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem', opacity: 0.9 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </div>
            <h3>Community-fed algorithm</h3>
            <p>Anonymous routing deltas from every user improve the classifier. Daily backtests. Weekly pattern updates. The algorithm you install today is better than yesterday&apos;s.</p>
          </Reveal>

          <Reveal className="pillar" style={{ '--i': 3 } as React.CSSProperties}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem', opacity: 0.9 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <h3>Validated savings</h3>
            <p>Every number is calculated against a transparent methodology: Opus cost vs routed cost, adjusted for quality and time. No guesses.</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * INSTALL — Terminal + VS Code. One install.
 * ----------------------------------------------------------------- */

function InstallSection() {
  return (
    <section id="install" className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Terminal + VS Code. One install.</h2>
        </Reveal>

        <div className="install-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2rem',
          marginTop: '2rem',
          alignItems: 'start',
        }}>
          <Reveal>
            <InstallBlock />
          </Reveal>

          <Reveal>
            <div style={{
              background: 'var(--surface, rgba(255,255,255,0.03))',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              textAlign: 'center',
            }}>
              <VSCodeIcon size={48} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                VS Code Extension
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0, maxWidth: 320 }}>
                Real-time statusline showing model, tier, cost, and savings for every prompt.
                See routing decisions without leaving your editor.
              </p>
              <span style={{
                display: 'inline-block',
                padding: '0.3rem 0.8rem',
                borderRadius: 6,
                background: 'rgba(0,122,204,0.1)',
                border: '1px solid rgba(0,122,204,0.25)',
                color: '#007ACC',
                fontSize: '0.78rem',
                fontWeight: 600,
              }}>
                Coming soon
              </span>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <p style={{
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '0.8rem',
            marginTop: '1.5rem',
          }}>
            Works on Windows &amp; macOS · Node.js ≥18 · Claude Code required
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* -----------------------------------------------------------------
 * FOOTER — Expanded three-column
 * ----------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-row">
        <div className="footer-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MooterLogo size={22} />
          <span className="nav-brand-name" style={{ color: 'var(--accent)' }}>mooter</span>
          <span style={{ color: 'var(--faint)', fontSize: '0.75rem', marginLeft: 4 }}>
            — route smarter. ship faster.
          </span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal#readme" target="_blank" rel="noopener noreferrer">Docs</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
          <a href="mailto:paulo.loureiro.shp@gmail.com">Contact</a>
        </div>
        <div className="footer-hint">
          Built with care in Portugal · MIT License · 2026
        </div>
      </div>
    </footer>
  );
}

/* -----------------------------------------------------------------
 * Main export
 * ----------------------------------------------------------------- */

export default function Page() {
  return (
    <ErrorBoundary>
      <main>
        <Nav />
        <Hero />
        <ProblemSection />
        <HowItWorks />
        <ModelsSection />
        <SavingsCalculator />
        <DemoSection />
        <BeforeAfterSection />
        <ComparisonSection />
        <PersonalizationSection />
        <InstallSection />
        <Footer />
      </main>
    </ErrorBoundary>
  );
}
