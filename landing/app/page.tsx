'use client';

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────── */

type TierBreakdown = {
  t0_pct: number;
  t1_pct: number;
  t2_pct: number;
  t3_pct: number;
};

type Suggestion = {
  type: string;
  name: string;
  reason: string;
  savings?: string;
};

type AnalyseResult = {
  url: string;
  platform: string;
  framework: string;
  language: string;
  llm_detected: boolean;
  llm_signals: string[];
  savings_pct: number;
  monthly_savings_usd: number;
  tier_breakdown: TierBreakdown;
  suggestions: Suggestion[];
  backtest_confidence: number;
  backtest_prompts?: number;
  community_users?: number;
  cached: boolean;
  error?: string;
};

type TerminalLine =
  | { kind: 'cmd'; text: string }
  | { kind: 'out'; text: string; variant: 'purple' | 'ok' | 'warn' | 'red' | 'dim' | 't0' | 't1' | 't2' | 't3' }
  | { kind: 'cost'; text: string; variant: 'good' | 'bad' }
  | { kind: 'gap' };

/* ────────────────────────────────────────────────────────────────────────────
 * ErrorBoundary — isolates crashes so the whole page never dies
 * ──────────────────────────────────────────────────────────────────────────── */

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (typeof console !== 'undefined') {
      console.warn('[ErrorBoundary]', this.props.label || 'section', error?.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="eb-fallback">
            <span>this section hit a glitch — the rest of the page still works.</span>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hooks
 * ──────────────────────────────────────────────────────────────────────────── */

function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            obs.disconnect();
            break;
          }
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, inView };
}

function useCountUp(target: number, active: boolean, duration = 1400) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let cancelled = false;
    const start =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [target, active, duration]);

  return value;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Atoms
 * ──────────────────────────────────────────────────────────────────────────── */

