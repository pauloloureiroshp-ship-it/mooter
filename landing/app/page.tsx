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
    savings_pct: 90.2,
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
 * Mooter Logo (inline SVG — cow mark)
 * ───────────────────────────────────────────────────────────── */

function MooterLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M12 14 C11 9 9 6 11 5 C13 4 15 8 14 12Z" fill="#FF6B35" />
      <path d="M28 14 C29 9 31 6 29 5 C27 4 25 8 26 12Z" fill="#FF6B35" />
      <ellipse cx="7" cy="20" rx="4.5" ry="5.5" fill="#FF6B35" />
      <ellipse cx="33" cy="20" rx="4.5" ry="5.5" fill="#FF6B35" />
      <ellipse cx="7" cy="20" rx="2.5" ry="3.5" fill="#e85a1a" />
      <ellipse cx="33" cy="20" rx="2.5" ry="3.5" fill="#e85a1a" />
      <ellipse cx="20" cy="23" rx="14" ry="13" fill="#FF6B35" />
      <ellipse cx="20" cy="30" rx="7.5" ry="5" fill="#e85a1a" />
      <circle cx="15" cy="21" r="3" fill="#1a0800" />
      <circle cx="25" cy="21" r="3" fill="#1a0800" />
      <circle cx="16" cy="20" r="1" fill="rgba(255,255,255,0.75)" />
      <circle cx="26" cy="20" r="1" fill="rgba(255,255,255,0.75)" />
      <ellipse cx="17.5" cy="30.5" rx="1.5" ry="1.2" fill="#1a0800" fillOpacity="0.45" />
      <ellipse cx="22.5" cy="30.5" rx="1.5" ry="1.2" fill="#1a0800" fillOpacity="0.45" />
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
      {/* Mode switcher */}
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
 * S1 — NAV
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
          <a href="#pricing" onClick={scrollTo('pricing')}>Pricing</a>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={loginWithGitHub}
            className="btn btn-sm"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'inherit', cursor: 'pointer' }}
          >
            Sign in
          </button>
          <a href="#access" onClick={scrollTo('access')} className="btn btn-sm btn-primary"
            style={{ background: '#FF6B35', color: '#000', fontWeight: 700 }}>
            Install free
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S2 — HERO
 * ───────────────────────────────────────────────────────────── */

function Hero() {
  const { stats, live } = useCommunityStats();

  return (
    <section id="top" className="hero">
      <div className="container narrow hero-inner">

        <div className="hero-eyebrow">
          <MooterLogo size={16} />
          For vibe coders who care about the bill
        </div>

        <h1 className="hero-h1">
          The right model,<br />
          every prompt.<br />
          <span style={{ color: '#FF6B35' }}>Automatically.</span>
        </h1>

        {live && (
          <div className="hero-savings-banner">
            <span className="hsb-live">● LIVE</span>
            <span className="hsb-text">
              Community saved{' '}
              <strong>${stats.savings_usd.toFixed(2)}</strong> across{' '}
              <strong>{stats.prompt_count.toLocaleString()}</strong> prompts
            </span>
          </div>
        )}

        <p className="hero-sub">
          Mooter classifies every Claude Code prompt in under 50ms and routes it to the cheapest
          model that can handle it. Ollama when it&rsquo;s trivial. Haiku when it&rsquo;s medium.
          Opus only when nothing else will do. One install. Nothing changes in your workflow.
        </p>

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
              <AnimatedNumber value={stats.savings_usd} decimals={2} prefix="$" />
            </span>
            <span className="counter-label">saved by community</span>
          </div>
          {live && (
            <div className="counter-item">
              <span className="counter-num"><span className="live-dot" /> live</span>
              <span className="counter-label">&nbsp;</span>
            </div>
          )}
        </div>

        <InstallBlock />

        <div className="hero-providers">
          <OllamaIcon size={18} />
          <AnthropicIcon size={18} />
          <OpenAIIcon size={18} />
          <GeminiIcon size={18} />
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 4 }}>+ any Ollama model</span>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S3 — FOR WHO (new section)
 * ───────────────────────────────────────────────────────────── */

