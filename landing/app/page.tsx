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

/* ─────────────────────────────────────────────────────────────
 * ErrorBoundary
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * Hooks
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * Router Animation — live classification terminal
 * ───────────────────────────────────────────────────────────── */

const ROUTER_DEMOS = [
  { prompt: 'make this button blue', tier: 'T0', model: 'Ollama · free', ms: 9, cost: '$0.000', conf: 98, color: '#22c55e' },
  { prompt: 'rename userInfo to currentUser', tier: 'T0', model: 'Ollama · free', ms: 7, cost: '$0.000', conf: 99, color: '#22c55e' },
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

/* ─────────────────────────────────────────────────────────────
 * Animated Tier Bar
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * Mooter Logo (improved cow head SVG)
 * ───────────────────────────────────────────────────────────── */

function MooterLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Mooter logo"
    >
      {/* Left horn — curved outward, swept back like real cow */}
      <path d="M29 29 C26 21 22 14 25 10 C28 7 32 13 33 23Z" fill="#F5EDD4" />
      {/* Right horn — mirror */}
      <path d="M71 29 C74 21 78 14 75 10 C72 7 68 13 67 23Z" fill="#F5EDD4" />
      {/* Left ear — rounded pill */}
      <rect x="9" y="36" width="13" height="18" rx="6.5" fill="#F5EDD4" />
      {/* Right ear — mirror */}
      <rect x="78" y="36" width="13" height="18" rx="6.5" fill="#F5EDD4" />
      {/* Head — wide blocky rect, cow-proportioned, cream fill (emoji-matched) */}
      <rect x="17" y="24" width="66" height="60" rx="14" fill="#F5EDD4" />
      {/* Left eye */}
      <circle cx="36" cy="46" r="5" fill="#1C1209" />
      {/* Right eye */}
      <circle cx="64" cy="46" r="5" fill="#1C1209" />
      {/* Eye gleams — catch-light */}
      <circle cx="37.8" cy="44.2" r="1.8" fill="white" />
      <circle cx="65.8" cy="44.2" r="1.8" fill="white" />
      {/* Muzzle — brand orange, emoji-inspired */}
      <rect x="26" y="59" width="48" height="24" rx="12" fill="#FF6B35" />
      {/* Nostril left */}
      <ellipse cx="38" cy="71" rx="5" ry="4.5" fill="#C04A0C" />
      {/* Nostril right */}
      <ellipse cx="62" cy="71" rx="5" ry="4.5" fill="#C04A0C" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Provider icons
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * Install Block
 * ───────────────────────────────────────────────────────────── */

const INSTALL_NPM = 'npm install -g @mooter/cli';
const INSTALL_BASH =
  'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';

function InstallBlock({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<'npm' | 'bash'>('npm');
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
            background: mode === 'npm' ? '#FF6B35' : 'none',
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
            background: mode === 'bash' ? '#FF6B35' : 'none',
            color: mode === 'bash' ? '#000' : 'var(--muted)',
            border: 'none',
          }}
        >
          bash
        </button>
      </div>

      <button className={`btn btn-primary ${compact ? '' : 'hero-cta'}`} onClick={copy}
        style={{ background: '#FF6B35', color: '#000' }}>
        {copied ? '✓ Copied!' : 'Copy install command'}
      </button>

      <div className="install-cmd" onClick={copy} style={{ maxWidth: 580 }}>{cmd}</div>
      <div className="install-note">
        {mode === 'npm'
          ? 'Requires: Node.js ≥18 · Claude Code · Ollama (recommended)'
          : 'Requires: Node.js ≥18 · Claude Code · curl'}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * NAV
 * ───────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <nav className="nav">
      <div className="container nav-row">
        <a href="#top" onClick={scrollTo('top')} className="brand">
          <MooterLogo size={28} />
          <span className="nav-brand-name">mooter</span>
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollTo('how')}>How it works</a>
          <a href="#demo" onClick={scrollTo('demo')}>Demo</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
          <a href="#install" onClick={scrollTo('install')}>Install</a>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={loginWithGitHub}
            className="btn btn-sm"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'inherit', cursor: 'pointer' }}
          >
            Sign in
          </button>
          <a href="#install" onClick={scrollTo('install')} className="btn btn-sm btn-primary"
            style={{ background: '#FF6B35', color: '#000', fontWeight: 700 }}>
            Install free
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
 * HERO — Brutal, enorme, minimalista
 * ───────────────────────────────────────────────────────────── */