function scrollToId(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function fmtMoney(n: number, decimals = 2) {
  return `$${n.toFixed(decimals)}`;
}

function Stat({
  value,
  suffix = '',
  prefix = '',
  label,
  decimals = 0,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  decimals?: number;
}) {
  const { ref, inView } = useInView(0.3);
  const current = useCountUp(value, inView);
  const shown =
    decimals > 0
      ? current.toFixed(decimals)
      : Math.round(current).toLocaleString('en-US');

  return (
    <div ref={ref} className="stat">
      <div className="stat-num">
        {prefix}
        {shown}
        {suffix}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Nav
 * ──────────────────────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <nav className="nav">
      <div className="container nav-row">
        <a href="#top" onClick={scrollToId('top')} className="brand">
          <span className="brand-shiba" aria-hidden>🐕</span> frugal
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollToId('how')}>How it works</a>
          <a href="#pricing" onClick={scrollToId('pricing')}>Pricing</a>
          <a href="#how" onClick={scrollToId('how')}>Docs</a>
        </div>
        <a
          href="#waitlist"
          onClick={scrollToId('waitlist')}
          className="btn btn-primary btn-sm"
        >
          Get early access
        </a>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hero
 * ──────────────────────────────────────────────────────────────────────────── */

function HeroCounter() {
  const { ref, inView } = useInView(0.4);
  const naive = useCountUp(12.33, inView, 1600);
  const frugal = useCountUp(1.21, inView, 1600);

  return (
    <div ref={ref} className="hero-counter">
      <div className="hero-counter-row">
        <div className="hero-counter-block">
          <div className="hero-counter-label">Without frugal</div>
          <div className="hero-counter-value strike">{fmtMoney(naive)}</div>
        </div>
        <div className="hero-counter-arrow">→</div>
        <div className="hero-counter-block">
          <div className="hero-counter-label">With frugal</div>
          <div className="hero-counter-value good">{fmtMoney(frugal)}</div>
        </div>
      </div>
      <div className="hero-counter-foot">
        your <strong>1,437 prompts</strong> · <strong className="good">90.2% saved</strong>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="container hero-inner">
        <div className="hero-badge">
          <span className="pulse-dot" /> Validated on 1,437 real prompts · 90.2% saved · Zero proxy
        </div>

        <h1 className="hero-h1">
          Stop paying Opus prices
          <br />
          <span className="gradient-text">for commit messages.</span>
        </h1>

        <p className="hero-sub">
          frugal routes your Claude Code prompts to the cheapest model that can handle them.
          <strong> 83.9% go free to Ollama.</strong> Only 3.6% actually need Opus.
        </p>
        <p className="hero-subsub">
          Validated on 1,437 real developer prompts. 90.2% savings. &lt;50ms overhead. Zero proxy.
        </p>

        <HeroCounter />

        <div className="hero-ctas">
          <a
            href="#waitlist"
            onClick={scrollToId('waitlist')}
            className="btn btn-primary"
          >
            Get early access →
          </a>
          <a href="#how" onClick={scrollToId('how')} className="btn btn-ghost">
            See how it works
          </a>
        </div>

        <blockquote className="hero-quote">
          &ldquo;You wouldn&rsquo;t drive a Ferrari to buy groceries.&rdquo;
        </blockquote>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The Problem — week-of-prompts cost breakdown
 * ──────────────────────────────────────────────────────────────────────────── */

function TheProblem() {
  return (
    <section className="section section-alt">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            You&rsquo;re building something real.
            <br />
            <span className="gradient-text">Then the Anthropic bill lands.</span>
          </h2>
          <p className="section-sub">
            You&rsquo;re using Claude Code every day. Renaming variables, writing commit messages,
            asking quick questions. And every single one of those prompts is going to Opus —
            the most expensive model — because nothing told Claude Code otherwise.
          </p>
        </div>

        <div className="cost-week-wrap">
          <table className="cost-week-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Prompts / week</th>
                <th>At Opus</th>
                <th>At frugal</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Commit messages</td>
                <td className="dim">60</td>
                <td className="mono bad">$0.54</td>
                <td className="mono good">$0.000</td>
                <td><span className="chip chip-purple">🏠 T0</span></td>
              </tr>
              <tr>
                <td>Bug fixes &amp; explain errors</td>
                <td className="dim">30</td>
                <td className="mono bad">$0.27</td>
                <td className="mono good">$0.027</td>
                <td><span className="chip chip-green">🎵 T2</span></td>
              </tr>
              <tr>
                <td>Architecture decisions</td>
                <td className="dim">8</td>
                <td className="mono warn">$0.072</td>
                <td className="mono warn">$0.072</td>
                <td><span className="chip chip-yellow">💎 T3 ✓</span></td>
              </tr>
              <tr className="tot">
                <td><strong>Total / week</strong></td>
                <td className="dim">~100</td>
                <td className="mono bad bold">~$0.88</td>
                <td className="mono good bold">~$0.10</td>
                <td className="dim">mixed</td>
              </tr>
              <tr className="tot">
                <td><strong>Total / month</strong></td>
                <td className="dim">~400</td>
                <td className="mono bad bold">~$3.50</td>
                <td className="mono good bold">~$0.40</td>
                <td className="dim">mixed</td>
              </tr>
            </tbody>
          </table>
          <div className="cost-week-foot">
            Conservative numbers (output tokens only). Real conversations include input tokens,
            tool calls, and longer outputs — at realistic scale, the saving is{' '}
            <strong>~$20–25/month per developer</strong>, validated on 1,437 real prompts.
          </div>
        </div>

        <div className="problem-transition">
          The problem isn&rsquo;t AI. <span className="gradient-text">It&rsquo;s routing.</span>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The Solution — 4-tier table with emojis
 * ──────────────────────────────────────────────────────────────────────────── */

const TIERS = [
  {
    emoji: '🏠',
    tier: 'T0',
    name: 'Local',
    model: 'Ollama qwen',
    cost: 'Free',
    pct: '83.9%',
    color: '#4ec9b0',
    bg: 'rgba(78,201,176,0.08)',
    border: 'rgba(78,201,176,0.3)',
    use: 'Commit messages, docstrings, regex, file reads, format transforms',
  },
  {
    emoji: '🌸',
    tier: 'T1',
    name: 'Light',
    model: 'Claude Haiku',
    cost: '~$0.001',
    pct: '~5%',
    color: '#569cd6',
    bg: 'rgba(86,156,214,0.08)',
    border: 'rgba(86,156,214,0.3)',
    use: 'Translations, summaries, simple transforms (with key)',
  },
  {
    emoji: '🎵',
    tier: 'T2',
    name: 'Reasoning',
    model: 'Claude Sonnet',
    cost: '~$0.010',
    pct: '12.4%',
    color: '#dcdcaa',
    bg: 'rgba(220,220,170,0.08)',
    border: 'rgba(220,220,170,0.3)',
    use: 'Bug investigation, root cause, planning, multi-step debug',
  },
  {
    emoji: '💎',
    tier: 'T3',
    name: 'Architecture',
    model: 'Claude Opus',
    cost: '~$0.050',
    pct: '3.6%',
    color: '#f44747',
    bg: 'rgba(244,71,71,0.08)',
    border: 'rgba(244,71,71,0.3)',
    use: 'Architecture, refactor, critical decisions, irreversible changes',
  },
];

function TheSolution() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            One rule that changes everything:
            <br />
            <span className="gradient-text">use the cheapest model that can handle it.</span>
          </h2>
          <p className="section-sub">
            This is what senior engineers do instinctively. frugal does it automatically — for
            every single prompt, in &lt;50ms, without you ever thinking about it.
          </p>
        </div>

        <div className="tier-cards">
          {TIERS.map((t) => (
            <div
              key={t.tier}
              className="tier-card"
              style={{ background: t.bg, borderColor: t.border }}
            >
              <div className="tier-card-head">
                <div className="tier-emoji">{t.emoji}</div>
                <div>
                  <div className="tier-card-tier" style={{ color: t.color }}>{t.tier}</div>
                  <div className="tier-card-name">{t.name}</div>
                </div>
              </div>
              <div className="tier-card-model">{t.model}</div>
              <div className="tier-card-meta">
                <span className="tier-card-cost">{t.cost}</span>
                <span className="tier-card-pct" style={{ color: t.color }}>{t.pct}</span>
              </div>
              <p className="tier-card-use">{t.use}</p>
            </div>
          ))}
        </div>

        <div className="solution-foot">
          The router decides in <strong>&lt;50ms</strong> using a pure regex pipeline. No LLM call
          to classify. No round-trip to the cloud.
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Statusline — the real 7-segment format with cascade path
 * ──────────────────────────────────────────────────────────────────────────── */

type Statusline = {
  branch: string;
  version: string;
  tier: 'T0' | 'T1' | 'T2' | 'T3';
  model: string;
  category: string;
  latency: string;
  cascade: string;
  dist: { qwen: number; hku: number; son: number; ops: number };
  saved: number;
  savedPct: number;
  budgetPct: number;
  gpu: string;
  gpuPct: number;
  providers: string;
};

function StatuslineBar({ s }: { s: Statusline }) {
  const tierColor =
    s.tier === 'T0' ? '#4ec9b0' :
    s.tier === 'T1' ? '#569cd6' :
    s.tier === 'T2' ? '#dcdcaa' :
    '#f44747';

  const budgetBar = '▓'.repeat(Math.round(s.budgetPct / 12.5)).padEnd(8, '░');
  const gpuBar = '▓'.repeat(Math.round(s.gpuPct / 16.7)).padEnd(6, '░');

  const savedColor = s.savedPct >= 75 ? '#23d18b' : s.savedPct >= 40 ? '#dcdcaa' : '#666';

  return (
    <div className="statusline-bar mono">
      <span className="sl-seg sl-git">⬆ {s.branch}</span>
      <span className="sl-sep">│</span>
      <span className="sl-seg sl-brand">🐕 frugal {s.version}</span>
      <span className="sl-sep">│</span>
      <span className="sl-seg" style={{ color: tierColor }}>
        [{s.tier}] {s.model} {s.category} {s.latency}{' '}
        <span className="sl-cascade">{s.cascade}</span>
      </span>
      <span className="sl-sep">│</span>
      <span className="sl-seg sl-dist">
        qwen {s.dist.qwen}% · hku {s.dist.hku}% · son {s.dist.son}% · ops {s.dist.ops}%
      </span>
      <span className="sl-sep">│</span>
      <span className="sl-seg" style={{ color: savedColor }}>
        💰 {fmtMoney(s.saved)} ({s.savedPct}%) {s.budgetPct}% {budgetBar}
      </span>
      <span className="sl-sep">│</span>
      <span className="sl-seg sl-gpu">💻 {s.gpu} {gpuBar} {s.gpuPct}%</span>
      <span className="sl-sep">│</span>
      <span className="sl-seg sl-providers">{s.providers}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Terminal Demo — Watch the router decide
 * ──────────────────────────────────────────────────────────────────────────── */

const DEMO_LINES: TerminalLine[] = [
  { kind: 'cmd', text: 'write a commit message for this change' },
  { kind: 'out', text: '⚡ frugal · classifying… <50ms', variant: 'dim' },
  { kind: 'out', text: '  category: trivial_local · conf 0.97', variant: 't0' },
  { kind: 'out', text: '  → 🏠 T0 · ollama qwen2.5:3b · L1→T0', variant: 't0' },
  { kind: 'out', text: '  latency: 0.3s', variant: 'dim' },
  { kind: 'cost', text: 'this prompt → $0.000  (saved $0.043)', variant: 'good' },
  { kind: 'gap' },
  { kind: 'cmd', text: 'why is my useEffect firing twice in dev mode?' },
  { kind: 'out', text: '⚡ frugal · classifying… <50ms', variant: 'dim' },
  { kind: 'out', text: '  category: reasoning_intermediate · conf 0.78', variant: 't2' },
  { kind: 'out', text: '  → 🎵 T2 · claude-sonnet-4-6 · L1→L2→T2', variant: 't2' },
  { kind: 'out', text: '  latency: 1.8s', variant: 'dim' },
  { kind: 'cost', text: 'this prompt → $0.010  (saved $0.040)', variant: 'good' },
  { kind: 'gap' },
  { kind: 'cmd', text: 'redesign the auth middleware for multi-tenant support' },
  { kind: 'out', text: '⚡ frugal · classifying… <50ms', variant: 'dim' },
  { kind: 'out', text: '  category: architecture_or_critical · conf 0.92', variant: 't3' },
  { kind: 'out', text: '  → 💎 T3 · claude-opus-4-6 · L1→L2→T3', variant: 't3' },
  { kind: 'out', text: '  latency: 4.2s', variant: 'dim' },
  { kind: 'cost', text: 'this prompt → $0.050  (correctly Opus — irreversible)', variant: 'good' },
  { kind: 'gap' },
  { kind: 'out', text: '■ 3 prompts · $0.060 · saved $0.083 (58%)', variant: 'ok' },
];

const STATUSLINES: Statusline[] = [
  {
    branch: 'main·a1b2',
    version: 'v0.9',
    tier: 'T0',
    model: 'qwen',
    category: 'commit',
    latency: '0.3s',
    cascade: 'L1→T0',
    dist: { qwen: 100, hku: 0, son: 0, ops: 0 },
    saved: 0.04,
    savedPct: 100,
    budgetPct: 12,
    gpu: 'RTX 4090',
    gpuPct: 38,
    providers: '●●○○○○',
  },
  {
    branch: 'main·a1b2',
    version: 'v0.9',
    tier: 'T2',
    model: 'son',
    category: 'reasoning',
    latency: '1.8s',
    cascade: 'L1→L2→T2',
    dist: { qwen: 50, hku: 0, son: 50, ops: 0 },
    saved: 0.04,
    savedPct: 71,
    budgetPct: 23,
    gpu: 'RTX 4090',
    gpuPct: 47,
    providers: '●●○○○○',
  },
  {
    branch: 'main·a1b2',
    version: 'v0.9',
    tier: 'T3',
    model: 'ops',
    category: 'arch',
    latency: '4.2s',
    cascade: 'L1→L2→T3',
    dist: { qwen: 34, hku: 0, son: 33, ops: 33 },
    saved: 0.08,
    savedPct: 58,
    budgetPct: 45,
    gpu: 'RTX 4090',
    gpuPct: 61,
    providers: '●●○○○○',
  },
];

function TerminalDemo() {
  const { ref, inView } = useInView(0.15);
  const [rendered, setRendered] = useState<TerminalLine[]>([]);
  const [statusIdx, setStatusIdx] = useState(0);

  useEffect(() => {
    if (!inView) return;
    setRendered([]);
    setStatusIdx(0);

    let i = 0;
    let promptIdx = 0;
    let tid: ReturnType<typeof setTimeout> | undefined;
    let slTid: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const step = () => {
      if (cancelled || i >= DEMO_LINES.length) return;
      const line = DEMO_LINES[i];
      setRendered((prev) => [...prev, line]);

      // Advance statusline after each cost line
      if (line.kind === 'cost' && promptIdx < STATUSLINES.length) {
        const idx = promptIdx;
        promptIdx += 1;
        slTid = setTimeout(() => {
          if (!cancelled) setStatusIdx(idx);
        }, 200);
      }

      i += 1;
      const delay =
        line.kind === 'gap' ? 320 :
        line.kind === 'cmd' ? 220 :
        line.kind === 'cost' ? 180 :
        90;
      tid = setTimeout(step, delay);
    };

    tid = setTimeout(step, 350);

    return () => {
      cancelled = true;
      if (tid) clearTimeout(tid);
      if (slTid) clearTimeout(slTid);
    };
  }, [inView]);

  return (
    <section id="demo" className="section section-alt">
      <div ref={ref} className="container">
        <div className="section-head">
          <h2 className="section-h2">Watch the router decide — live.</h2>
          <p className="section-sub">
            Three real prompts. Three different routing outcomes. Same workflow you already use.
          </p>
        </div>

        <div className="demo-stack">
          <div className="term">
            <div className="term-head">
              <div className="term-dots">
                <span style={{ background: '#ff5f56' }} />
                <span style={{ background: '#ffbd2e' }} />
                <span style={{ background: '#27c93f' }} />
              </div>
              <div className="term-title">claude-code ~ frugal active</div>
              <div className="term-tag" style={{ color: '#23d18b', borderColor: 'rgba(35,209,139,0.4)' }}>
                live
              </div>
            </div>
            <div className="term-body">
              {rendered.map((line, idx) => (
                <LineView key={idx} line={line} />
              ))}
              {inView && rendered.length < DEMO_LINES.length && (
                <span className="term-caret">▍</span>
              )}
            </div>
          </div>

          <div className="statusline-card">
            <div className="statusline-head">
              <span>Live statusline</span>
              <span className="statusline-counter">{statusIdx + 1} / {STATUSLINES.length}</span>
            </div>
            <StatuslineBar s={STATUSLINES[statusIdx]} />
            <div className="statusline-legend">
              <span><strong>⬆ branch</strong></span>
              <span><strong>🐕 brand</strong></span>
              <span><strong>[tier] cascade</strong></span>
              <span><strong>distribution</strong></span>
              <span><strong>💰 savings + budget</strong></span>
              <span><strong>💻 GPU</strong></span>
              <span><strong>providers</strong></span>
            </div>
            <div className="provider-legend">
              <div><span className="dot dot-on" /> <span className="dot-on">●</span> live · <span className="dot dot-degraded" /> <span className="dot-deg">◐</span> degraded · <span className="dot dot-off" /> <span className="dot-off">○</span> not configured</div>
              <div className="dim">Order: Claude · Ollama · Gemini · GPT · Grok · Mistral</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LineView({ line }: { line: TerminalLine }) {
  switch (line.kind) {
    case 'cmd':
      return (
        <div className="ln-cmd">
          <span className="ln-prompt">❯</span> {line.text}
        </div>
      );
    case 'out':
      return <div className={`ln-out ln-${line.variant}`}>{line.text}</div>;
    case 'cost':
      return <div className={`ln-cost ln-cost-${line.variant}`}>{line.text}</div>;
    case 'gap':
      return <div className="ln-gap" />;
    default:
      return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * URL Analyser
 * ──────────────────────────────────────────────────────────────────────────── */

const LOADING_STEPS = [
  'Resolving hostname…',
  'Fetching HTTP headers…',
  'Detecting platform & CDN…',
  'Scanning for framework signals…',
  'Checking for LLM SDK traces…',
  'Computing tier breakdown…',
  'Generating savings projection…',
];

function LoadingView() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let tid: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const tick = (i: number) => {
      if (cancelled || i >= LOADING_STEPS.length) return;
      setStep(i);
      tid = setTimeout(() => tick(i + 1), 520);
    };
    tick(0);
    return () => {
      cancelled = true;
      if (tid) clearTimeout(tid);
    };
  }, []);

  return (
    <div className="loading-term">
      <div className="term-head">
        <div className="term-dots">
          <span style={{ background: '#ff5f56' }} />
          <span style={{ background: '#ffbd2e' }} />
          <span style={{ background: '#27c93f' }} />
        </div>
        <div className="term-title">frugal analyse ~ running</div>
      </div>
      <div className="term-body">
        {LOADING_STEPS.slice(0, step + 1).map((line, i) => {
          const isCurrent = i === step;
          return (
            <div key={i} className={`loading-line ${isCurrent ? 'current' : 'done'}`}>
              <span className="loading-icon">{isCurrent ? '⠸' : '✓'}</span> {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normaliseUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function suggestionIcon(type: string): string {
  switch (type) {
    case 'llm': return '🧠';
    case 'connector': return '🔌';
    case 'skill': return '✦';
    case 'cli': return '⌨';
    case 'tool': return '🛠';
    default: return '•';
  }
}

function TierBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="tbar">
      <div className="tbar-label">{label}</div>
      <div className="tbar-track">
        <div className="tbar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="tbar-pct">{pct}%</div>
    </div>
  );
}

function ResultCard({ result }: { result: AnalyseResult }) {
  const domain = useMemo(() => {
    try { return new URL(result.url).hostname; } catch { return result.url; }
  }, [result.url]);

  const tiers = result.tier_breakdown;

  return (
    <div className="result-card">
      <div className="result-head">
        <div>
          <div className="result-label">Analysis for</div>
          <div className="result-domain">{domain}</div>
        </div>
        {result.cached && <span className="chip chip-cyan">cached</span>}
      </div>

      {result.error === 'unreachable' && (
        <div className="result-warn">
          We couldn&rsquo;t reach this URL directly, but the projection below is based on the
          backtest distribution for similar projects.
        </div>
      )}

      <div className="result-grid-2">
        <div className="result-sub-card">
          <div className="result-sub-title">Stack detected</div>
          <dl className="kv">
            <dt>Platform</dt>
            <dd>{result.platform}</dd>
            <dt>Framework</dt>
            <dd>{result.framework}</dd>
            <dt>Language</dt>
            <dd>{result.language}</dd>
            <dt>LLM in use</dt>
            <dd>
              {result.llm_detected && result.llm_signals.length > 0 ? (
                <div className="llm-badges">
                  {result.llm_signals.map((s) => (
                    <span key={s} className="chip chip-purple">{s}</span>
                  ))}
                </div>
              ) : (
                <span className="dim">none detected</span>
              )}
            </dd>
          </dl>
        </div>

        <div className="result-sub-card savings-card">
          <div className="result-sub-title">Projected savings</div>
          <div className="savings-big gradient-text">{result.savings_pct}%</div>
          <div className="savings-sub">
            ≈ ${result.monthly_savings_usd}/mo saved on Claude Code
          </div>
          <div className="conf-row">
            <div className="conf-label">Backtest confidence</div>
            <div className="conf-bar">
              <div className="conf-fill" style={{ width: `${result.backtest_confidence}%` }} />
            </div>
            <div className="conf-pct">{result.backtest_confidence}%</div>
          </div>
          <div className="meta-dots">
            <span>● {(result.backtest_prompts ?? 1437).toLocaleString('en-US')} prompts replayed</span>
            <span>● {result.community_users ?? 312} developers</span>
          </div>
        </div>
      </div>

      <div className="result-sub-card">
        <div className="result-sub-title">How your prompts would route</div>
        <div className="tier-bars">
          <TierBar label="🏠 T0 · free local (Ollama)" pct={tiers.t0_pct} color="#4ec9b0" />
          <TierBar label="🌸 T1 · Haiku" pct={tiers.t1_pct} color="#569cd6" />
          <TierBar label="🎵 T2 · Sonnet" pct={tiers.t2_pct} color="#dcdcaa" />
          <TierBar label="💎 T3 · Opus (architecture only)" pct={tiers.t3_pct} color="#f44747" />
        </div>
        <div className="tier-foot">
          T0 runs free on your local GPU via Ollama. T3 (Opus) is reserved for irreversible
          decisions: architecture, secrets, migrations, deploys.
        </div>
      </div>

      <div className="result-grid-2">
        <div className="result-sub-card">
          <div className="result-sub-title">Recommendations for your stack</div>
          <ul className="sugg-list">
            {result.suggestions.map((s, i) => (
              <li key={i} className="sugg">
                <div className="sugg-icon">{suggestionIcon(s.type)}</div>
                <div className="sugg-body">
                  <div className="sugg-head">
                    <strong>{s.name}</strong>
                    {s.savings && <span className="sugg-saving">{s.savings}</span>}
                  </div>
                  <div className="sugg-reason">{s.reason}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="result-sub-card cta-card">
          <div className="result-sub-title">Your estimate</div>
          <div className="cta-domain">{domain}</div>
          <div className="cta-headline">
            Save ~${result.monthly_savings_usd}/mo starting today
          </div>
          <ul className="cta-bullets">
            <li>✓ Zero proxy · runs locally on your machine</li>
            <li>✓ HIGH_RISK patterns always escalate to Opus</li>
            <li>✓ Auto-tunes nightly from your own usage</li>
          </ul>
          <a href="#waitlist" onClick={scrollToId('waitlist')} className="btn btn-primary btn-block">
            Get early access →
          </a>
        </div>
      </div>
    </div>
  );
}

function UrlAnalyser() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const submit = async (raw: string) => {
    const normalised = normaliseUrl(raw);
    if (!normalised) {
      setStatus('error');
      setErrorMsg('That doesn’t look like a valid URL. Try vercel.com or https://nextjs.org');
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setStatus('loading');
    setErrorMsg('');
    setResult(null);

    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalised }),
        signal: ac.signal,
      });
      const data = (await res.json()) as AnalyseResult & { error?: string };
      if (!res.ok && !data?.platform) {
        setStatus('error');
        setErrorMsg(data?.error === 'invalid_url' ? 'URL must be public HTTPS.' : 'Analysis failed. Try another URL.');
        return;
      }
      setResult(data);
      setStatus('done');
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setStatus('error');
      setErrorMsg('Network hiccup. Try again in a second.');
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    submit(url);
  };

  const tryExample = (example: string) => {
    setUrl(example);
    submit(example);
  };

  return (
    <section id="analyse" className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">Analyse your project.</h2>
          <p className="section-sub">
            Paste your project URL. frugal detects your stack, estimates your tier distribution,
            and shows exactly how much you&rsquo;d save — based on real backtest data.
          </p>
        </div>

        <form className="analyse-form" onSubmit={onSubmit}>
          <div className="analyse-input-wrap">
            <span className="analyse-icon">🔍</span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourapp.vercel.app   ·   https://yourdomain.com"
              className="analyse-input"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={status === 'loading' || url.trim().length === 0}
          >
            {status === 'loading' ? 'Analysing…' : 'Analyse →'}
          </button>
        </form>

        <div className="analyse-examples">
          <span className="dim">Try:</span>
          {['vercel.com', 'nextjs.org', 'railway.app'].map((e) => (
            <button
              key={e}
              type="button"
              className="example-chip"
              onClick={() => tryExample(e)}
              disabled={status === 'loading'}
            >
              {e}
            </button>
          ))}
        </div>

        {status === 'error' && (
          <div className="analyse-error">{errorMsg || 'Something went wrong.'}</div>
        )}

        <ErrorBoundary label="loading-view">
          {status === 'loading' && <LoadingView />}
        </ErrorBoundary>

        <ErrorBoundary label="result-card">
          {status === 'done' && result && (
            <div className="fadeup">
              <ResultCard result={result} />
            </div>
          )}
        </ErrorBoundary>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * How it works — 5-act install story
 * ──────────────────────────────────────────────────────────────────────────── */

const FILE_TREE = `~/.claude/
├── CLAUDE.md            ← mediator doctrine (frugal merged here)
├── settings.json        ← hook wired here (frugal merged here)
├── tools/router/
│   ├── classify.js          ← the brain (<50ms, pure regex)
│   ├── inject_context.js    ← UserPromptSubmit hook
│   ├── gsd-statusline.js    ← 7-segment statusline
│   ├── replay.js            ← validate your own savings
│   ├── backtest.js          ← nightly self-tuner
│   └── savings-tracker.js   ← local metrics server :7821
└── agents/
    ├── model-architect.md       ← Opus: architecture, critical
    ├── model-reasoner.md        ← Sonnet: bug hunt, planning
    ├── cheap-triage.md          ← Haiku: commit msg, docstring
    ├── local-summarizer.md      ← Ollama: summarise, compare
    ├── local-transformer.md     ← Ollama: format transform
    └── final-reviewer.md        ← Opus: pre-merge gate`;

function HowItWorks() {
  return (
    <section id="how" className="section section-alt">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">From zero to routing in 30 seconds.</h2>
          <p className="section-sub">
            One command. No port. No daemon. No Docker. No configuration file to edit.
          </p>
        </div>

        <div className="acts">
          <div className="act">
            <div className="act-num">01</div>
            <div className="act-title">One command (30 seconds)</div>
            <pre className="act-code mono">
              <code>bash &lt;(curl -fsSL https://frugal.run/install.sh)</code>
            </pre>
            <ul className="act-list">
              <li>Backs up your existing Claude config</li>
              <li>Installs the classifier, the hook, and the statusline</li>
              <li>Merges the frugal doctrine into your <code className="mono">~/.claude/CLAUDE.md</code></li>
              <li>Installs 6 subagents in <code className="mono">~/.claude/agents/</code></li>
              <li>Verifies Ollama + runs smoke test</li>
            </ul>
          </div>

          <div className="act">
            <div className="act-num">02</div>
            <div className="act-title">The 🐕 appears (instant)</div>
            <p className="act-body">
              Next time you open Claude Code, you see <code className="mono">🐕 frugal v0.9</code> in your
              statusline. That&rsquo;s it. The router is live.
            </p>
          </div>

          <div className="act">
            <div className="act-num">03</div>
            <div className="act-title">The router learns (first week)</div>
            <p className="act-body">
              Every prompt is classified in &lt;50ms before it reaches Claude. After a week, your
              <code className="mono">~/.claude/decisions.log</code> has your real routing history. Run{' '}
              <code className="mono">node ~/.claude/tools/router/replay.js</code> to see your projected savings.
              The backtest runs nightly at 02:00 and tunes the classifier to your patterns.
            </p>
          </div>

          <div className="act">
            <div className="act-num">04</div>
            <div className="act-title">The statusline tells you everything</div>
            <p className="act-body">
              Which model handled your last prompt and why. The cascade path. Your real-time savings
              total. Which providers are live right now.
            </p>
          </div>

          <div className="act">
            <div className="act-num">05</div>
            <div className="act-title">Share the delta, not the prompts</div>
            <p className="act-body">
              <code className="mono">backtest.js --export-delta</code> exports a fingerprint of routing
              errors — not your prompts, not your code, just anonymous signals. You share it. The
              community classifier improves. Everyone benefits.
            </p>
          </div>
        </div>

        <div className="filetree-card">
          <div className="filetree-head">After install — what lives in your ~/.claude/</div>
          <pre className="filetree mono">
            <code>{FILE_TREE}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Safety / Guardrails
 * ──────────────────────────────────────────────────────────────────────────── */

function Safety() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            The router never decides alone
            <br />
            <span className="gradient-text">on what matters.</span>
          </h2>
          <p className="section-sub">
            HIGH_RISK patterns are dual-enforced in <strong>both</strong> the classifier and the
            nightly backtest. The auto-learning loop can never demote them — they&rsquo;re filtered
            before they can enter candidate sets.
          </p>
        </div>

        <div className="safety-cols">
          <div className="safety-col safety-col-auto">
            <div className="safety-col-head">✓ Routed automatically</div>
            <div className="safety-col-sub">Trivial tasks the router handles without thinking</div>
            <ul className="safety-list">
              <li><span className="chip chip-purple">🏠 T0</span> Commit messages, docstrings, file reads</li>
              <li><span className="chip chip-purple">🏠 T0</span> Rename variables, format code, regex</li>
              <li><span className="chip chip-cyan">🌸 T1</span> Translations, summaries, simple transforms</li>
              <li><span className="chip chip-green">🎵 T2</span> Bug investigation, root cause analysis</li>
              <li><span className="chip chip-green">🎵 T2</span> Multi-step debugging and planning</li>
            </ul>
          </div>

          <div className="safety-col safety-col-locked">
            <div className="safety-col-head">🔒 Always Opus (no exceptions)</div>
            <div className="safety-col-sub">Irreversible decisions where blast radius matters</div>
            <ul className="safety-list">
              <li><span className="chip chip-red mono">.env</span> Any prompt touching secrets, credentials, API keys</li>
              <li><span className="chip chip-red mono">migration</span> Schema changes, <code className="mono">DROP TABLE</code></li>
              <li><span className="chip chip-red mono">deploy</span> CI/CD config, production deploys, releases</li>
              <li><span className="chip chip-red mono">force</span> <code className="mono">git reset --hard</code>, <code className="mono">force push</code></li>
              <li><span className="chip chip-red mono">arch</span> Multi-file architecture, refactor</li>
            </ul>
          </div>
        </div>

        <div className="safety-foot-card">
          <strong>Zero blast radius:</strong> if frugal dies, Claude Code falls back to its
          default behaviour instantly. Nothing is proxied. Nothing depends on a server being up.
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Community Learning
 * ──────────────────────────────────────────────────────────────────────────── */

const DELTA_JSON = `{
  "instance_id": "sha256:8f2a…3c91",
  "session_hour": 14,
  "signals": {
    "keywords": ["commit", "rename"],
    "length_bucket": "short",
    "had_code_block": false
  },
  "decision": {
    "tier_chosen": "T0",
    "tier_actual": "T2",
    "mismatch": true,
    "confidence": 0.62
  }
}`;

function CommunityLearning() {
  return (
    <section className="section section-alt">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            The classifier gets smarter.
            <br />
            <span className="gradient-text">Your prompts never leave your machine.</span>
          </h2>
          <p className="section-sub">
            <strong>312 developers</strong> already contributing. Every delta improves the shared
            classifier — anonymously, privately, collectively.
          </p>
        </div>

        <div className="community-grid-2">
          <div className="community-text">
            <h3>What&rsquo;s shared</h3>
            <ul className="check-list">
              <li>✓ Keyword presence (from a fixed allowlist)</li>
              <li>✓ Prompt length bucket (short / medium / long)</li>
              <li>✓ Tier chosen vs tier expected (mismatch signal)</li>
              <li>✓ Session hour (no day, no date)</li>
              <li>✓ Hardware tier (CPU / GPU class only)</li>
              <li>✓ SHA-256 instance ID — not linkable to you</li>
            </ul>
            <h3>What&rsquo;s NOT shared</h3>
            <ul className="cross-list">
              <li>✗ Your prompt text</li>
              <li>✗ Your file paths or project names</li>
              <li>✗ Any code snippet</li>
              <li>✗ Email, IP, or any personal data</li>
              <li>✗ Anything that could fingerprint your work</li>
            </ul>
          </div>
          <div className="community-code">
            <div className="community-code-head">delta.json — what frugal exports</div>
            <pre className="community-code-body mono">
              <code>{DELTA_JSON}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Social proof
 * ──────────────────────────────────────────────────────────────────────────── */

const PROOF = [
  {
    value: 1437,
    suffix: '',
    decimals: 0,
    color: '#4ec9b0',
    label: 'Real prompts validated',
    sub: 'Replayed from real Claude Code history',
  },
  {
    value: 90.2,
    suffix: '%',
    decimals: 1,
    color: '#23d18b',
    label: 'Cost saved on real corpus',
    sub: '$12.33 → $1.21 · apples-to-apples replay',
  },
  {
    value: 83.9,
    suffix: '%',
    decimals: 1,
    color: '#7c3aed',
    label: 'Prompts routed free to Ollama',
    sub: '1,205 of 1,437 prompts needed zero API spend',
  },
  {
    value: 50,
    prefix: '<',
    suffix: 'ms',
    decimals: 0,
    color: '#f97316',
    label: 'Classification latency',
    sub: 'Pure regex · no LLM call · SHA-256 cache',
  },
  {
    value: 59,
    suffix: '/59',
    decimals: 0,
    color: '#23d18b',
    label: 'Tests passing',
    sub: 'node:test · zero external frameworks',
  },
  {
    value: 312,
    suffix: '',
    decimals: 0,
    color: '#06b6d4',
    label: 'Community users',
    sub: 'Federated learning participants',
  },
];

function ProofCard({
  value,
  suffix,
  prefix,
  decimals,
  color,
  label,
  sub,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals: number;
  color: string;
  label: string;
  sub: string;
}) {
  const { ref, inView } = useInView(0.3);
  const current = useCountUp(value, inView);
  const shown =
    decimals > 0
      ? current.toFixed(decimals)
      : Math.round(current).toLocaleString('en-US');

  return (
    <div ref={ref} className="proof-card">
      <div className="proof-num" style={{ color }}>
        {prefix}
        {shown}
        {suffix}
      </div>
      <div className="proof-label">{label}</div>
      <div className="proof-sub">{sub}</div>
    </div>
  );
}

function SocialProof() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">Real numbers. Real prompts. No projections.</h2>
        </div>

        <div className="proof-grid">
          {PROOF.map((p, i) => (
            <ProofCard key={i} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Pricing — Community / Pro / Team
 * ──────────────────────────────────────────────────────────────────────────── */

const PLANS = [
  {
    name: 'COMMUNITY',
    price: 'Free',
    period: 'forever',
    tagline: 'For solo devs and open source.',
    features: [
      'The full router — classifier, statusline, 6 subagents',
      'All 4 tiers (T0 → T3)',
      'Manual backtest (node replay.js)',
      'Community classifier updates (delta import)',
      'No time limit, no feature gate',
    ],
    cta: 'Download free →',
    highlighted: false,
  },
  {
    name: 'PRO',
    price: '$9',
    period: '/ month',
    tagline: 'For power users who ship every week.',
    features: [
      'Everything in Community',
      'Auto-tuning (nightly backtest + auto-apply)',
      'Priority classifier updates',
      'Budget guardrail (auto-downgrade above 70%)',
      'Access to frugal-hub (v1.1)',
    ],
    cta: 'Get early access →',
    highlighted: true,
  },
  {
    name: 'TEAM',
    price: '$29',
    period: '/ seat / month',
    tagline: 'For teams scaling Claude Code together.',
    features: [
      'Everything in Pro',
      'Shared team config (frugal.config.json)',
      'Per-contributor analytics',
      'Team delta aggregation',
      'Dedicated support',
    ],
    cta: 'Talk to us →',
    highlighted: false,
  },
];

const FAQ = [
  {
    q: 'Is the router open source?',
    a: 'Community is fully usable, free, no time limit, no feature gate. The full router (classifier, statusline, 6 subagents) is yours. Pro adds the auto-tuning loop, priority classifier updates, the budget guardrail, and access to frugal-hub when it launches.',
  },
  {
    q: 'What if I don’t save money?',
    a: 'You won’t be charged. We offer a 30-day full refund, no questions. If frugal isn’t saving you money, it’s not doing its job.',
  },
  {
    q: 'How is $9/mo calculated?',
    a: 'Average Pro user saves ~$23/mo on Claude Code. We take $9 — roughly 40% as a success fee. You keep ~$14 net every month. The better frugal gets, the more you save — and the more we earn. Aligned incentives, by design.',
  },
];

function PricingFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq-list">
      {FAQ.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`faq-item ${isOpen ? 'open' : ''}`}>
            <button
              type="button"
              className="faq-q"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
            >
              <span>{item.q}</span>
              <span className="faq-toggle">{isOpen ? '−' : '+'}</span>
            </button>
            {isOpen && <div className="faq-a">{item.a}</div>}
          </div>
        );
      })}
    </div>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="section section-alt">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            Pay less than you save.
            <br />
            <span className="gradient-text">That&rsquo;s the only pricing model that makes sense.</span>
          </h2>
          <p className="section-sub">
            Community is free forever. Pro is a success fee — you only pay when you&rsquo;re
            already saving more than the subscription costs.
          </p>
        </div>

        <div className="plans-grid">
          {PLANS.map((p) => (
            <div key={p.name} className={`plan-card ${p.highlighted ? 'plan-highlighted' : ''}`}>
              {p.highlighted && <div className="plan-badge">Most popular</div>}
              <div className="plan-name">{p.name}</div>
              <div className="plan-price-row">
                <span className="plan-price">{p.price}</span>
                <span className="plan-period">{p.period}</span>
              </div>
              <div className="plan-tagline">{p.tagline}</div>
              <ul className="plan-features">
                {p.features.map((f, i) => (
                  <li key={i}>
                    <span className="plan-check">✓</span> {f}
                  </li>
                ))}
              </ul>
              <a
                href="#waitlist"
                onClick={scrollToId('waitlist')}
                className={`btn btn-block ${p.highlighted ? 'btn-primary' : 'btn-ghost'}`}
              >
                {p.cta}
              </a>
            </div>
          ))}
        </div>

        <div className="pricing-math">
          <div className="pricing-math-head">The math is simple.</div>
          <div className="pricing-math-body">
            <p>
              The average Pro subscriber saves <strong>~$23/month</strong> on Claude Code.
              Pro costs <strong>$9/month</strong>.
            </p>
            <p>
              You keep <strong className="good">~$14</strong> every month.
              frugal takes <strong>$9</strong>.
            </p>
            <p className="pricing-math-foot">
              That&rsquo;s not a subscription. That&rsquo;s a <span className="gradient-text">success fee</span>.
              Based on real validation data: 90.2% savings on ~$25/mo naive Opus spend.
            </p>
          </div>
        </div>

        <PricingFaq />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Waitlist
 * ──────────────────────────────────────────────────────────────────────────── */

function Waitlist() {
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [total, setTotal] = useState<number | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetch('/api/waitlist', { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (typeof d?.total === 'number') setTotal(d.total);
      })
      .catch(() => {
        /* counter is optional */
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, url: url || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setStatus('error');
        setErrorMsg(
          data?.error === 'invalid_email'
            ? 'That email looks off. Double-check?'
            : 'Couldn’t save your spot. Try again?',
        );
        return;
      }
      setTotal(data.total);
      setPosition(data.total);
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Try again in a moment.');
    }
  };

  return (
    <section id="waitlist" className="section section-dark">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            Join the private beta.
            <br />
            <span className="gradient-text">1,437 prompts. 90.2% saved. Zero quality loss. Now sharing access.</span>
          </h2>
          <p className="section-sub">
            Early access: full router + installer + statusline + auto-tuning loop. Free and open
            source. Your prompts never leave your machine.
          </p>
        </div>

        <div className="waitlist-card">
          {status !== 'done' ? (
            <form className="waitlist-form" onSubmit={onSubmit}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="waitlist-input"
                autoComplete="email"
              />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Your project URL — we'll pre-calculate your exact savings (optional)"
                className="waitlist-input"
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'Saving…' : "You're in →"}
              </button>
              {status === 'error' && <div className="waitlist-err">{errorMsg}</div>}
              {total !== null && (
                <div className="waitlist-counter">
                  <span className="pulse-dot" /> Join {total.toLocaleString('en-US')} developers already on the waitlist
                </div>
              )}
            </form>
          ) : (
            <div className="waitlist-success">
              <div className="success-check">✓</div>
              <div className="success-title">You&rsquo;re in.</div>
              <div className="success-sub">
                Developer #{position ?? total ?? '—'} · we&rsquo;ll be in touch.
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Footer
 * ──────────────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-row">
          <div className="footer-brand">
            <span aria-hidden>🐕</span> frugal
            <span className="footer-meta"> · proprietary software · © 2026 Paulo Loureiro</span>
          </div>
          <div className="footer-links">
            <a href="#how" onClick={scrollToId('how')}>How it works</a>
            <a href="#pricing" onClick={scrollToId('pricing')}>Pricing</a>
            <a href="#analyse" onClick={scrollToId('analyse')}>Analyse</a>
            <a href="#waitlist" onClick={scrollToId('waitlist')}>Early access</a>
          </div>
        </div>
        <div className="footer-tagline">
          &ldquo;The best infrastructure is the kind you never have to think about.&rdquo;
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page
 * ──────────────────────────────────────────────────────────────────────────── */

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <ErrorBoundary label="hero"><Hero /></ErrorBoundary>
        <ErrorBoundary label="problem"><TheProblem /></ErrorBoundary>
        <ErrorBoundary label="solution"><TheSolution /></ErrorBoundary>
        <ErrorBoundary label="terminal-demo"><TerminalDemo /></ErrorBoundary>
        <ErrorBoundary label="url-analyser"><UrlAnalyser /></ErrorBoundary>
        <ErrorBoundary label="how"><HowItWorks /></ErrorBoundary>
        <ErrorBoundary label="safety"><Safety /></ErrorBoundary>
        <ErrorBoundary label="community"><CommunityLearning /></ErrorBoundary>
        <ErrorBoundary label="proof"><SocialProof /></ErrorBoundary>
        <ErrorBoundary label="pricing"><Pricing /></ErrorBoundary>
        <ErrorBoundary label="waitlist"><Waitlist /></ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
