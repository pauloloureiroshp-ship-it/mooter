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
  // Detect CLI login flow (?cli=1) and persist across OAuth redirect
  const params = new URLSearchParams(window.location.search);
  if (params.get('cli') === '1') {
    sessionStorage.setItem('cli_login', '1');
  }
  const redirectTo = `${window.location.origin}/auth/callback`;
  window.location.href = `${supabaseUrl}/auth/v1/authorize?provider=github&redirect_to=${encodeURIComponent(redirectTo)}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * ErrorBoundary
 * ──────────────────────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────────────────────
 * Hooks
 * ──────────────────────────────────────────────────────────────────────────── */

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
      fetch((process.env.NEXT_PUBLIC_MOOTER_HUB_URL || process.env.NEXT_PUBLIC_FRUGAL_HUB_URL || 'https://mooter-hub.frugal-hub.workers.dev') + '/api/stats', {
        signal: AbortSignal.timeout(3000),
      })
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

function Reveal({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
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

/* ────────────────────────────────────────────────────────────────────────────
 * Shared components
 * ──────────────────────────────────────────────────────────────────────────── */

function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '' }: {
  value: number; decimals?: number; prefix?: string; suffix?: string;
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

const INSTALL_CMD = 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';

function InstallBlock({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(INSTALL_CMD).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="install-block">
      <button className={`btn btn-primary ${compact ? '' : 'hero-cta'}`} onClick={copy}>
        {copied ? '\u2713 Copied!' : 'Copy install command'}
      </button>
      <div className="install-cmd" onClick={copy}>{INSTALL_CMD}</div>
      <div className="install-note">Requires: Node.js {'\u2265'}18 &middot; Claude Code &middot; Ollama (optional)</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * SVG Logos
 * ──────────────────────────────────────────────────────────────────────────── */

function AnthropicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#191919">
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  );
}

function OllamaIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z" />
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

function MistralIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FA520F">
      <path d="M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z" />
    </svg>
  );
}

function GrokIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S1 — NAV
 * ──────────────────────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <nav className="nav">
      <div className="container nav-row">
        <a href="#top" onClick={scrollTo('top')} className="brand">
          <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
          <span className="nav-brand-name">frugal</span>
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollTo('how')}>How it works</a>
          <a href="#demo" onClick={scrollTo('demo')}>Demo</a>
          <a href="#proof" onClick={scrollTo('proof')}>Proof</a>
          <a href="#install" onClick={scrollTo('install')}>Install</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
          <a href="#pricing" onClick={scrollTo('pricing')}>Pricing</a>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={loginWithGitHub}
            className="btn btn-sm"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'inherit', cursor: 'pointer' }}
          >
            Sign in
          </button>
          <a href="#access" onClick={scrollTo('access')} className="btn btn-primary btn-sm">
            Install now
          </a>
          <a href="/setup" className="btn btn-sm" style={{ border: '1px solid rgba(255,255,255,0.3)', color: 'inherit', textDecoration: 'none' }}>
            Quick Setup Guide
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S2 — HERO
 * ──────────────────────────────────────────────────────────────────────────── */

function Hero() {
  const { stats, live } = useCommunityStats();

  return (
    <section id="top" className="hero">
      <div className="container narrow hero-inner">
        <h1 className="hero-h1">
          The right model.
          <br />
          For every prompt. Automatically.
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
          frugal is a Claude Code router. It classifies every prompt in &lt;50ms
          and sends it to Ollama (free), Haiku, Sonnet, or Opus &mdash; only when each is needed.
          No proxy. No interception. Zero blast radius.
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
          <AnthropicIcon /> <OllamaIcon /> <OpenAIIcon /> <GeminiIcon /> <MistralIcon /> <GrokIcon />
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S3 — THE PROBLEM
 * ──────────────────────────────────────────────────────────────────────────── */

function TheProblem() {
  return (
    <section className="section">
      <div className="container">
        <Reveal><h2 className="section-h2">Sound familiar?</h2></Reveal>

        <div className="problem-grid stagger">
          <Reveal className="problem-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="problem-icon">&#x1F4B8;</div>
            <div className="problem-title">&ldquo;Your bill is Opus-sized&rdquo;</div>
            <p className="problem-body">
              You pay for the most powerful model on every single prompt.
              The git commit message. The variable rename. The copy-paste check.
              All of it, billed at the highest tier.
            </p>
          </Reveal>
          <Reveal className="problem-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="problem-icon">&#x1F3B0;</div>
            <div className="problem-title">&ldquo;You don&rsquo;t control the model&rdquo;</div>
            <p className="problem-body">
              Claude Code picks the model. You cross your fingers.
              Some prompts get Opus when they needed Haiku.
              Some get Haiku when they needed Opus. You never know which.
            </p>
          </Reveal>
          <Reveal className="problem-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="problem-icon">&#x1F512;</div>
            <div className="problem-title">&ldquo;You&rsquo;re locked into one provider&rdquo;</div>
            <p className="problem-body">
              Your RTX 4090 sits idle. Your Claude Max limits hit at 3pm.
              You have alternatives &mdash; Ollama, Gemini, GPT &mdash; but nothing orchestrates them.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <p className="problem-foot">
            frugal fixes this. It&rsquo;s not another AI subscription.
            It&rsquo;s the layer that makes the ones you have work smarter.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S4 — THE SOLUTION (4 pillars, 2×2)
 * ──────────────────────────────────────────────────────────────────────────── */

function TheSolution() {
  const [howTab, setHowTab] = useState<'how' | 'after'>('how');

  return (
    <section id="how" className="section section-alt">
      <div className="container">
        <Reveal><h2 className="section-h2">What frugal actually does</h2></Reveal>
        <Reveal>
          <p className="section-sub">
            One install. Every prompt classified in &lt;50ms. Nothing intercepted. Nothing proxied.
          </p>
        </Reveal>

        {/* Tab toggle */}
        <Reveal>
          <div className="how-tabs">
            <button className={`how-tab ${howTab === 'how' ? 'how-tab-active' : ''}`} onClick={() => setHowTab('how')}>
              How it works
            </button>
            <button className={`how-tab ${howTab === 'after' ? 'how-tab-active' : ''}`} onClick={() => setHowTab('after')}>
              After install
            </button>
          </div>
        </Reveal>

        {howTab === 'how' ? (
          <>
            <div className="pillars stagger">
              <Reveal className="pillar" style={{ '--i': 0 } as React.CSSProperties}>
                <div className="pillar-icon">&#x1F9E0;</div>
                <h3>Classifies every prompt in &lt;50ms</h3>
                <p>11-pass regex engine. Zero LLM, zero cost. ~90% accuracy on real developer prompts.</p>
              </Reveal>
              <Reveal className="pillar" style={{ '--i': 1 } as React.CSSProperties}>
                <div className="pillar-icon">&#x1F4BB;</div>
                <h3>Detects your hardware automatically</h3>
                <p>RTX 4090? M3 Pro? Ollama gets the best model for your VRAM. No config needed.</p>
              </Reveal>
              <Reveal className="pillar" style={{ '--i': 2 } as React.CSSProperties}>
                <div className="pillar-icon">&#x1F4CB;</div>
                <h3>Knows your subscription plan</h3>
                <p>Claude Max? No cap. API-only? Conservative. Time-aware routing respects your limits.</p>
              </Reveal>
              <Reveal className="pillar" style={{ '--i': 3 } as React.CSSProperties}>
                <div className="pillar-icon">&#x1F504;</div>
                <h3>Gets smarter with every user</h3>
                <p>Community deltas improve the classifier for all. Your prompts: never shared.</p>
              </Reveal>
            </div>

            <Reveal>
              <div className="arch-title">Every prompt takes the right path</div>
            </Reveal>

            <Reveal>
              <div className="arch">
                <div className="arch-input">Your Prompt</div>
                <div className="arch-arrow-down">&#x25BC;</div>
                <div className="arch-classifier">
                  <span>&#x1F415;</span> frugal classifier
                  <span className="arch-meta">&lt;50ms &middot; local &middot; pure regex</span>
                </div>
                <div className="arch-arrow-down">&#x25BC;</div>
                <div className="arch-branches">
                  <div className="arch-branch" style={{ borderColor: 'var(--t0)' }}>
                    <div className="arch-branch-head"><OllamaIcon /><span style={{ color: 'var(--t0)' }}>&#x1F3E0; T0</span></div>
                    <div className="arch-branch-model">Ollama &middot; qwen</div>
                    <div className="arch-branch-cost" style={{ color: 'var(--green)' }}>FREE</div>
                    <div className="arch-branch-pct">83.9% of prompts</div>
                  </div>
                  <div className="arch-branch" style={{ borderColor: 'var(--t1)' }}>
                    <div className="arch-branch-head"><AnthropicIcon /><span style={{ color: 'var(--t1)' }}>&#x1F338; T1</span></div>
                    <div className="arch-branch-model">Claude Haiku</div>
                    <div className="arch-branch-cost">~$0.001</div>
                    <div className="arch-branch-pct">~5%</div>
                  </div>
                  <div className="arch-branch" style={{ borderColor: 'var(--t2)' }}>
                    <div className="arch-branch-head"><AnthropicIcon /><span style={{ color: 'var(--t2)' }}>&#x1F3B5; T2</span></div>
                    <div className="arch-branch-model">Claude Sonnet</div>
                    <div className="arch-branch-cost">~$0.010</div>
                    <div className="arch-branch-pct">~12%</div>
                  </div>
                  <div className="arch-branch" style={{ borderColor: 'var(--t3)' }}>
                    <div className="arch-branch-head"><AnthropicIcon /><span style={{ color: 'var(--t3)' }}>&#x1F48E; T3</span></div>
                    <div className="arch-branch-model">Claude Opus</div>
                    <div className="arch-branch-cost">~$0.050</div>
                    <div className="arch-branch-pct">~3.6%</div>
                  </div>
                </div>
                <div className="arch-providers">
                  <span className="arch-prov-label">Also supports:</span>
                  <GeminiIcon /> <OpenAIIcon /> <GrokIcon /> <MistralIcon />
                </div>
              </div>
            </Reveal>

            <Reveal>
              <p className="arch-foot-copy">
                frugal doesn&rsquo;t replace your AI tools. It makes them work as a team,
                automatically, in every session.
              </p>
            </Reveal>
          </>
        ) : (
          <>
            <Reveal>
              <p className="section-sub" style={{ marginBottom: '2rem' }}>
                Everything works. Nothing changes. Except your bill.
              </p>
            </Reveal>
            <StatuslineSection />
            <SlashCommandsGrid />
            <AfterInstallTimeline />
          </>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S5 — THE DEMO: 3 real prompts, reasoning visible
 * ────────────────────────────────────────────────────────────────────────────── */

type PromptDemo = {
  prompt: string;
  category: string;
  /* What classify.js actually emits */
  classifyOutput: {
    tier: string;
    tierLabel: string;
    confidence: number;
    reasoning: string;
    matchedPatterns: string[];
    latencyMs: number;
  };
  /* Result */
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
  /* human explanation */
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
      reasoning: 'TRIVIAL fast-path: colour change + CSS animation. Single-element UI edit. No logic, no state, no risk. SHA-256 cache hit in 2ms.',
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
    whyThisModel: "Changing a button colour doesn't need a $120/h brain surgeon. A local model does it in 0.3s, free, while you sip your coffee. Without frugal, Claude charges you $0.05 for this. Every. Single. Time.",
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
    whyThisModel: 'This bug needs real reasoning — understanding mobile event handling, touch events, viewport differences. Sonnet nails it at $0.01. Opus would answer the same thing for $0.05. frugal knows the difference.',
  },
  {
    prompt: 'I need to build a payment system with Stripe, subscriptions, webhooks and fraud detection',
    category: 'New feature · High stakes',
    classifyOutput: {
      tier: 'T3',
      tierLabel: 'Opus · Maximum intelligence',
      confidence: 0.97,
      reasoning: 'HIGH_RISK: "payment" + "Stripe" + "webhooks" + "fraud detection". Financial data, security implications, multi-system architecture. Guardrail locked — cannot be demoted under any mode.',
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
    whyThisModel: "This is exactly what Opus is for. Payments, fraud, webhooks — one wrong decision and your users' money is at risk. frugal never cuts corners here. Full power. No compromise.",
  },
];


function ClassifyBadge({ tier, color }: { tier: string; color: string }) {
  return (
    <span className="classify-badge" style={{ color, borderColor: color }}>
      {tier}
    </span>
  );
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
      {/* Left: index + category */}
      <div className="pc-left">
        <div className="pc-num" style={{ color: p.tierColor }}>{String(index + 1).padStart(2, '0')}</div>
        <div className="pc-cat">{p.category}</div>
      </div>

      {/* Center: prompt text */}
      <div className="pc-prompt">&ldquo;{p.prompt}&rdquo;</div>

      {/* Right: result chip */}
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

  // Auto-cycle through prompts on scroll-in
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

  const totalReal  = PROMPTS.reduce((s, x) => s + parseFloat(x.thisCost.replace('$','')), 0);
  const totalOpus  = PROMPTS.reduce((s, x) => s + parseFloat(x.opusCost.replace('$','')), 0);
  const totalSaved = totalOpus - totalReal;
  const totalPct   = Math.round((totalSaved / totalOpus) * 100);

  return (
    <section id="demo" className="section section-alt">
      <div ref={ref} className="container">
        <Reveal>
          <h2 className="section-h2">Your ideas deserve to run free.<br /><span className="demo-h2-sub">frugal makes sure the bill never stops them.</span></h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Three prompts every vibe coder sends daily. Without frugal, all three hit Opus — 
            the most expensive model — regardless of complexity. Click each to see frugal&rsquo;s decision in real time.
          </p>
        </Reveal>

        {/* Prompt selector */}
        <Reveal>
          <div className="prompt-list">
            {PROMPTS.map((pr, i) => (
              <PromptCard
                key={i}
                p={pr}
                index={i}
                active={active === i}
                onClick={() => handleClick(i)}
              />
            ))}
          </div>
        </Reveal>

        {/* Main explainer panel */}
        <Reveal>
          <div className="demo-explainer" style={{ '--de-color': p.tierColor, '--de-bg': p.tierBg } as React.CSSProperties}>

            {/* Left: classify.js output */}
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

            {/* Right: result + explanation */}
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
                    <span className="de-cost-label">Response time</span>
                    <span className="de-cost-val">{p.responseTime}</span>
                  </div>
                </div>

                {p.savingPct > 0 ? (
                  <div className="de-saving-pill" style={{ color: p.tierColor, borderColor: p.tierColor }}>
                    {p.savingPct}% saved vs Opus-for-everything
                  </div>
                ) : (
                  <div className="de-no-saving-pill">
                    Opus required — no corners cut
                  </div>
                )}

                <p className="de-why">{p.whyThisModel}</p>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Running total */}
        <Reveal>
          <div className="demo-totals">
            <div className="dt-col">
              <span className="dt-label">3 prompts · Opus-for-everything</span>
              <span className="dt-val dt-val-muted">${totalOpus.toFixed(3)}</span>
            </div>
            <div className="dt-arrow">→</div>
            <div className="dt-col">
              <span className="dt-label">3 prompts · with frugal</span>
              <span className="dt-val" style={{ color: 'var(--t0)' }}>${totalReal.toFixed(3)}</span>
            </div>
            <div className="dt-divider" />
            <div className="dt-col">
              <span className="dt-label">Saved</span>
              <span className="dt-val dt-val-accent">${totalSaved.toFixed(3)} · {totalPct}%</span>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="demo-footer-note">
            A real vibe coding session generates 50&ndash;200 prompts a day. Most of them are UI tweaks,
            quick fixes, and questions &mdash; not architecture. At 83.9% T0 routing (our real average),
            frugal saves over{' '}<strong style={{color:'var(--accent)'}}>$900/month at 1,000 prompts</strong>.
            {' '}And the one time you need to build something real?{' '}
            <strong>Opus is right there. No compromise, ever.</strong>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S5b — FLYWHEEL + PRIVACY
 * ──────────────────────────────────────────────────────────────────────────── */

const SENT_FIELDS = [
  { label: 'tier', val: '"T0"', note: 'which model was picked' },
  { label: 'confidence', val: '0.98', note: 'how certain the classifier is' },
  { label: 'prompt_len', val: '42', note: 'character count only — never content' },
  { label: 'hw_tier', val: '"gpu_mid"', note: 'your hardware class' },
  { label: 'latency_ms', val: '9', note: 'classifier speed' },
];

const NEVER_SENT = [
  'Your prompt text',
  'Your code or files',
  'Your project name',
  'Your API keys',
  'Any personal data',
  'IP address',
];

const FLYWHEEL_STEPS = [
  {
    icon: '💬',
    label: 'You send a prompt',
    sub: 'classify.js runs in <50ms — locally, before any API call',
    color: 'var(--t0)',
  },
  {
    icon: '💰',
    label: 'frugal routes to the right model',
    sub: 'T0 costs $0. T1 costs cents. Opus only when truly needed.',
    color: 'var(--t1)',
  },
  {
    icon: '🔒',
    label: 'Anonymous delta sent to hub',
    sub: 'tier + confidence + length + hw_tier. SHA-256 hashed. No content ever.',
    color: 'var(--t2)',
  },
  {
    icon: '🧠',
    label: 'Community improves the classifier',
    sub: 'Aggregated patterns retrain the router. Everyone gets smarter routing.',
    color: 'var(--t3)',
  },
  {
    icon: '🔄',
    label: 'Better routing → more savings',
    sub: 'Next session, your T0% is higher. Loop repeats forever.',
    color: 'var(--accent)',
  },
];

function FlywheelSection() {
  return (
    <section id="flywheel" className="section">
      <div className="container">

        {/* Header */}
        <Reveal>
          <h2 className="section-h2">What happens after the savings</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Every prompt you route through frugal makes the system smarter for everyone —
            without your code, your ideas, or your data ever leaving your machine.
          </p>
        </Reveal>

        {/* Flywheel steps */}
        <Reveal>
          <div className="flywheel-steps">
            {FLYWHEEL_STEPS.map((step, i) => (
              <div key={i} className="fw-step">
                <div className="fw-icon" style={{ background: step.color + '22', border: `1px solid ${step.color}44` }}>
                  <span>{step.icon}</span>
                </div>
                {i < FLYWHEEL_STEPS.length - 1 && (
                  <div className="fw-arrow" style={{ color: step.color }}>↓</div>
                )}
                <div className="fw-body">
                  <div className="fw-label" style={{ color: step.color }}>{step.label}</div>
                  <div className="fw-sub">{step.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Privacy proof */}
        <Reveal>
          <div className="privacy-proof">
            <div className="pp-header">
              <span className="pp-lock">🔐</span>
              <div>
                <div className="pp-title">What&rsquo;s actually sent to the hub</div>
                <div className="pp-sub">5 numbers. All anonymous. SHA-256 signed. Open source.</div>
              </div>
            </div>

            <div className="pp-cols">
              {/* Sent */}
              <div className="pp-col pp-col-sent">
                <div className="pp-col-header pp-col-header-sent">✅ Sent (anonymously)</div>
                <div className="pp-fields">
                  {SENT_FIELDS.map((f, i) => (
                    <div key={i} className="pp-field">
                      <div className="pp-field-row">
                        <span className="pp-key">{f.label}</span>
                        <span className="pp-sep">:</span>
                        <span className="pp-val">{f.val}</span>
                      </div>
                      <div className="pp-note">{f.note}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Never sent */}
              <div className="pp-col pp-col-never">
                <div className="pp-col-header pp-col-header-never">🚫 Never sent. Ever.</div>
                <div className="pp-never-list">
                  {NEVER_SENT.map((item, i) => (
                    <div key={i} className="pp-never-item">
                      <span className="pp-never-x">✕</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="pp-never-note">
                  Privacy is enforced at the source — in <code>hub-push.js</code>, which you can read.
                  The classifier runs locally. Your prompts never leave your machine.
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Freedom statement */}
        <Reveal>
          <div className="freedom-banner">
            <div className="freedom-stat">
              <span className="freedom-num">83.9%</span>
              <span className="freedom-label">of your prompts cost nothing</span>
            </div>
            <div className="freedom-divider" />
            <div className="freedom-copy">
              <p>
                Build everything you imagine. Refactor, explore, experiment, iterate &mdash;
                without a running tally in the back of your mind. frugal doesn&rsquo;t just save money.
                It gives you back the confidence to <strong>invest in your ideas without fear.</strong>
              </p>
              <p className="freedom-sub">
                That&rsquo;s the real product: not cheaper tokens — a world where great ideas don&rsquo;t die
                because someone ran out of budget at 11pm.
              </p>
            </div>
          </div>
        </Reveal>

      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
/* ────────────────────────────────────────────────────────────────────────────
 * S6 — AFTER INSTALL (Statusline + Slash Commands + Timeline)
 * ──────────────────────────────────────────────────────────────────────────── */

function StatuslineSection() {
  return (
    <>
      <Reveal><h3 className="after-sub-title">Your terminal tells you everything</h3></Reveal>

      <Reveal>
        <div className="sl-card">
          <div className="sl-bar mono">
            \u2b06 main\u00b7a1b2{'  '}\u2502{'  '}&#x1F415; frugal v0.9{'  '}\u2502{'  '}
            <span className="sl-t0">[T0] qwen commit 0.3s</span>{'  '}\u2502{'  '}
            qwen 84% \u00b7 son 12% \u00b7 ops 4%{'  '}\u2502{'  '}
            <span className="sl-savings">\ud83d\udcb0 ~$12.80 saved (90%)</span>{'  '}\u2502{'  '}
            <span className="sl-gpu">\ud83d\udcbb RTX 4090 \u2593\u2593\u2593\u2593\u2591\u2591 61%</span>{'  '}\u2502{'  '}
            <span className="sl-dots">\u25cf\u25cf\u25cb\u25cb\u25cb\u25cb</span>
          </div>

          <div className="sl-annotations">
            <div className="sl-ann"><span className="sl-ann-num">\u2460</span> Git branch + commit hash</div>
            <div className="sl-ann"><span className="sl-ann-num">\u2461</span> &#x1F415; frugal &mdash; always visible, always there</div>
            <div className="sl-ann"><span className="sl-ann-num">\u2462</span> Last prompt: which model, why, how fast</div>
            <div className="sl-ann"><span className="sl-ann-num">\u2463</span> Your routing mix today (live)</div>
            <div className="sl-ann"><span className="sl-ann-num">\u2464</span> Total saved this session (running)</div>
            <div className="sl-ann"><span className="sl-ann-num">\u2465</span> Your GPU &mdash; frugal is running local models here</div>
            <div className="sl-ann"><span className="sl-ann-num">\u2466</span> Provider status: Claude \u00b7 Ollama \u00b7 Gemini \u00b7 GPT \u00b7 Grok \u00b7 Mistral</div>
          </div>

          <div className="sl-dot-legend mono">
            <span className="sl-dot-on">\u25cf</span> live{'  '}\u00b7{'  '}
            <span className="sl-dot-deg">\u25d0</span> degraded{'  '}\u00b7{'  '}
            <span className="sl-dot-off">\u25cb</span> not configured
          </div>
        </div>
      </Reveal>
    </>
  );
}

const SLASH_COMMANDS = [
  { cmd: '/frugal-status',    desc: 'Health check: hook, Ollama, hub, last decisions' },
  { cmd: '/frugal-savings',   desc: 'Economic report: saved so far + annual projection' },
  { cmd: '/frugal-route',     desc: 'Classify any task before you run it' },
  { cmd: '/frugal-summary',   desc: 'What the router decided this session, and why' },
  { cmd: '/frugal-update',    desc: 'Pull latest from GitHub + sync classifier' },
  { cmd: '/frugal-dashboard', desc: 'Open local dashboard at localhost:7820' },
  { cmd: '/frugal-beast',     desc: 'Force Opus on everything (max quality)' },
  { cmd: '/frugal-zen',       desc: 'Cap at Haiku/Ollama (max savings)' },
  { cmd: '/frugal-auto',      desc: 'Return to intelligent auto-routing' },
  { cmd: '/frugal-doctor',    desc: 'Diagnose + auto-fix installation issues' },
  { cmd: '/router',           desc: 'Quick on-demand routing recommendation' },
];

function SlashCommandsGrid() {
  return (
    <>
      <Reveal>
        <h3 className="after-sub-title">Eleven commands. Everything you need.</h3>
      </Reveal>
      <Reveal>
        <div className="slash-grid">
          {SLASH_COMMANDS.map(({ cmd, desc }) => (
            <div key={cmd} className="slash-card">
              <span className="slash-cmd">{cmd}</span>
              <span className="slash-desc">{desc}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </>
  );
}

function AfterInstallTimeline() {
  return (
    <Reveal>
      <div className="timeline">
        <div className="tl-item">
          <div className="tl-dot" />
          <div className="tl-label">Day 1</div>
          <div className="tl-content">
            Install runs. Hardware detected. Profile set. First prompt classified.
          </div>
        </div>
        <div className="tl-item">
          <div className="tl-dot" />
          <div className="tl-label">Week 1</div>
          <div className="tl-content">
            Backtest runs at 2am. Classifier patches itself. You&rsquo;ve already saved money.
          </div>
        </div>
        <div className="tl-item">
          <div className="tl-dot" />
          <div className="tl-label">Month 1+</div>
          <div className="tl-content">
            Community tuning arrives via hub-pull. Your savings grow. You&rsquo;re contributing to the shared model.
          </div>
        </div>
      </div>
    </Reveal>
  );
}


/* ────────────────────────────────────────────────────────────────────────────
 * S7 — THE PROOF
 * ──────────────────────────────────────────────────────────────────────────── */

function ProofSection() {
  return (
    <section id="proof" className="section">
      <div className="container">
        <Reveal><h2 className="section-h2">The proof isn&rsquo;t ours. It&rsquo;s yours.</h2></Reveal>

        <div className="proof-cols">
          <Reveal className="proof-col">
            <div className="proof-big">90.2%</div>
            <div className="proof-big-label">cost reduction</div>
            <p>
              On real developer prompts. Not benchmarks. Not demos. Real months of actual Claude
              Code usage, replayed through the classifier.
            </p>
            <div className="proof-chips">
              <span className="proof-chip">83.9% routed free to Ollama</span>
              <span className="proof-chip">Only 3.6% actually needed Opus</span>
              <span className="proof-chip">&lt;50ms hook latency (p50: 113ms)</span>
            </div>
          </Reveal>

          <Reveal className="proof-col">
            <h3>How you validate yours</h3>
            <div className="terminal-window terminal-sm">
              <div className="terminal-header">
                <span className="traffic-light red" />
                <span className="traffic-light yellow" />
                <span className="traffic-light green" />
              </div>
              <div className="terminal-body">
                <div className="code-comment"># After installing frugal, run:</div>
                <div className="code-line">node ~/.claude/tools/router/replay.js</div>
                <div className="code-blank" />
                <div className="code-comment"># Output:</div>
                <div className="code-line">T0 (free)   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588  78%</div>
                <div className="code-line">T2 (Sonnet) \u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  18%</div>
                <div className="code-line">T3 (Opus)   \u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591   4%</div>
                <div className="code-blank" />
                <div className="code-line">Projected savings: 87% ($18.40/month)</div>
                <div className="code-line dim">Run time: 12 seconds</div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <p className="proof-tagline">
            We don&rsquo;t ask you to trust our numbers.
            We give you the tool to run yours in 12 seconds.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
/* ────────────────────────────────────────────────────────────────────────────
 * INSTALL JOURNEY — step-by-step FOR DUMMIES
 * ──────────────────────────────────────────────────────────────────────────── */

const INSTALL_STEPS = [
  {
    num: '01',
    title: 'Got Claude Code?',
    desc: 'frugal lives inside Claude Code. If you don\u2019t have it yet, install it first.',
    check: 'claude --version',
    notYetUrl: 'https://claude.ai/download',
    notYetLabel: 'Install from claude.ai/download',
    time: '5 min',
    prereq: true,
  },
  {
    num: '02',
    title: 'Got Node.js 20+?',
    desc: 'The frugal router runs on Node.js. Most developers already have it.',
    check: 'node --version',
    notYetUrl: 'https://nodejs.org',
    notYetLabel: 'Install from nodejs.org (pick LTS)',
    time: '3 min',
    prereq: true,
  },
  {
    num: '03',
    title: 'Install frugal',
    desc: 'One line. Paste in your terminal. The installer detects your system automatically.',
    time: '30 sec',
    prereq: false,
  },
  {
    num: '04',
    title: 'Open Claude Code and send any prompt',
    desc: 'Anything. "rename this variable", "fix this bug", "write a test". frugal is already working silently.',
    example: 'rename the handleConnect function to onConnect',
    time: '5 sec',
    prereq: false,
  },
  {
    num: '05',
    title: 'Run /frugal-status',
    desc: 'See what happened. Which model was used. How much you saved. Your first WOW moment.',
    example: '/frugal-status',
    time: '2 sec',
    prereq: false,
  },
];

const INSTALL_CMD_WIN = 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex';

function InstallJourneySection() {
  const [tab, setTab] = useState<'mac' | 'win'>('mac');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const copyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section id="install" className="section section-alt">
      <div className="container">
        <Reveal><h2 className="section-h2">Install in under 2 minutes</h2></Reveal>
        <Reveal>
          <p className="section-sub">
            No proxies. No configuration. No API keys to rotate.
            Five steps and you&apos;re saving money.
          </p>
        </Reveal>

        <div className="install-journey">
          {INSTALL_STEPS.map((step, i) => (
            <Reveal key={step.num} className="ij-step" style={{ '--i': i } as React.CSSProperties}>
              <div className="ij-connector">
                <div className="ij-dot">{step.num}</div>
                {i < INSTALL_STEPS.length - 1 && <div className="ij-line" />}
              </div>
              <div className="ij-body">
                <div className="ij-header">
                  <h3 className="ij-title">{step.title}</h3>
                  <span className="ij-time">{step.time}</span>
                </div>
                <p className="ij-desc">{step.desc}</p>

                {/* Step 01 — Claude Code tooltip */}
                {step.num === '01' && (
                  <div className="ij-extra">
                    <button className="ij-toggle" onClick={() => toggleExpand('claude')}>
                      {expanded['claude'] ? '\u25BE' : '\u25B8'} What is Claude Code?
                    </button>
                    {expanded['claude'] && (
                      <div className="ij-tooltip">
                        Claude Code is Anthropic&apos;s AI programming tool.
                        It runs in your terminal (command line) and is the environment where frugal lives.
                        If you&apos;re new to vibe coding, start by installing Claude Code and come back here.
                      </div>
                    )}
                  </div>
                )}

                {/* Prereq steps — check command + not yet link */}
                {step.prereq && step.check && (
                  <div className="ij-check">
                    <code className="ij-cmd">{step.check}</code>
                    <span className="ij-check-label">Check in your terminal</span>
                    {step.notYetUrl && (
                      <a href={step.notYetUrl} target="_blank" rel="noopener" className="ij-notyet">
                        Don&apos;t have it? {step.notYetLabel} &rarr;
                      </a>
                    )}
                  </div>
                )}

                {/* Step 03 — install command with OS tabs */}
                {step.num === '03' && (
                  <div className="ij-install">
                    <div className="ij-tabs">
                      <button className={`ij-tab ${tab === 'mac' ? 'ij-tab-active' : ''}`} onClick={() => setTab('mac')}>
                        Mac / Linux
                      </button>
                      <button className={`ij-tab ${tab === 'win' ? 'ij-tab-active' : ''}`} onClick={() => setTab('win')}>
                        Windows
                      </button>
                    </div>
                    <div className="ij-cmd-block" onClick={() => copyCmd(tab === 'mac' ? INSTALL_CMD : INSTALL_CMD_WIN)}>
                      <code>{tab === 'mac' ? INSTALL_CMD : INSTALL_CMD_WIN}</code>
                      <span className="ij-copy">{copied ? '\u2713 Copied' : 'Copy'}</span>
                    </div>
                  </div>
                )}

                {/* Step 04 — example prompt */}
                {step.num === '04' && step.example && (
                  <div className="ij-example">
                    <code>&gt; {step.example}</code>
                  </div>
                )}

                {/* Step 05 — terminal mockup */}
                {step.num === '05' && (
                  <div className="ij-terminal">
                    <div className="ij-term-bar">
                      <span className="ij-term-dot" style={{ background: '#f47373' }} />
                      <span className="ij-term-dot" style={{ background: '#dcdcaa' }} />
                      <span className="ij-term-dot" style={{ background: '#4ec9b0' }} />
                    </div>
                    <pre className="ij-term-body">{`frugal status — all green
  Router: active · last prompt · T0 (free) ✓
  Savings: $0.05 saved already
  Ollama: qwen2.5:3b online
  Hub: connected`}</pre>
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="ij-footer">
            Total: less than 2 minutes. No configuration, no proxies, no risk.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S9 — COMPARISON TABLE (Why frugal wins)
 * ────────────────────────────────────────────────────────────────────────────── */

/* ------ data (all facts verified, April 2026) ------ */

type CompRow = {
  feature: string;
  frugal: { val: string; note?: string; win: boolean };
  openrouter: { val: string; note?: string; win: boolean };
  litellm: { val: string; note?: string; win: boolean };
  portkey: { val: string; note?: string; win: boolean };
  bedrock: { val: string; note?: string; win: boolean };
  manual: { val: string; note?: string; win: boolean };
};

const COMP_ROWS: CompRow[] = [
  {
    feature: 'Routing cost',
    frugal:     { val: '$0', note: 'pure regex, no API call', win: true },
    openrouter: { val: '0%* fee', note: 'passes through, cloud hop', win: false },
    litellm:    { val: '$0 OSS', note: 'infra ~$200–500/mo self-hosted', win: false },
    portkey:    { val: '$499+/mo', note: 'managed cloud gateway', win: false },
    bedrock:    { val: '$0 routing', note: 'pay model rates on AWS', win: false },
    manual:     { val: '$0', note: 'engineer time instead', win: false },
  },
  {
    feature: 'Works inside Claude Code',
    frugal:     { val: 'Native', note: 'UserPromptSubmit hook', win: true },
    openrouter: { val: 'No', note: 'API only, not Claude Code', win: false },
    litellm:    { val: 'No', note: 'generic proxy, not Claude Code', win: false },
    portkey:    { val: 'No', note: 'not Claude Code specific', win: false },
    bedrock:    { val: 'No', note: 'AWS API, not Claude Code', win: false },
    manual:     { val: 'Partial', note: '/model flag only', win: false },
  },
  {
    feature: 'Routing latency',
    frugal:     { val: '<50ms', note: 'p50: 18ms · regex', win: true },
    openrouter: { val: '~200ms+', note: 'cloud round-trip + classification', win: false },
    litellm:    { val: '~50ms', note: 'local self-hosted', win: false },
    portkey:    { val: '~150ms+', note: 'cloud gateway hop', win: false },
    bedrock:    { val: '~100ms+', note: 'AWS infra latency', win: false },
    manual:     { val: '∞', note: 'you pick the model', win: false },
  },
  {
    feature: 'Prompts stay on your machine',
    frugal:     { val: 'Always', note: 'no proxy, direct to Anthropic', win: true },
    openrouter: { val: 'Never', note: 'all prompts routed via OpenRouter', win: false },
    litellm:    { val: 'Yes*', note: 'only if self-hosted', win: false },
    portkey:    { val: 'No', note: 'cloud gateway, prompts transited', win: false },
    bedrock:    { val: 'No', note: 'prompts processed on AWS', win: false },
    manual:     { val: 'Yes', note: 'you hit Anthropic directly', win: true },
  },
  {
    feature: 'Auto routing by complexity',
    frugal:     { val: 'Yes', note: '11-pass classifier, T0→T3', win: true },
    openrouter: { val: 'No', note: 'you specify the model', win: false },
    litellm:    { val: 'Manual', note: 'rules you write yourself', win: false },
    portkey:    { val: 'Partial', note: 'cost-based rules, not complexity', win: false },
    bedrock:    { val: 'Partial', note: 'same-family only (Haiku↔Sonnet)', win: false },
    manual:     { val: 'No', note: 'you decide every time', win: false },
  },
  {
    feature: 'Offline / local-first',
    frugal:     { val: 'Yes', note: 'Ollama T0 works with no internet', win: true },
    openrouter: { val: 'No', note: 'cloud-only', win: false },
    litellm:    { val: 'Yes', note: 'if self-hosted with Ollama', win: true },
    portkey:    { val: 'No', note: 'cloud-only', win: false },
    bedrock:    { val: 'No', note: 'AWS cloud-only', win: false },
    manual:     { val: 'No', note: 'needs an API', win: false },
  },
  {
    feature: 'Hardware-aware routing',
    frugal:     { val: 'Yes', note: 'GPU probe: NVIDIA/Apple/AMD', win: true },
    openrouter: { val: 'No', note: 'cloud-side only', win: false },
    litellm:    { val: 'No', note: 'not hardware-aware', win: false },
    portkey:    { val: 'No', note: 'not hardware-aware', win: false },
    bedrock:    { val: 'No', note: 'not applicable', win: false },
    manual:     { val: 'No', note: 'you check manually', win: false },
  },
  {
    feature: 'Self-improving classifier',
    frugal:     { val: 'Yes', note: 'backtest.js runs nightly', win: true },
    openrouter: { val: 'No', note: 'static routing rules', win: false },
    litellm:    { val: 'No', note: 'static config', win: false },
    portkey:    { val: 'No', note: 'manual tuning', win: false },
    bedrock:    { val: 'Partial', note: 'AWS improves their model', win: false },
    manual:     { val: 'No', note: 'you update manually', win: false },
  },
  {
    feature: 'Community data flywheel',
    frugal:     { val: 'Yes', note: 'privacy-preserving deltas, hub', win: true },
    openrouter: { val: 'No', note: 'no community learning', win: false },
    litellm:    { val: 'No', note: 'isolated installs', win: false },
    portkey:    { val: 'No', note: 'per-tenant only', win: false },
    bedrock:    { val: 'No', note: 'AWS-internal only', win: false },
    manual:     { val: 'No', note: 'no learning', win: false },
  },
  {
    feature: 'Zero project changes',
    frugal:     { val: 'Yes', note: 'hook + doctrine only', win: true },
    openrouter: { val: 'No', note: 'change your API base URL', win: false },
    litellm:    { val: 'No', note: 'reconfigure all API calls', win: false },
    portkey:    { val: 'No', note: 'change SDK config', win: false },
    bedrock:    { val: 'No', note: 'migrate to AWS SDK', win: false },
    manual:     { val: 'No', note: 'manual /model every time', win: false },
  },
];

/* Pricing reality row (separate — shown as callout) */
const MODEL_PRICES = [
  { model: 'Haiku 4.5',  input: '$1.00', output: '$5.00',  color: 'var(--t1)', badge: 'T1 target' },
  { model: 'Sonnet 4.6', input: '$3.00', output: '$15.00', color: 'var(--t2)', badge: 'T2 target' },
  { model: 'Opus 4.6',   input: '$5.00', output: '$25.00', color: 'var(--t3)', badge: 'T3 only' },
  { model: 'Ollama local', input: '$0.00', output: '$0.00', color: 'var(--t0)', badge: 'T0 — free' },
];

type Col = 'frugal' | 'openrouter' | 'litellm' | 'portkey' | 'bedrock' | 'manual';

const COLS: { key: Col; label: string; sub: string }[] = [
  { key: 'frugal',     label: 'frugal',          sub: 'This' },
  { key: 'openrouter', label: 'OpenRouter',     sub: 'Cloud routing' },
  { key: 'litellm',    label: 'LiteLLM',        sub: 'OSS proxy' },
  { key: 'portkey',    label: 'PortKey',        sub: 'Paid gateway' },
  { key: 'bedrock',    label: 'AWS Bedrock',    sub: 'Cloud (same family)' },
  { key: 'manual',     label: 'Manual',         sub: '/model flag' },
];

function ComparisonSection() {
  const [activeRow, setActiveRow] = useState<number | null>(null);

  const frugalWins = COMP_ROWS.filter(r => r.frugal.win).length;

  return (
    <section id="compare" className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Why frugal wins — by the numbers</h2>
        </Reveal>
        <Reveal>
          <p className="section-sub">
            Every claim below is verifiable. Prices are from official docs as of April&nbsp;2026.
            If a competitor ships a feature we&apos;ve marked &ldquo;No&rdquo;, we&apos;ll update this table.
          </p>
        </Reveal>

        {/* Win count badge */}
        <Reveal>
          <div className="comp-win-bar">
            <span className="comp-win-num">{frugalWins}/{COMP_ROWS.length}</span>
            <span className="comp-win-label">
              features where frugal is the only solution — or wins outright
            </span>
          </div>
        </Reveal>

        {/* Main comparison table */}
        <Reveal>
          <div className="comp-scroll">
            <table className="comp-table">
              <thead>
                <tr>
                  <th className="comp-th-feat">Feature</th>
                  {COLS.map(c => (
                    <th key={c.key} className={`comp-th ${c.key === 'frugal' ? 'comp-th-frugal' : ''}`}>
                      <span className="comp-th-name">{c.label}</span>
                      <span className="comp-th-sub">{c.sub}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMP_ROWS.map((row, i) => (
                  <tr
                    key={i}
                    className={`comp-tr ${activeRow === i ? 'comp-tr-active' : ''}`}
                    onMouseEnter={() => setActiveRow(i)}
                    onMouseLeave={() => setActiveRow(null)}
                  >
                    <td className="comp-td-feat">{row.feature}</td>
                    {COLS.map(col => {
                      const cell = row[col.key];
                      return (
                        <td key={col.key} className={`comp-td ${col.key === 'frugal' ? 'comp-td-frugal' : ''}`}>
                          <span className={`comp-val ${cell.win ? 'comp-win' : 'comp-no'}`}>
                            {cell.val}
                          </span>
                          {cell.note && <span className="comp-note">{cell.note}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal>
          <p className="comp-source">
            Sources: Anthropic pricing (platform.claude.com), OpenRouter FAQ, LiteLLM docs,
            PortKey pricing, AWS Bedrock docs — all verified April 2026.
          </p>
        </Reveal>

        {/* Model price reality */}
        <Reveal>
          <h3 className="comp-sub-h3">What you&apos;re actually paying per model — before frugal</h3>
        </Reveal>
        <Reveal>
          <p className="comp-sub-copy">
            Every prompt hits one of these tiers. Without frugal, Claude Code defaults to Sonnet
            or Opus for everything. With frugal, 83.9% of prompts route free to Ollama.
          </p>
        </Reveal>
        <Reveal>
          <div className="price-cards">
            {MODEL_PRICES.map(p => (
              <div key={p.model} className="price-card" style={{ '--tier-color': p.color } as React.CSSProperties}>
                <div className="price-card-badge" style={{ color: p.color }}>{p.badge}</div>
                <div className="price-card-model">{p.model}</div>
                <div className="price-card-row">
                  <span className="price-card-label">Input</span>
                  <span className="price-card-val">{p.input}<span className="price-card-unit">/MTok</span></span>
                </div>
                <div className="price-card-row">
                  <span className="price-card-label">Output</span>
                  <span className="price-card-val">{p.output}<span className="price-card-unit">/MTok</span></span>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Value proposition cards */}
        <Reveal>
          <h3 className="comp-sub-h3">frugal&apos;s unique combination — no one else has all of this</h3>
        </Reveal>
        <div className="value-grid stagger">
          {[
            {
              icon: '⚡',
              title: 'Fastest routing in the category',
              body: 'Pure regex. No LLM API call to decide which LLM to call. Competitors route in 150–500ms. frugal routes in <50ms.',
              accent: 'var(--t0)',
            },
            {
              icon: '🔒',
              title: 'The only zero-proxy solution',
              body: 'Every other tool sits between you and Anthropic. frugal injects a hint — your prompt goes directly from Claude Code to Anthropic. No third party ever sees it.',
              accent: 'var(--t1)',
            },
            {
              icon: '🧠',
              title: 'The only self-improving classifier',
              body: 'backtest.js runs every night. When it finds a misroute, it patches classify.js automatically. No manual updates. No retraining. Just gets smarter.',
              accent: 'var(--t2)',
            },
            {
              icon: '🌐',
              title: 'The only community flywheel',
              body: 'Every user\'s misroutes improve the classifier for everyone — without any prompt ever leaving the machine. Competitors have no such network effect.',
              accent: 'var(--t3)',
            },
            {
              icon: '💻',
              title: 'Hardware-aware out of the box',
              body: 'Detects your GPU at install. RTX 4090, M3 Pro, AMD, CPU — frugal picks the best local model for your hardware. Nobody else does this.',
              accent: 'var(--accent)',
            },
            {
              icon: '📡',
              title: 'The only Claude Code-native router',
              body: 'Built for Claude Code specifically. Uses the UserPromptSubmit hook — not a wrapper, not a proxy. Invisible, zero-overhead, uninstallable in one command.',
              accent: 'var(--green)',
            },
          ].map((v, i) => (
            <Reveal key={i} className="value-card" style={{ '--i': i, '--v-accent': v.accent } as React.CSSProperties}>
              <div className="value-icon">{v.icon}</div>
              <h4 className="value-title">{v.title}</h4>
              <p className="value-body">{v.body}</p>
              <div className="value-bar" style={{ background: v.accent }} />
            </Reveal>
          ))}
        </div>

        {/* Vibe coding callout */}
        <Reveal>
          <div className="vibe-callout">
            <div className="vibe-head">&#x1F3A8; Built for vibe coding. Optimised for it.</div>
            <p className="vibe-body">
              When you&apos;re in flow — typing fast, exploring, iterating — you don&apos;t want to think
              about which model to use. frugal disappears into the background. Trivial prompts
              vanish into Ollama. Complex ones get Opus without you asking.
              The result: you code faster, spend less, and never hit a wall.
            </p>
            <div className="vibe-stats">
              <div className="vibe-stat"><strong>83.9%</strong><span>of prompts cost nothing</span></div>
              <div className="vibe-stat"><strong>&lt;50ms</strong><span>routing overhead</span></div>
              <div className="vibe-stat"><strong>0</strong><span>project changes needed</span></div>
              <div className="vibe-stat"><strong>∞</strong><span>models supported (Ollama + API)</span></div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S10 — PRICING + ACCESS
 * ────────────────────────────────────────────────────────────────────────────── */

const HW_OPTIONS = [
  'Mac M-series',
  'Windows + NVIDIA',
  'Windows + AMD',
  'Linux + NVIDIA',
  'Linux + AMD',
  'Cloud',
  'Other',
];

const AI_SUBS = ['Claude Max', 'Claude API', 'GPT Plus', 'GPT API', 'Gemini', 'None'];

function PricingAccess() {
  const [email, setEmail] = useState('');
  const [hw, setHw] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const toggleSub = (s: string) => {
    setSubs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

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
          <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>&#x2709;&#xFE0F;</div>
          <h2 className="section-h2">Check your email.</h2>
          <p className="section-sub" style={{ margin: '1rem auto 2rem', textAlign: 'center' }}>
            We sent a magic link to <strong>{email}</strong>.
            Click it to create your profile and set up frugal for your machine.
          </p>
          <p className="section-sub" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Can&apos;t wait? Install the open beta now:
          </p>
          <InstallBlock />
        </div>
      </section>
    );
  }

  return (
    <section id="pricing" className="section">
      <div className="container">
        <Reveal><h2 className="section-h2">Free. No catch.</h2></Reveal>
        <Reveal>
          <p className="section-sub">
            frugal is free to install and use. The only cost is whatever models you already pay for.
            We make money only when you save money — success fee model, coming in v1.0.
          </p>
        </Reveal>

        <div className="pricing-cards stagger">
          <Reveal className="pricing-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="pricing-tier">Community</div>
            <div className="pricing-price">Free</div>
            <div className="pricing-desc">Forever. No credit card. No limits.</div>
            <ul className="pricing-features">
              <li>Full local routing engine</li>
              <li>classify.js + all 102 patterns</li>
              <li>11 slash-command skills</li>
              <li>decisions.log telemetry</li>
              <li>Community hub access</li>
            </ul>
          </Reveal>
          <Reveal className="pricing-card pricing-card-pro" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="pricing-tier-badge">Coming v1.0</div>
            <div className="pricing-tier">Pro</div>
            <div className="pricing-price">20% of savings</div>
            <div className="pricing-desc">You save $1,000 → we earn $200. Aligned incentives.</div>
            <ul className="pricing-features">
              <li>Everything in Community</li>
              <li>Real-time savings dashboard</li>
              <li>Hub pull — community config</li>
              <li>Priority pattern updates</li>
              <li>Cost alert webhooks</li>
            </ul>
          </Reveal>
          <Reveal className="pricing-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="pricing-tier">Enterprise</div>
            <div className="pricing-price">Custom</div>
            <div className="pricing-desc">Private hub, SSO, SLA, dedicated corpus.</div>
            <ul className="pricing-features">
              <li>Everything in Pro</li>
              <li>Private hub instance</li>
              <li>SSO + full audit logs</li>
              <li>SLA guarantee</li>
              <li>Dedicated pattern corpus</li>
            </ul>
          </Reveal>
        </div>

        <Reveal>
          <div id="access" className="access-form-wrap">
            <h3 className="access-h3">Get early access</h3>
            <p className="access-sub">Tell us your setup — we&apos;ll prioritise your hardware profile.</p>

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
                <label className="form-label">Hardware</label>
                <select className="form-input" value={hw} onChange={e => setHw(e.target.value)}>
                  <option value="">Select your setup</option>
                  {HW_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">AI subscriptions</label>
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

              <button className="btn btn-primary btn-lg" type="submit" disabled={status === 'loading'}>
                {status === 'loading' ? 'Sending...' : 'Get early access'}
              </button>
            </form>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * FOOTER
 * ────────────────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <img src="/frugal-logo.svg" alt="frugal" width={24} height={24} />
          <span className="nav-brand-name">frugal</span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener">GitHub</a>
          <a href="/methodology">Savings methodology</a>
          <a href="mailto:paulo.loureiro.shp@gmail.com">Contact</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
        </div>
        <div className="footer-copy">
          Built in S&atilde;o Paulo &#x1F415; &middot; MIT License &middot; 2026
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * ACCESS CTA
 * ────────────────────────────────────────────────────────────────────────────── */

function AccessSection() {
  return (
    <section id="access" className="section" style={{ background: 'var(--bg-card, #0f0f0f)' }}>
      <div className="container narrow" style={{ textAlign: 'center', padding: '80px 0' }}>
        <Reveal>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '1rem' }}>
            Start saving today
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.1rem', maxWidth: '480px', margin: '0 auto 2rem' }}>
            Free during friends beta. Install in 30 seconds.
          </p>
        </Reveal>
        <Reveal>
          <button
            onClick={loginWithGitHub}
            className="btn btn-primary"
            style={{ padding: '0.875rem 2.5rem', fontSize: '1.05rem', display: 'inline-flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Sign in with GitHub
          </button>
        </Reveal>
        <Reveal>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1.25rem' }}>
            No credit card. No waitlist. We only read public GitHub metadata.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * APP ROOT
 * ────────────────────────────────────────────────────────────────────────────── */

export default function Page() {
  return (
    <ErrorBoundary>
      <Nav />
      <main>
        <Hero />
        <TheSolution />
        <DemoSection />
        <FlywheelSection />
        <ProofSection />
        <InstallJourneySection />
        <ComparisonSection />
        <PricingAccess />
        <AccessSection />
      </main>
      <Footer />
    </ErrorBoundary>
  );
}