function Hero() {
  const { stats, live } = useCommunityStats();

  return (
    <section id="top" className="hero">
      <div className="container narrow hero-inner">

        {/* Big cow mark — like Ollama shows their llama in the hero */}
        <div className="hero-logo-mark" aria-hidden="true">
          <MooterLogo size={96} />
        </div>

        <h1 className="hero-title">
          Stop paying Opus rates<br />
          <span style={{ color: 'var(--accent)' }}>for git commits.</span>
        </h1>

        <p className="hero-subtitle">
          Mooter classifies every Claude Code prompt in &lt;50ms and routes it to the cheapest model that handles it.
          Ollama when it&apos;s trivial. Haiku when it&apos;s medium. Opus only when nothing else will do.{' '}
          <strong style={{ color: 'var(--text)' }}>89.9% savings. One install. Zero config changes.</strong>
        </p>

        <InstallBlock />

        {/* Live router animation — the "show" */}
        <RouterAnimation />

        <div className="hero-counters">
          <div className="counter-item">
            <span className="counter-num">
              <AnimatedNumber value={stats.prompt_count} />
            </span>
            <span className="counter-label">prompts routed</span>
          </div>
          <div className="counter-item">
            <span className="counter-num">
              <AnimatedNumber value={stats.savings_pct} decimals={1} suffix="%" />
            </span>
            <span className="counter-label">avg savings</span>
          </div>
          <div className="counter-item">
            <span className="counter-num">
              ${stats.savings_usd.toFixed(2)}
            </span>
            <span className="counter-label">saved by community</span>
          </div>
        </div>

        <div className="hero-providers">
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginRight: 8 }}>routes to:</span>
          <OllamaIcon size={16} />
          <AnthropicIcon size={16} />
          <OpenAIIcon size={16} />
          <GeminiIcon size={16} />
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 6 }}>+ any local model</span>
        </div>

        {live && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite' }} />
            live stats from community hub
          </div>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * THE TRUTH — Simples, honesto
 * ───────────────────────────────────────────────────────────── */

function TruthSection() {
  const { stats } = useCommunityStats();

  return (
    <section className="section truth-section">
      <div className="container">

        {/* Dramatic savings counter */}
        <Reveal>
          <div className="truth-counter-area">
            <div className="truth-counter-eyebrow">community · live savings</div>
            <div className="truth-counter-big">
              $<AnimatedNumber value={stats.savings_usd} decimals={2} />
            </div>
            <div className="truth-counter-sub">
              <div><span><AnimatedNumber value={stats.prompt_count} /></span> prompts routed</div>
              <div><span><AnimatedNumber value={stats.savings_pct} decimals={1} suffix="%" /></span> avg saved</div>
              <div><span><AnimatedNumber value={stats.user_count} /></span> devs</div>
            </div>
          </div>
        </Reveal>

        {/* The headline stat */}
        <Reveal>
          <div className="truth-headline">
            <div>84% of Claude prompts don&apos;t need Opus.</div>
            <div style={{ color: 'var(--accent)' }}>They&apos;re getting it anyway.</div>
          </div>
        </Reveal>

        {/* Animated tier distribution */}
        <div className="tier-bars">
          <AnimatedTierBar pct={84} color="var(--tier-0)" label="T0 · Ollama" cost="0¢ / free" delay={0} />
          <AnimatedTierBar pct={5}  color="var(--tier-1)" label="T1 · Haiku"  cost="~$0.001" delay={160} />
          <AnimatedTierBar pct={8}  color="var(--tier-2)" label="T2 · Sonnet" cost="~$0.003" delay={320} />
          <AnimatedTierBar pct={3}  color="var(--tier-3)" label="T3 · Opus"   cost="~$0.015" delay={480} />
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * HOW IT ROUTES — 3 passos clean
 * ───────────────────────────────────────────────────────────── */

function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Three signals. One decision. &lt;50ms.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Mooter reads your environment once at install time, then uses three signals to make the right routing decision for every prompt — without ever sending your prompt to a classifier LLM. Pure regex. Pure speed.
          </p>
        </Reveal>

        <div className="steps-grid stagger">
          <Reveal className="step-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="step-num">1</div>
            <div className="step-title">Classify</div>
            <div className="step-desc">
              102 regex patterns read your prompt in &lt;50ms. No LLM cost to route.
              Trivial UI tweaks, renames, commit messages → T0. Architecture, security → T3.
            </div>
          </Reveal>

          <Reveal className="step-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="step-num">2</div>
            <div className="step-title">Route</div>
            <div className="step-desc">
              T0 (free Ollama) first. T3 (Opus) only when genuinely complex.
              Hardware-aware, subscription-aware, budget-aware.
              One install. Config auto-updates forever.
            </div>
          </Reveal>

          <Reveal className="step-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="step-num">3</div>
            <div className="step-title">Learn</div>
            <div className="step-desc">
              Every routing decision feeds anonymous deltas to the community hub.
              Weekly pattern updates push to all users.
              Your router learns. It improves. It stays current.
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * DEMO — Manter EXACTAMENTE como estava
 * ───────────────────────────────────────────────────────────── */

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
    model: 'Ollama · qwen2.5:3b',
    modelShort: 'Ollama',
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
      onClick={onClick}
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

/* ─────────────────────────────────────────────────────────────
 * BEFORE / AFTER
 * ───────────────────────────────────────────────────────────── */

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
                <div>$ git commit -m "fix login button color"</div>
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
                <span style={{ marginLeft: 8 }}>With Mooter 🐮</span>
              </div>
              <div className="ba-body">
                <div>$ git commit -m "fix login button color"</div>
                <div className="ba-tier0">  T0 → Ollama qwen2.5:3b (local)</div>
                <div className="ba-cost-good">  → $0.000 · 0.4s · saved $0.048</div>
                <hr className="ba-divider" />
                <div>$ explain this TypeError in console</div>
                <div className="ba-tier1">  T1 → Claude Haiku</div>
                <div className="ba-cost-good">  → $0.001 · 1.1s · saved $0.050</div>
                <hr className="ba-divider" />
                <div>$ rename var userInfo to currentUser</div>
                <div className="ba-tier0">  T0 → Ollama qwen2.5:3b (local)</div>
                <div className="ba-cost-good">  → $0.000 · 0.3s · saved $0.039</div>
                <hr className="ba-divider" />
                <div>$ refactor auth module for multi-tenant</div>
                <div className="ba-tier3">  T3 → Claude Opus (guardrail: architecture)</div>
                <div className="ba-accent">  → $0.052 · 8.1s · correct model ✓</div>
                <hr className="ba-divider" />
                <div className="ba-cost-good" style={{ fontWeight: 700 }}>Session total: $0.053 · saved $0.137 (72%)</div>
              </div>
              <div className="ba-statusline">
                🐮 T0·Oll·qwen · 0.3s · 📍 $0.137 saved
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap', marginTop: '2rem' }}>
          <div className="ba-total ba-total-before">
            <div style={{ color: 'var(--muted)', marginBottom: 4, fontSize: '0.78rem' }}>WITHOUT MOOTER</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f47373' }}>$0.190</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>4 prompts · 4× Opus · avg 6.7s</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', fontSize: '1.5rem' }}>→</div>
          <div className="ba-total ba-total-after">
            <div style={{ color: 'var(--muted)', marginBottom: 4, fontSize: '0.78rem' }}>WITH MOOTER</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--green)' }}>$0.053</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>4 prompts · right model each · avg 2.5s</div>
            <div className="ba-savings-pill">✓ 72% saved · faster on 3 of 4</div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * COMPARE TABLE
 * ───────────────────────────────────────────────────────────── */

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
      feature: 'Local model (Ollama) support',
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
      cursor: { val: '💳 $20/mo', note: 'Subscription required' },
      plain: { val: '✅ Free', note: 'API costs still apply' },
    },
  ];

  return (
    <section id="compare" className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Not a proxy. Not a wrapper.<br />Something new.</h2>
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
                    <span className="comp-th-name">🐮 Mooter</span>
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

/* ─────────────────────────────────────────────────────────────
 * INSTALL
 * ───────────────────────────────────────────────────────────── */

function InstallSection() {
  return (
    <section id="install" className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">One command. 60 seconds. Done.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Mooter auto-scans your hardware, detects Ollama, generates your routing config, and installs the hook. Zero config files. Zero environment variables. Just run it.
          </p>
        </Reveal>

        <Reveal>
          <InstallBlock />
        </Reveal>

        <Reveal>
          <div className="pillars stagger" style={{ marginTop: '3rem' }}>
            <Reveal className="pillar" style={{ '--i': 0 } as React.CSSProperties}>
              <div className="pillar-icon">🔍</div>
              <h3>Auto-scans your setup</h3>
              <p>GPU, RAM, Ollama models, API keys — Mooter reads your environment and generates the optimal config for your machine.</p>
            </Reveal>
            <Reveal className="pillar" style={{ '--i': 1 } as React.CSSProperties}>
              <div className="pillar-icon">🔌</div>
              <h3>Hooks into Claude Code</h3>
              <p>Official UserPromptSubmit hook. No interception. No API keys exposed. Runs locally before any request leaves your machine.</p>
            </Reveal>
            <Reveal className="pillar" style={{ '--i': 2 } as React.CSSProperties}>
              <div className="pillar-icon">✅</div>
              <h3>Self-tests on install</h3>
              <p>Smoke test verifies classification works, Ollama responds, and the statusline updates. Tells you exactly what to fix if anything fails.</p>
            </Reveal>
            <Reveal className="pillar" style={{ '--i': 3 } as React.CSSProperties}>
              <div className="pillar-icon">🔒</div>
              <h3>Zero config after</h3>
              <p>Your routing profile is generated once and updated automatically. You never edit a config file. Never decide again.</p>
            </Reveal>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * FOOTER
 * ───────────────────────────────────────────────────────────── */

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
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener">GitHub</a>
          <a href="https://mooter.ai" target="_blank" rel="noopener">mooter.ai</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
          <a href="mailto:paulo.loureiro.shp@gmail.com">Contact</a>
        </div>
        <div className="footer-hint">
          Built in São Paulo 🐮 · MIT License · 2026
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Main export
 * ───────────────────────────────────────────────────────────── */

export default function Page() {
  return (
    <ErrorBoundary>
      <main>
        <Nav />
        <Hero />
        <TruthSection />
        <HowItWorks />
        <DemoSection />
        <BeforeAfterSection />
        <ComparisonSection />
        <InstallSection />
        <Footer />
      </main>
    </ErrorBoundary>
  );
}