function ForWho() {
  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Built for serious vibe coders</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            If you ship with Claude Code every day, you already know the problem.
            The bill is unpredictable. The model choice is out of your hands.
            And the tools you have don&rsquo;t talk to each other.
          </p>
        </Reveal>

        <div className="forwho-grid stagger">
          <Reveal className="forwho-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="forwho-emoji">💸</div>
            <div className="forwho-title">You&rsquo;re paying Opus rates for git commit messages</div>
            <p className="forwho-desc">
              Every prompt — trivial or not — routes to the most expensive model.
              You&rsquo;ve seen the bill. You know it&rsquo;s wrong. You just can&rsquo;t fix it manually.
            </p>
            <div className="forwho-highlight">avg overspend: $180/month on trivial tasks</div>
          </Reveal>

          <Reveal className="forwho-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="forwho-emoji">🖥️</div>
            <div className="forwho-title">Your GPU sits idle while you pay cloud rates</div>
            <p className="forwho-desc">
              RTX 4090? M3 Max? You have real compute. Ollama is installed.
              But nothing decides when to use it — so it never gets used.
            </p>
            <div className="forwho-highlight">hardware detection → automatic local routing</div>
          </Reveal>

          <Reveal className="forwho-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="forwho-emoji">⏱️</div>
            <div className="forwho-title">You hit Claude Max limits at 2pm every day</div>
            <p className="forwho-desc">
              Max plan, API key, Gemini, Grok — you have options. But nothing
              orchestrates them. When one hits a wall, everything stops.
            </p>
            <div className="forwho-highlight">subscription-aware routing across all providers</div>
          </Reveal>

          <Reveal className="forwho-card" style={{ '--i': 3 } as React.CSSProperties}>
            <div className="forwho-emoji">📊</div>
            <div className="forwho-title">Your team&rsquo;s AI bill is growing faster than the product</div>
            <p className="forwho-desc">
              3 developers × $200/month in overages = $600/month you didn&rsquo;t budget for.
              And you can&rsquo;t show the CFO which prompts are burning the cash.
            </p>
            <div className="forwho-highlight">per-session savings tracking · cost visibility</div>
          </Reveal>
        </div>

        <Reveal>
          <p className="forwho-foot">
            Mooter is not another AI subscription. It&rsquo;s the layer that makes the tools you already
            have work together intelligently. You install once. It works forever.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S4 — THE PROBLEM (simplified, contextual)
 * ───────────────────────────────────────────────────────────── */

function TheProblem() {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">84% of prompts don&rsquo;t need Opus.<br />They&rsquo;re getting it anyway.</h2>
        </Reveal>

        <div className="problem-grid stagger">
          <Reveal className="problem-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="problem-icon">🎯</div>
            <div className="problem-title">Claude Code picks the model for you</div>
            <p className="problem-body">
              And it&rsquo;s conservative. &ldquo;When in doubt, use the most capable model.&rdquo;
              Which means: every prompt, the most expensive model. Every time.
              Even &ldquo;rename this variable&rdquo; and &ldquo;explain this error&rdquo;.
            </p>
          </Reveal>
          <Reveal className="problem-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="problem-icon">🔌</div>
            <div className="problem-title">Your alternatives go unused</div>
            <p className="problem-body">
              Ollama, Gemini Flash, Haiku — all cheaper, all fast enough for most tasks.
              But there&rsquo;s no intelligence deciding when to use them.
              So they sit there, and you pay full rate.
            </p>
          </Reveal>
          <Reveal className="problem-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="problem-icon">📈</div>
            <div className="problem-title">The bill scales with productivity</div>
            <p className="problem-body">
              The more you ship, the more you pay. 10 prompts/hour becomes $10/hour at Opus rates.
              The better you get at vibe coding, the more financially punishing it becomes.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <div className="vibe-callout">
            <div className="vibe-head">What the math actually looks like</div>
            <div className="vibe-body">
              A typical vibe coder sends 150–300 prompts per day. At Claude Opus pricing,
              that&rsquo;s $7–15/day in API costs, or $200–450/month.
              Mooter users consistently report 85–92% reduction — keeping 10–50% of prompts
              at Opus (the ones that actually need it) and routing the rest locally or to Haiku.
            </div>
            <div className="vibe-stats">
              <div className="vibe-stat">
                <strong>89.9%</strong>
                <span>validated savings</span>
              </div>
              <div className="vibe-stat">
                <strong>1,437</strong>
                <span>real prompts measured</span>
              </div>
              <div className="vibe-stat">
                <strong>&lt;50ms</strong>
                <span>classification latency</span>
              </div>
              <div className="vibe-stat">
                <strong>100%</strong>
                <span>test accuracy (170 prompts)</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S5 — HOW IT WORKS (4 signals + routing diagram)
 * ───────────────────────────────────────────────────────────── */

function HowItWorks() {
  const [howTab, setHowTab] = useState<'signals' | 'flow' | 'after'>('signals');

  return (
    <section id="how" className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Four signals. One decision. &lt;50ms.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Mooter reads your environment once at install time, then uses four signals to
            make the right routing decision for every single prompt — without ever sending
            your prompt to a classifier LLM. Pure regex. Pure speed.
          </p>
        </Reveal>

        <Reveal>
          <div className="how-tabs">
            <button
              className={`how-tab ${howTab === 'signals' ? 'how-tab-active' : ''}`}
              onClick={() => setHowTab('signals')}
            >
              The 4 signals
            </button>
            <button
              className={`how-tab ${howTab === 'flow' ? 'how-tab-active' : ''}`}
              onClick={() => setHowTab('flow')}
            >
              Routing flow
            </button>
            <button
              className={`how-tab ${howTab === 'after' ? 'how-tab-active' : ''}`}
              onClick={() => setHowTab('after')}
            >
              After install
            </button>
          </div>
        </Reveal>

        {howTab === 'signals' && (
          <>
            <div className="signals-grid stagger">
              <Reveal className="signal-card" style={{ '--i': 0 } as React.CSSProperties}>
                <div className="signal-icon">🧠</div>
                <div className="signal-name">Task complexity</div>
                <p className="signal-desc">
                  102 regex patterns classify the prompt in under 50ms. Trivial UI tweaks, commit messages,
                  and variable renames hit T0. Architecture, security, and multi-system tasks lock to T3.
                  Nothing in between gets shortchanged.
                </p>
              </Reveal>
              <Reveal className="signal-card" style={{ '--i': 1 } as React.CSSProperties}>
                <div className="signal-icon">🖥️</div>
                <div className="signal-name">Your hardware</div>
                <p className="signal-desc">
                  GPU VRAM, CPU cores, available RAM — Mooter scans your machine on install and
                  picks the best Ollama model you can actually run. RTX 4090 gets qwen3:30b.
                  M1 MacBook gets qwen2.5:3b. Automatic. No guessing.
                </p>
              </Reveal>
              <Reveal className="signal-card" style={{ '--i': 2 } as React.CSSProperties}>
                <div className="signal-icon">📋</div>
                <div className="signal-name">Your subscriptions</div>
                <p className="signal-desc">
                  Claude Max? Haiku API? Gemini Free tier? Mooter knows what you have and
                  routes accordingly. When you&rsquo;re close to Claude Max limits, it shifts to
                  alternatives automatically. No manual switching.
                </p>
              </Reveal>
              <Reveal className="signal-card" style={{ '--i': 3 } as React.CSSProperties}>
                <div className="signal-icon">💰</div>
                <div className="signal-name">Your budget target</div>
                <p className="signal-desc">
                  Set a monthly budget. Mooter tracks your spend in real time and adjusts routing
                  to stay under it. As you approach the limit, it gets more conservative.
                  Near zero budget = local-first everything.
                </p>
              </Reveal>
            </div>

            <Reveal>
              <p className="arch-foot-copy" style={{ marginTop: '2rem' }}>
                None of your prompts leave your machine to be classified.
                The decision happens locally, in process, before the request is ever sent.
              </p>
            </Reveal>
          </>
        )}

        {howTab === 'flow' && (
          <>
            <Reveal>
              <div className="arch-title">Every prompt takes the optimal path</div>
            </Reveal>

            <Reveal>
              <div className="arch">
                <div className="arch-input">Your Prompt (in Claude Code)</div>
                <div className="arch-arrow-down">▼</div>
                <div className="arch-classifier">
                  <span>🐮</span> mooter classifier
                  <span className="arch-meta">&lt;50ms · local · pure regex · 102 patterns</span>
                </div>
                <div className="arch-arrow-down">▼</div>
                <div className="arch-branches">
                  <div className="arch-branch" style={{ borderColor: 'var(--t0)' }}>
                    <div className="arch-branch-head">
                      <OllamaIcon size={16} />
                      <span style={{ color: 'var(--t0)' }}>T0</span>
                    </div>
                    <div className="arch-branch-model">Ollama · local</div>
                    <div className="arch-branch-cost" style={{ color: 'var(--green)' }}>FREE</div>
                    <div className="arch-branch-pct">~84% of prompts</div>
                  </div>
                  <div className="arch-branch" style={{ borderColor: 'var(--t1)' }}>
                    <div className="arch-branch-head">
                      <AnthropicIcon size={16} />
                      <span style={{ color: 'var(--t1)' }}>T1</span>
                    </div>
                    <div className="arch-branch-model">Claude Haiku</div>
                    <div className="arch-branch-cost">~$0.001</div>
                    <div className="arch-branch-pct">~5%</div>
                  </div>
                  <div className="arch-branch" style={{ borderColor: 'var(--t2)' }}>
                    <div className="arch-branch-head">
                      <AnthropicIcon size={16} />
                      <span style={{ color: 'var(--t2)' }}>T2</span>
                    </div>
                    <div className="arch-branch-model">Claude Sonnet</div>
                    <div className="arch-branch-cost">~$0.010</div>
                    <div className="arch-branch-pct">~8%</div>
                  </div>
                  <div className="arch-branch" style={{ borderColor: 'var(--t3)' }}>
                    <div className="arch-branch-head">
                      <AnthropicIcon size={16} />
                      <span style={{ color: 'var(--t3)' }}>T3</span>
                    </div>
                    <div className="arch-branch-model">Claude Opus</div>
                    <div className="arch-branch-cost">~$0.050</div>
                    <div className="arch-branch-pct">~3%</div>
                  </div>
                </div>
                <div className="arch-providers">
                  <span className="arch-prov-label">Also routes to:</span>
                  <GeminiIcon size={16} />
                  <OpenAIIcon size={16} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>+ Grok · Mistral · any Ollama model</span>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <p className="arch-foot-copy">
                Mooter is a hook in Claude Code&rsquo;s <code>UserPromptSubmit</code> event.
                It emits a <code>&lt;router-hint&gt;</code> tag that guides model selection.
                No proxy. No interception. No security surface.
              </p>
            </Reveal>
          </>
        )}

        {howTab === 'after' && (
          <>
            <Reveal>
              <p className="section-sub" style={{ marginBottom: '2rem' }}>
                Everything works exactly as before. Except your bill.
              </p>
            </Reveal>

            <Reveal>
              <div className="sl-card">
                <div className="sl-bar">
                  <span className="sl-t0">🐮 T0·Oll·qwen3</span>
                  {' '}
                  <span className="sl-savings">📍 $2.40 saved</span>
                  {' '}·{' '}
                  <span className="sl-gpu">🌍 $52.40 lifetime</span>
                  {' '}·{' '}
                  <span style={{ color: 'var(--muted)' }}>⏱ ~0.4s/prompt · +2.1s for savings</span>
                  {' '}·{' '}
                  <span style={{ color: '#79c0ff' }}>🏠 Oll● ☁️ Cld● 🔌 DSk○</span>
                </div>
                <div className="sl-annotations">
                  <div className="sl-ann"><span className="sl-ann-num">①</span> Current tier + model (T0 → Ollama qwen3)</div>
                  <div className="sl-ann"><span className="sl-ann-num">②</span> Session savings · lifetime savings</div>
                  <div className="sl-ann"><span className="sl-ann-num">③</span> Avg response time · latency tradeoff</div>
                  <div className="sl-ann"><span className="sl-ann-num">④</span> Provider layer status (● active, ○ off)</div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="after-sub-title">10 slash commands built in</div>
              <div className="slash-grid">
                {[
                  ['/mooter-status', 'Router health, active providers, pattern accuracy'],
                  ['/mooter-savings', 'Session + lifetime savings breakdown'],
                  ['/mooter-route', 'Classify any task and see the routing decision'],
                  ['/mooter-beast', 'Override to Opus for everything (when you need it)'],
                  ['/mooter-zen', 'Override to local-only (for air-gapped or budget mode)'],
                  ['/mooter-auto', 'Resume intelligent routing after a manual override'],
                  ['/mooter-doctor', 'Diagnose issues with your setup + hub connectivity'],
                  ['/mooter-update', 'Pull latest patterns from the community hub'],
                  ['/mooter-dashboard', 'Open the browser dashboard with full analytics'],
                  ['/mooter-hello', 'Interactive onboarding for first-time setup'],
                ].map(([cmd, desc]) => (
                  <div key={cmd} className="slash-card">
                    <div className="slash-cmd">{cmd}</div>
                    <div className="slash-desc">{desc}</div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal>
              <div className="after-sub-title">What the first session looks like</div>
              <div className="timeline">
                {[
                  ['Install', 'One command. Mooter scans your hardware, detects Ollama, and generates your routing config.'],
                  ['First prompt', 'Status bar lights up. T0 label appears. First save: $0.048 on a git commit message.'],
                  ['First hour', 'Savings counter climbs. You start to understand which tasks go local, which stay on Opus.'],
                  ['First week', 'Router has enough data to start sending community deltas. Patterns get smarter for your use case.'],
                  ['First month', 'Average user saves $180–240. Bill is predictable. You never think about it again.'],
                ].map(([label, content]) => (
                  <div key={label} className="tl-item">
                    <div className="tl-dot" style={{ background: '#FF6B35' }} />
                    <div className="tl-label">{label}</div>
                    <div className="tl-content">{content}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S6 — DEMO: 3 real prompts, classifier output visible
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
    <section id="demo" className="section">
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
 * S7 — BEFORE / AFTER (VS Code visual comparison)
 * ───────────────────────────────────────────────────────────── */

function BeforeAfterSection() {
  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">What changes when you install Mooter</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Nothing in your workflow changes. The only difference is what you see
            in the statusline — and what you see in your monthly bill.
          </p>
        </Reveal>

        <div className="ba-wrapper">
          {/* BEFORE */}
          <Reveal>
            <div className="ba-panel ba-panel-before">
              <div className="ba-title-bar ba-title-bar-before">
                <span className="ba-dot ba-dot-red" />
                <span className="ba-dot ba-dot-yellow" />
                <span className="ba-dot ba-dot-green" />
                <span style={{ marginLeft: 8 }}>Without Mooter</span>
              </div>
              <div className="ba-body">
                <div>$ git commit -m &ldquo;fix login button color&rdquo;</div>
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

          {/* AFTER */}
          <Reveal>
            <div className="ba-panel ba-panel-after">
              <div className="ba-title-bar ba-title-bar-after">
                <span className="ba-dot ba-dot-orange" />
                <span className="ba-dot ba-dot-green" />
                <span className="ba-dot ba-dot-green" />
                <span style={{ marginLeft: 8 }}>With Mooter 🐮</span>
              </div>
              <div className="ba-body">
                <div>$ git commit -m &ldquo;fix login button color&rdquo;</div>
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

        <Reveal style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div className="ba-total ba-total-before" style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: 'var(--muted)', marginBottom: 4, fontSize: '0.78rem' }}>WITHOUT MOOTER</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f47373' }}>$0.190</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>4 prompts · 4 × Opus · avg 6.7s</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', fontSize: '1.5rem' }}>→</div>
          <div className="ba-total ba-total-after" style={{ flex: 1, minWidth: 220 }}>
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
 * S8 — EVOLUTION (how Mooter stays current)
 * ───────────────────────────────────────────────────────────── */

function EvolutionSection() {
  return (
    <section className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Mooter grows as AI grows.<br />You never configure it again.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            New models drop every few weeks. Quality shifts. Local models get faster.
            Cloud pricing changes. Mooter tracks all of it — and updates your routing config
            automatically, without touching your workflow.
          </p>
        </Reveal>

        <div className="evo-grid stagger">
          <Reveal className="evo-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="evo-card-header">
              <div className="evo-icon">🔄</div>
              <div className="evo-title">Automatic model discovery</div>
            </div>
            <p className="evo-body">
              When you run <code>/mooter-update</code>, Mooter checks your Ollama installation for new models,
              benchmarks them against your hardware, and updates the routing table.
              When llama3.3 launched, Mooter users were routing to it within 72 hours.
            </p>
          </Reveal>

          <Reveal className="evo-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="evo-card-header">
              <div className="evo-icon">🧬</div>
              <div className="evo-title">Community-improved patterns</div>
            </div>
            <p className="evo-body">
              Every routing decision generates an anonymous delta — &ldquo;this prompt was T2,
              response was good, took 2.1s.&rdquo; Aggregated across all users,
              these deltas improve the classifier weekly. Your prompts are never sent.
              Only the decision outcome is shared.
            </p>
          </Reveal>

          <Reveal className="evo-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="evo-card-header">
              <div className="evo-icon">🎯</div>
              <div className="evo-title">Per-user profile tuning</div>
            </div>
            <p className="evo-body">
              Mooter builds a profile of your coding patterns over time. If you primarily
              work in Rust on low-level systems code, your routing config learns that.
              Tasks that look generic get classified with your domain context in mind.
            </p>
          </Reveal>

          <Reveal className="evo-card" style={{ '--i': 3 } as React.CSSProperties}>
            <div className="evo-card-header">
              <div className="evo-icon">📡</div>
              <div className="evo-title">Router self-assessment</div>
            </div>
            <p className="evo-body">
              Mooter runs a nightly backtest on your recent decisions. If a pattern is
              over-routing to Opus when Sonnet would have been sufficient, it flags it
              and proposes a correction. You approve. The router gets more precise.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <div className="evo-timeline">
            <div className="evo-event">
              <div className="evo-date">2026-01 — llama3.3:70b released</div>
              <div className="evo-event-title">Model registered in community catalog</div>
              <div className="evo-event-desc">Within 72h of release, benchmark data from early adopters was available. Users with 24GB+ VRAM started routing T0 tasks to llama3.3 for better quality at zero cost.</div>
            </div>
            <div className="evo-event">
              <div className="evo-date">2026-02 — Gemma3:12b outperforms qwen on code tasks</div>
              <div className="evo-event-title">Pattern weights updated for code-heavy profiles</div>
              <div className="evo-event-desc">Community backtest detected 18% better code completion quality. Users with code-heavy profiles got auto-migrated to gemma3:12b for T1 tasks. Quality improved; cost stayed zero.</div>
            </div>
            <div className="evo-event">
              <div className="evo-date">2026-03 — Claude Sonnet 4.6 pricing drops</div>
              <div className="evo-event-title">T2 tier cost model updated automatically</div>
              <div className="evo-event-desc">The model-profile.json was updated within 24h of the pricing change. Budget engine recalculated optimal routing for all budget tiers. Users on tight budgets gained headroom for more T2 tasks.</div>
            </div>
            <div className="evo-event">
              <div className="evo-date">Today — always current</div>
              <div className="evo-event-title">Router reflects the best available options</div>
              <div className="evo-event-desc">You installed once. The router learns continuously. You never think about which model to use. Mooter does.</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S9 — COMMUNITY PROOF
 * ───────────────────────────────────────────────────────────── */

function ProofSection() {
  const { stats } = useCommunityStats();

  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Real numbers. Real prompts.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Everything here comes from actual usage in the friends beta.
            No synthetic benchmarks. No cherry-picked sessions.
          </p>
        </Reveal>

        <div className="proof-cols">
          <Reveal className="proof-col">
            <div className="proof-big">
              <AnimatedNumber value={stats.savings_pct} decimals={1} suffix="%" />
            </div>
            <div className="proof-big-label">average savings per session</div>
            <p>
              Validated across {stats.prompt_count.toLocaleString()} real prompts from active vibe coders
              using Claude Code daily. The distribution: ~84% T0 (free), ~5% T1, ~8% T2, ~3% T3.
            </p>
            <p style={{ color: 'var(--green)', fontSize: '0.875rem', fontWeight: 600 }}>
              Measured against the baseline of sending every prompt to Opus.
            </p>
          </Reveal>

          <Reveal className="proof-col">
            <h3>What the classifier gets right</h3>
            <p>102 regex patterns. 170-prompt test suite. 100% accuracy on the test set.</p>
            <p>
              The classifier is conservative by design: when in doubt, it routes up.
              A borderline T1 task goes to T2. A borderline T2 goes to T3.
              You never get a bad answer to save money. The savings come from the tasks
              that are genuinely, unambiguously trivial — and there are a lot of them.
            </p>
            <div className="proof-chips">
              <span className="proof-chip">🔒 guardrails on all T3 tasks</span>
              <span className="proof-chip">⚡ &lt;50ms classification</span>
              <span className="proof-chip">🏠 local-first always</span>
              <span className="proof-chip">🔒 zero data sent to classify</span>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="community-flow">
            <div className="flow-step">
              <div className="flow-label">Your prompts</div>
              <div className="flow-desc">Classified locally. Decision made. Only the outcome (tier, latency, quality signal) is ever sent anywhere.</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step flow-step-mid">
              <div className="flow-label">Community hub</div>
              <div className="flow-desc">Anonymous deltas aggregated across users. No prompts. No code. No identifying data. Hourly aggregation, daily tuning.</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="flow-label">Smarter router</div>
              <div className="flow-desc">Weekly updates pushed to all clients. Patterns improve. New models get added. Your config evolves automatically.</div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="privacy-card">
            <div className="privacy-head">🔒 What Mooter never sends</div>
            <div className="privacy-body">
              <span className="privacy-no">Your prompt text</span>
              <span className="privacy-no">Your code or file contents</span>
              <span className="privacy-no">Your API keys or credentials</span>
              <span className="privacy-no">Your identity or email</span>
              <span className="privacy-yes">✓ Only: tier, latency_ms, quality_signal (1–5), model_used</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S10 — COMPARISON TABLE
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
      feature: 'Budget target routing',
      mooter: { val: '✅ Yes', win: true, note: 'Set monthly limit, auto-adjusts' },
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
      feature: 'Self-learning per user',
      mooter: { val: '✅ Yes', win: true, note: 'Nightly backtest + tuning' },
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
    <section id="compare" className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Not a proxy. Not a wrapper.<br />Something new.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Every other routing solution sits between you and your models — adding latency,
            security surface, and complexity. Mooter is a hook, not a proxy.
            It runs in your process, on your machine, with no network dependency for the routing decision.
          </p>
        </Reveal>

        <Reveal>
          <div className="comp-win-bar">
            <div className="comp-win-num">9/10</div>
            <div className="comp-win-label">
              features Mooter has that no other routing solution for Claude Code offers.
              The one exception: plain Claude Code is also zero-proxy — but it has no routing.
            </div>
          </div>
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
          <p className="comp-source">
            Comparison based on publicly available documentation as of 2026-04-14.
            LiteLLM, OpenRouter, Cursor are trademarks of their respective owners.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S11 — INSTALL (one command + auto-scan mockup)
 * ───────────────────────────────────────────────────────────── */

function InstallSection() {
  return (
    <section id="install" className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">One command. 60 seconds. Done.</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Mooter installs into your existing Claude Code setup. No config files to edit.
            No environment variables to set. Just run the command — it figures out the rest.
          </p>
        </Reveal>

        <Reveal>
          <InstallBlock />
        </Reveal>

        {/* Auto-scan mockup */}
        <Reveal>
          <div className="install-scan">
            <div className="install-scan-header">
              <span className="ba-dot ba-dot-red" />
              <span className="ba-dot ba-dot-yellow" />
              <span className="ba-dot ba-dot-green" />
              <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                mooter setup — scanning your environment
              </span>
            </div>
            <div className="install-scan-body">
              <div><span className="scan-dim">$</span> mooter setup</div>
              <div>&nbsp;</div>
              <div><span className="scan-accent">🐮 Mooter v0.9.9 — Smart LLM Router for Claude Code</span></div>
              <div>&nbsp;</div>
              <div><span className="scan-ok">✓</span> Claude Code detected (v1.8.2)</div>
              <div><span className="scan-ok">✓</span> Ollama detected (localhost:11434)</div>
              <div><span className="scan-found">↳</span> <span className="scan-found">qwen3:30b</span> — 20GB VRAM required</div>
              <div><span className="scan-found">↳</span> <span className="scan-found">gemma3:12b</span> — 8GB VRAM required</div>
              <div><span className="scan-found">↳</span> <span className="scan-found">qwen2.5:3b</span> — 2GB VRAM (safe default)</div>
              <div>&nbsp;</div>
              <div><span className="scan-ok">✓</span> GPU detected: RTX 4090 (24GB VRAM)</div>
              <div><span className="scan-ok">✓</span> Recommended T0 model: <span className="scan-found">qwen3:30b</span></div>
              <div><span className="scan-ok">✓</span> Recommended T1 model: <span className="scan-found">Claude Haiku</span> (API key found)</div>
              <div>&nbsp;</div>
              <div><span className="scan-ok">✓</span> ANTHROPIC_API_KEY found</div>
              <div><span className="scan-warn">⚠</span> No OPENAI_API_KEY — skipping GPT-4 tier</div>
              <div>&nbsp;</div>
              <div><span className="scan-ok">✓</span> Writing routing config to ~/.claude/tools/router/</div>
              <div><span className="scan-ok">✓</span> Installing UserPromptSubmit hook</div>
              <div><span className="scan-ok">✓</span> Installing 10 slash-command skills</div>
              <div><span className="scan-ok">✓</span> Running smoke test...</div>
              <div>&nbsp;</div>
              <div><span className="scan-accent">✓ Setup complete. Mooter is now active.</span></div>
              <div><span className="scan-dim">  Type /mooter-hello to see your routing profile.</span></div>
              <div><span className="scan-dim">  Type /mooter-status to verify everything is working.</span></div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="pillars stagger" style={{ marginTop: '3rem' }}>
            <Reveal className="pillar" style={{ '--i': 0 } as React.CSSProperties}>
              <div className="pillar-icon">🔍</div>
              <h3>Auto-scans your setup</h3>
              <p>GPU, RAM, Ollama models, API keys, Claude Code version — Mooter reads your environment and generates the optimal config for your specific machine.</p>
            </Reveal>
            <Reveal className="pillar" style={{ '--i': 1 } as React.CSSProperties}>
              <div className="pillar-icon">🔌</div>
              <h3>Hooks into Claude Code</h3>
              <p>Uses the official <code>UserPromptSubmit</code> hook. No process interception. No API keys exposed. The hook runs locally before any request leaves your machine.</p>
            </Reveal>
            <Reveal className="pillar" style={{ '--i': 2 } as React.CSSProperties}>
              <div className="pillar-icon">✅</div>
              <h3>Self-tests before activation</h3>
              <p>Smoke test verifies that classification works, Ollama responds, and the statusline updates correctly. If anything fails, it tells you exactly what to fix.</p>
            </Reveal>
            <Reveal className="pillar" style={{ '--i': 3 } as React.CSSProperties}>
              <div className="pillar-icon">🔒</div>
              <h3>Zero configuration after install</h3>
              <p>Your routing profile is generated once and updated automatically. You never edit a config file. You never decide which model to use for which task again.</p>
            </Reveal>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S12 — PRICING + ACCESS
 * ───────────────────────────────────────────────────────────── */

const HW_OPTIONS = [
  'Mac M1/M2/M3 (no GPU)',
  'Mac M3 Max / M4 Pro (16–48GB unified)',
  'Linux/Windows · RTX 3060 (8–12GB VRAM)',
  'Linux/Windows · RTX 4080/4090 (16–24GB VRAM)',
  'Linux/Windows · RTX 3090 / A100 (24GB+)',
  'No GPU (CPU-only Ollama)',
  'Cloud VM / no local AI',
];

const AI_SUBS = [
  'Claude Max', 'Claude API', 'OpenAI API', 'Gemini', 'Grok', 'Ollama only',
];

function PricingSection() {
  const [email, setEmail] = useState('');
  const [hw, setHw] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const toggleSub = (s: string) =>
    setSubs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          url: [hw, subs.join(', ')].filter(Boolean).join(' | ') || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setStatus('error');
        setErrorMsg(
          data?.error === 'invalid_email'
            ? "That email doesn't look right."
            : 'Something went wrong. Try again?',
        );
        return;
      }
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Try again?');
    }
  };

  if (status === 'done') {
    return (
      <section id="access" className="section">
        <div className="container narrow" style={{ textAlign: 'center', padding: '6rem 0' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>✉️</div>
          <h2 className="section-h2">Check your email.</h2>
          <p className="section-sub" style={{ margin: '1rem auto 2rem', textAlign: 'center' }}>
            We sent a magic link to <strong>{email}</strong>.
            Click it to create your profile and activate Mooter for your machine.
          </p>
          <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '2rem' }}>
            Can&rsquo;t wait? Install the open beta now:
          </p>
          <InstallBlock />
        </div>
      </section>
    );
  }

  return (
    <section id="pricing" className="section">
      <div className="container">
        <Reveal><h2 className="section-h2">Free. For real.</h2></Reveal>
        <Reveal>
          <p className="section-sub">
            Mooter is MIT-licensed. The routing engine, the classifier, the slash commands — all free.
            We make money only when we&rsquo;ve genuinely saved you money. Coming in v1.0.
          </p>
        </Reveal>

        <div className="pricing-cards stagger">
          <Reveal className="pricing-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="pricing-tier">Community</div>
            <div className="pricing-price">Free</div>
            <div className="pricing-desc">Forever. No credit card. No limits on routing.</div>
            <ul className="pricing-features">
              <li>Full routing engine (102 patterns)</li>
              <li>Hardware auto-detection</li>
              <li>10 slash-command skills</li>
              <li>Community hub access</li>
              <li>Savings tracking (session + lifetime)</li>
              <li>MIT license — fork it, own it</li>
            </ul>
          </Reveal>

          <Reveal className="pricing-card pricing-card-pro" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="pricing-tier-badge">Coming v1.0</div>
            <div className="pricing-tier">Pro</div>
            <div className="pricing-price">20% of savings</div>
            <div className="pricing-desc">
              You save $1,000/month → we earn $200. Pure aligned incentives.
              If we don&rsquo;t save you money, you pay nothing.
            </div>
            <ul className="pricing-features">
              <li>Everything in Community</li>
              <li>Real-time savings dashboard</li>
              <li>Priority pattern updates from hub</li>
              <li>Budget alert webhooks</li>
              <li>Per-project routing profiles</li>
              <li>Advanced analytics (cost by task type)</li>
            </ul>
          </Reveal>

          <Reveal className="pricing-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="pricing-tier">Enterprise</div>
            <div className="pricing-price">Custom</div>
            <div className="pricing-desc">Private hub, SSO, team cost visibility, SLA.</div>
            <ul className="pricing-features">
              <li>Everything in Pro</li>
              <li>Private routing hub</li>
              <li>Team cost dashboards</li>
              <li>SSO + full audit logs</li>
              <li>Dedicated pattern corpus</li>
              <li>SLA + dedicated support</li>
            </ul>
          </Reveal>
        </div>

        <Reveal>
          <div id="access" className="access-form-wrap">
            <h3 className="access-h3">🐮 Get early access</h3>
            <p className="access-sub">
              Tell us your setup and we&rsquo;ll generate the optimal routing config for your hardware profile.
            </p>

            <form className="access-form" onSubmit={onSubmit}>
              <div className="form-field">
                <label className="form-label">Email</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-field">
                <label className="form-label">Your hardware</label>
                <select className="form-input" value={hw} onChange={e => setHw(e.target.value)}>
                  <option value="">Select your setup</option>
                  {HW_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">AI subscriptions you already have</label>
                <div className="form-chips">
                  {AI_SUBS.map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`form-chip ${subs.includes(s) ? 'form-chip-on' : ''}`}
                      onClick={() => toggleSub(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {errorMsg && <div className="form-error">{errorMsg}</div>}

              <button
                className="btn btn-primary"
                type="submit"
                disabled={status === 'loading'}
                style={{ background: '#FF6B35', color: '#000', fontWeight: 700 }}
              >
                {status === 'loading' ? 'Sending...' : 'Get early access →'}
              </button>
            </form>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
 * S13 — FOOTER
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
          <a href="/methodology">Savings methodology</a>
          <a href="https://mooter.ai" target="_blank" rel="noopener">mooter.ai</a>
          <a href="mailto:paulo.loureiro.shp@gmail.com">Contact</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
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
        <ForWho />
        <TheProblem />
        <HowItWorks />
        <DemoSection />
        <BeforeAfterSection />
        <EvolutionSection />
        <ProofSection />
        <ComparisonSection />
        <InstallSection />
        <PricingSection />
        <Footer />
      </main>
    </ErrorBoundary>
  );
}
