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
  | { kind: 'out'; text: string; variant: 'purple' | 'ok' | 'warn' | 'red' | 'dim' }
  | { kind: 'cost'; text: string; variant: 'good' | 'bad' }
  | { kind: 'bar'; label: string; pct: number; color: string }
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
 * Small atoms
 * ──────────────────────────────────────────────────────────────────────────── */

function scrollToId(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
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
  const shown = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString();

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
          frugal<span className="brand-dot">.</span>
        </a>
        <div className="nav-links">
          <a href="#demo" onClick={scrollToId('demo')}>Demo</a>
          <a href="#how" onClick={scrollToId('how')}>How it works</a>
          <a href="#pricing" onClick={scrollToId('pricing')}>Pricing</a>
        </div>
        <a href="#waitlist" onClick={scrollToId('waitlist')} className="btn btn-primary btn-sm">
          Get early access →
        </a>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hero — the emotional hook
 * ──────────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="top" className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="container hero-inner">
        <div className="hero-badge">
          <span className="pulse-dot" /> Validated on 1,437 real prompts · Open source · MIT · Zero proxy
        </div>

        <h1 className="hero-h1">
          You can build anything with AI.
          <br />
          <span className="gradient-text">Until the bill arrives.</span>
        </h1>

        <p className="hero-sub">
          Every prompt you send to Claude Code costs money. The problem? Renaming a variable
          costs the same as redesigning your entire architecture. <strong>frugal fixes that</strong>{' '}
          — automatically, in &lt;1ms, with zero changes to your workflow.
        </p>

        <div className="hero-stats">
          <Stat value={90.2} suffix="%" decimals={1} label="cost saved" />
          <Stat value={1437} label="prompts validated" />
          <Stat value={84} suffix="%" label="run free" />
          <Stat value={1} prefix="<" suffix="ms" label="classify latency" />
        </div>

        <div className="hero-ctas">
          <a href="#analyse" onClick={scrollToId('analyse')} className="btn btn-primary">
            Analyse my project →
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
 * The Problem — vibe coder journey
 * ──────────────────────────────────────────────────────────────────────────── */

function TheProblem() {
  return (
    <section className="section section-alt">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">The vibe coder&rsquo;s invisible problem.</h2>
          <p className="section-sub">You didn&rsquo;t realise it yet. But you will.</p>
        </div>

        <div className="problem-grid">
          <div className="problem-card problem-rush">
            <div className="problem-icon">⚡</div>
            <h3 className="problem-title">You discovered the superpower.</h3>
            <p className="problem-body">
              A year ago, you couldn&rsquo;t build a full-stack app alone. Today you ship every
              week. Claude Code is your co-pilot. You write prompts, it writes code. It feels
              unlimited.
            </p>
          </div>

          <div className="problem-card problem-blind">
            <div className="problem-icon">👁</div>
            <h3 className="problem-title">But every prompt costs money. Even the trivial ones.</h3>
            <div className="problem-body mono-block">
              <div>&ldquo;rename this variable&rdquo;  → Opus → <span className="bad">$0.0043</span></div>
              <div>&ldquo;fix this typo&rdquo;          → Opus → <span className="bad">$0.0038</span></div>
              <div>&ldquo;write a commit message&rdquo; → Opus → <span className="bad">$0.0051</span></div>
            </div>
            <p className="problem-foot">
              These 3 prompts cost <strong className="bad">$0.013</strong>.
              You&rsquo;ll send 120 prompts today.
              That&rsquo;s <strong className="bad">$0.52 today</strong>. <strong className="bad">$15.60 this month</strong>.
              Just for tasks that didn&rsquo;t need Opus.
            </p>
          </div>

          <div className="problem-card problem-ceiling">
            <div className="problem-icon">🧱</div>
            <h3 className="problem-title">And when you scale, the wall hits hard.</h3>
            <div className="problem-body mono-block">
              <div>10 projects × 5 devs × 200 prompts/day</div>
              <div>= 10,000 prompts/day</div>
              <div>= <span className="bad">$500/day</span> on Opus</div>
              <div>= <span className="bad">$15,000/month</span></div>
            </div>
            <p className="problem-foot">
              The superpower has a price ceiling.
              Most vibe coders hit it and stop building.
            </p>
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
 * The Solution — tier table + algorithm pipeline + safety
 * ──────────────────────────────────────────────────────────────────────────── */

const TIERS = [
  {
    tier: 'T0',
    dot: '#7c3aed',
    model: 'Ollama (local)',
    cost: '$0.000',
    when: 'Trivial: rename, format, commit',
  },
  {
    tier: 'T1',
    dot: '#06b6d4',
    model: 'Claude Haiku',
    cost: '~$0.001',
    when: 'Simple: explain, regex, docstring',
  },
  {
    tier: 'T2',
    dot: '#22c55e',
    model: 'Claude Sonnet',
    cost: '~$0.010',
    when: 'Reasoning: debug, root cause, plan',
  },
  {
    tier: 'T3',
    dot: '#eab308',
    model: 'Claude Opus',
    cost: '~$0.050',
    when: 'Critical: deploy, .env, architecture',
  },
];

const ALGO_CARDS = [
  {
    n: '01',
    title: 'CLASSIFY',
    sub: '<1ms · Pure regex · No LLM in the hot path',
    body: "frugal intercepts every prompt before Claude Code sees it. A pure regex classifier — 165 lines, no AI, no network call — scores the prompt across signal categories and assigns a tier in under 1 millisecond. A SHA-256 cache means identical prompts are never re-classified.",
    tag: 'classify.js · 165 lines · <1ms',
  },
  {
    n: '02',
    title: 'ROUTE',
    sub: 'Routing rules · Dual-enforced guardrails · Zero proxy',
    body: "The routing decision is baked into Claude Code's behaviour. frugal never sits between you and the model — it teaches Claude Code which tier to use. HIGH_RISK patterns (deploy, .env, rm -rf, architecture) are dual-enforced: they always escalate to Opus, no matter what the auto-tuner learns.",
    tag: 'patterns.js · 46 patterns · dual-enforced',
  },
  {
    n: '03',
    title: 'SAVE',
    sub: '90.2% reduction · Validated · Zero cherry-picking',
    body: 'Validated on 1,437 real production prompts across 3 projects. $12.33 → $1.21. 84% of prompts routed to free local Ollama. Not a simulation. Not a projection. A real replay of real usage.',
    tag: '1,437 prompts · 3 projects · replay validated',
  },
  {
    n: '04',
    title: 'LEARN',
    sub: 'Daily at 02:00 · Idempotent patches · Gets smarter from you',
    body: "Every night, frugal replays your decisions, finds over-routing, and patches its own classifier. If 20 'summarise' prompts went to Sonnet this week, tomorrow they route to Haiku. The algorithm gets smarter from your real usage — and from every other frugal user in the community.",
    tag: 'backtest.js · daily @ 02:00 · self-improving',
  },
];

function TheSolution() {
  return (
    <section id="how" className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            One rule that changes everything:
            <br />
            <span className="gradient-text">use the cheapest model that gets the job done.</span>
          </h2>
          <p className="section-sub">
            This is what senior engineers do instinctively. frugal does it automatically, for
            every single prompt, in under 1ms.
          </p>
        </div>

        <div className="tier-table-wrap">
          <table className="tier-table">
            <thead>
              <tr>
                <th>Tier</th>
                <th>Model</th>
                <th>Cost / prompt</th>
                <th>When frugal uses it</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.tier}>
                  <td>
                    <span className="tier-cell">
                      <span className="tier-dot" style={{ background: t.dot }} />
                      <span className="tier-name">{t.tier}</span>
                    </span>
                  </td>
                  <td className="tier-model">{t.model}</td>
                  <td className="mono">{t.cost}</td>
                  <td className="dim">{t.when}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="tier-distribution">
            <div className="tier-dist-row">
              <span className="tier-dist-pct" style={{ color: '#7c3aed' }}>84%</span>
              <span>of prompts → T0 <span className="dim">(free)</span></span>
            </div>
            <div className="tier-dist-row">
              <span className="tier-dist-pct" style={{ color: '#06b6d4' }}>12%</span>
              <span>of prompts → T1 / T2 <span className="dim">(cheap)</span></span>
            </div>
            <div className="tier-dist-row">
              <span className="tier-dist-pct" style={{ color: '#eab308' }}>3.6%</span>
              <span>of prompts → T3 <span className="dim">(only when genuinely needed)</span></span>
            </div>
          </div>
        </div>

        <div className="algo-grid">
          {ALGO_CARDS.map((c) => (
            <div className="algo-card" key={c.n}>
              <div className="algo-num">{c.n}</div>
              <div className="algo-title">{c.title}</div>
              <div className="algo-sub">{c.sub}</div>
              <p className="algo-body">{c.body}</p>
              <div className="algo-tag mono">[{c.tag}]</div>
            </div>
          ))}
        </div>

        <div className="safety-card">
          <div className="safety-head">🔒 The one rule frugal never breaks.</div>
          <p>
            HIGH_RISK patterns always escalate to Opus. No matter what the auto-tuner learns,
            these never get demoted:
          </p>
          <div className="safety-chips">
            {[
              'git push --force',
              'rm -rf',
              'drop table',
              '.env · secrets',
              'deploy · release',
              'migration',
              'reset --hard',
              'architecture',
            ].map((s) => (
              <span key={s} className="chip chip-red mono">{s}</span>
            ))}
          </div>
          <p className="safety-foot">
            Dual-enforced: in the classifier AND in the learning loop. If frugal dies, Claude
            Code falls back to its default behaviour instantly. Zero blast radius.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Terminal Window
 * ──────────────────────────────────────────────────────────────────────────── */

function TerminalWindow({
  title,
  tag,
  tagColor,
  lines,
  statusBar,
  active,
  startDelay = 0,
}: {
  title: string;
  tag: string;
  tagColor: string;
  lines: TerminalLine[];
  statusBar: { text: string; color: string }[];
  active: boolean;
  startDelay?: number;
}) {
  const [rendered, setRendered] = useState<TerminalLine[]>([]);

  useEffect(() => {
    if (!active) return;
    setRendered([]);

    let i = 0;
    let tid: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const step = () => {
      if (cancelled || i >= lines.length) return;
      const line = lines[i];
      setRendered((prev) => [...prev, line]);
      i += 1;
      const delay =
        line.kind === 'gap'
          ? 220
          : line.kind === 'cmd'
          ? 180
          : line.kind === 'bar'
          ? 120
          : 60;
      tid = setTimeout(step, delay);
    };

    tid = setTimeout(step, startDelay);

    return () => {
      cancelled = true;
      if (tid) clearTimeout(tid);
    };
  }, [active, lines, startDelay]);

  return (
    <div className="term">
      <div className="term-head">
        <div className="term-dots">
          <span style={{ background: '#ff5f56' }} />
          <span style={{ background: '#ffbd2e' }} />
          <span style={{ background: '#27c93f' }} />
        </div>
        <div className="term-title">{title}</div>
        <div className="term-tag" style={{ color: tagColor, borderColor: `${tagColor}55` }}>
          {tag}
        </div>
      </div>

      <div className="term-body">
        {rendered.map((line, idx) => (
          <LineView key={idx} line={line} />
        ))}
        {active && rendered.length < lines.length && <span className="term-caret">▍</span>}
      </div>

      <div className="term-status">
        {statusBar.map((s, i) => (
          <span key={i} className="term-status-item" style={{ color: s.color }}>
            ● {s.text}
          </span>
        ))}
      </div>
    </div>
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
    case 'bar':
      return (
        <div className="ln-bar">
          <span className="ln-bar-label">{line.label}</span>
          <div className="ln-bar-track">
            <div
              className="ln-bar-fill"
              style={{ width: `${line.pct}%`, background: line.color }}
            />
          </div>
          <span className="ln-bar-pct">{line.pct}%</span>
        </div>
      );
    case 'gap':
      return <div className="ln-gap" />;
    default:
      return null;
  }
}

const WITHOUT_LINES: TerminalLine[] = [
  { kind: 'cmd', text: 'git commit -m "fix: button color"' },
  { kind: 'out', text: '⠸ Sending to Claude Opus 4…', variant: 'warn' },
  { kind: 'out', text: '  model: claude-opus-4  tokens_in: 2,847', variant: 'dim' },
  { kind: 'cost', text: 'this prompt         → $0.0043', variant: 'bad' },
  { kind: 'cost', text: '120 prompts/day     → $0.52/day', variant: 'bad' },
  { kind: 'cost', text: 'monthly estimate    → $15.60/mo', variant: 'bad' },
  { kind: 'gap' },
  { kind: 'cmd', text: '# rename a variable…' },
  { kind: 'out', text: '⠸ Sending to Claude Opus 4…', variant: 'warn' },
  { kind: 'cost', text: 'rename variable     → $0.0038', variant: 'bad' },
  { kind: 'gap' },
  { kind: 'cmd', text: '# "explain this error"' },
  { kind: 'out', text: '⠸ Sending to Claude Opus 4…', variant: 'warn' },
  { kind: 'cost', text: 'explain error       → $0.0051', variant: 'bad' },
  { kind: 'gap' },
  { kind: 'out', text: '■ 3 prompts · $0.0132 · Opus for everything', variant: 'red' },
];

const WITH_LINES: TerminalLine[] = [
  { kind: 'cmd', text: 'git commit -m "fix: button color"' },
  { kind: 'out', text: '⚡ frugal · TRIVIAL · conf 0.97 · <1ms', variant: 'purple' },
  { kind: 'out', text: '  → T1: claude-haiku-4-5  [25× cheaper]', variant: 'ok' },
  { kind: 'out', text: '  tokens_in: 2,847  out: 31', variant: 'dim' },
  { kind: 'cost', text: 'this prompt         → $0.00017', variant: 'good' },
  { kind: 'cost', text: 'saved vs Opus       → −96%', variant: 'good' },
  { kind: 'gap' },
  { kind: 'cmd', text: '# rename a variable…' },
  { kind: 'out', text: '⚡ frugal · T0-inline · conf 0.99 · <1ms', variant: 'purple' },
  { kind: 'out', text: '  → T0: ollama qwen3:30b  [free local 🆓]', variant: 'ok' },
  { kind: 'cost', text: 'rename variable     → $0.000', variant: 'good' },
  { kind: 'gap' },
  { kind: 'cmd', text: '# "explain this error"' },
  { kind: 'out', text: '⚡ frugal · T1 · conf 0.88 · <1ms', variant: 'purple' },
  { kind: 'out', text: '  → T1: claude-haiku-4-5', variant: 'ok' },
  { kind: 'cost', text: 'explain error       → $0.00019', variant: 'good' },
  { kind: 'gap' },
  { kind: 'bar', label: 'T0 free', pct: 84, color: '#7c3aed' },
  { kind: 'bar', label: 'T1 Haiku', pct: 10, color: '#06b6d4' },
  { kind: 'bar', label: 'T2 Sonnet', pct: 5, color: '#22c55e' },
  { kind: 'bar', label: 'T3 Opus', pct: 1, color: '#eab308' },
  { kind: 'gap' },
  { kind: 'out', text: '■ 3 prompts · $0.00036 · 84% free · −97%', variant: 'ok' },
];

function TerminalDemo() {
  const { ref, inView } = useInView(0.15);

  return (
    <section id="demo" className="section section-alt">
      <div ref={ref} className="container">
        <div className="section-head">
          <h2 className="section-h2">Watch the router decide — live.</h2>
          <p className="section-sub">Same 3 prompts. Two realities.</p>
        </div>

        <div className="term-grid">
          <ErrorBoundary label="terminal-without">
            <TerminalWindow
              title="claude-code ~ without frugal"
              tag="Opus for everything"
              tagColor="#ef4444"
              lines={WITHOUT_LINES}
              active={inView}
              startDelay={200}
              statusBar={[
                { text: 'Opus only', color: '#ef4444' },
                { text: '$0.52/day', color: '#ef4444' },
                { text: '$15.60/mo', color: '#ef4444' },
                { text: '0% free', color: '#8888aa' },
              ]}
            />
          </ErrorBoundary>

          <ErrorBoundary label="terminal-with">
            <TerminalWindow
              title="claude-code ~ with frugal"
              tag="Routed automatically"
              tagColor="#22c55e"
              lines={WITH_LINES}
              active={inView}
              startDelay={1400}
              statusBar={[
                { text: 'frugal active', color: '#7c3aed' },
                { text: '$0.054/day', color: '#22c55e' },
                { text: '$1.62/mo', color: '#22c55e' },
                { text: '84% free local', color: '#22c55e' },
              ]}
            />
          </ErrorBoundary>
        </div>

        <div className="cost-table-wrap">
          <table className="cost-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Without</th>
                <th></th>
                <th>With</th>
                <th>Tier</th>
                <th>Saving</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>git commit message</td>
                <td className="mono bad">$0.0043</td>
                <td className="dim">→</td>
                <td className="mono good">$0.00017</td>
                <td><span className="chip chip-cyan">T1 Haiku</span></td>
                <td className="good bold">−96%</td>
              </tr>
              <tr>
                <td>rename variable</td>
                <td className="mono bad">$0.0038</td>
                <td className="dim">→</td>
                <td className="mono good">$0.000</td>
                <td><span className="chip chip-purple">T0 Ollama</span></td>
                <td className="good bold">−100%</td>
              </tr>
              <tr>
                <td>explain this error</td>
                <td className="mono bad">$0.0051</td>
                <td className="dim">→</td>
                <td className="mono good">$0.00019</td>
                <td><span className="chip chip-cyan">T1 Haiku</span></td>
                <td className="good bold">−96%</td>
              </tr>
              <tr>
                <td>debug race condition</td>
                <td className="mono bad">$0.0062</td>
                <td className="dim">→</td>
                <td className="mono warn">$0.0018</td>
                <td><span className="chip chip-green">T2 Sonnet</span></td>
                <td className="good bold">−71%</td>
              </tr>
              <tr>
                <td>redesign auth system</td>
                <td className="mono warn">$0.018</td>
                <td className="dim">→</td>
                <td className="mono warn">$0.018</td>
                <td><span className="chip chip-yellow">T3 Opus ✓</span></td>
                <td className="dim">0% (correctly Opus)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
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
              <div
                className="conf-fill"
                style={{ width: `${result.backtest_confidence}%` }}
              />
            </div>
            <div className="conf-pct">{result.backtest_confidence}%</div>
          </div>
          <div className="meta-dots">
            <span>● {(result.backtest_prompts ?? 1437).toLocaleString()} prompts replayed</span>
            <span>● {result.community_users ?? 312} developers</span>
          </div>
        </div>
      </div>

      <div className="result-sub-card">
        <div className="result-sub-title">How your prompts would route</div>
        <div className="tier-bars">
          <TierBar label="T0 · free local (Ollama)" pct={tiers.t0_pct} color="#7c3aed" />
          <TierBar label="T1 · Haiku" pct={tiers.t1_pct} color="#06b6d4" />
          <TierBar label="T2 · Sonnet" pct={tiers.t2_pct} color="#22c55e" />
          <TierBar label="T3 · Opus (architecture only)" pct={tiers.t3_pct} color="#eab308" />
        </div>
        <div className="tier-foot">
          T0 runs free on your local GPU via Ollama. T3 (Opus) is reserved for architecture
          decisions, final reviews, and multi-file refactors only.
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
        setErrorMsg(
          data?.error === 'invalid_url'
            ? 'URL must be public HTTPS.'
            : 'Analysis failed. Try another URL.',
        );
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
    <section id="analyse" className="section section-alt">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">See your numbers.</h2>
          <p className="section-sub">
            Paste your project URL. frugal detects your stack, estimates your tier distribution,
            and shows exactly how much you&rsquo;d save — based on real backtest data, not guesses.
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
 * Community Learning — federated learning section
 * ──────────────────────────────────────────────────────────────────────────── */

function CommunityLearning() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            The more you use it, the smarter it gets.
            <br />
            <span className="gradient-text">For everyone.</span>
          </h2>
          <p className="section-sub">
            frugal&rsquo;s algorithm improves from every prompt decision — anonymously, privately,
            and collectively. You&rsquo;re not just saving money. You&rsquo;re teaching the router.
          </p>
        </div>

        <div className="community-grid">
          <div className="community-card">
            <div className="community-icon">🧠</div>
            <h3 className="community-title">Your usage trains the router</h3>
            <p>
              Every night at 02:00, frugal replays your decisions. Finds over-routing patterns.
              Patches its own classifier. Gets better at your specific workflow, your team&rsquo;s
              language, your project&rsquo;s prompt patterns.
            </p>
          </div>

          <div className="community-card">
            <div className="community-icon">🔒</div>
            <h3 className="community-title">Privacy-first federated learning</h3>
            <p>
              Only anonymised signals are shared — never your actual prompts. Keyword allowlist.
              Prompt length bucketed. Hardware tier only. Instance ID hashed with SHA-256. Your
              code never leaves your machine.
            </p>
          </div>

          <div className="community-card">
            <div className="community-icon">🌐</div>
            <h3 className="community-title">312 developers already contributing</h3>
            <p>
              Every frugal installation sends anonymous routing deltas to a shared pool. The
              community&rsquo;s collective routing intelligence makes everyone&rsquo;s classifier
              more accurate — including yours. The more people join, the smarter frugal gets for
              everyone.
            </p>
          </div>
        </div>

        <div className="statusline-card">
          <div className="statusline-head">Live statusline — after every Claude Code prompt</div>
          <div className="statusline-bar mono">
            ⬆ main·a1b2 │ 🐕 frugal v0.9 │ [T1] hku 0.3s │ qwn 84%·hku 10%·son 5%·ops 1% │ 💰 $1.21 (90%↑) ▓▓▓▓▓▓▓░░░ │ 💻 RTX 4090 ▓▓░ 61% │ ●●◐○○○
          </div>
          <div className="statusline-legend">
            <span>[git branch]</span>
            <span>[frugal brand]</span>
            <span>[last turn tier]</span>
            <span>[session distribution]</span>
            <span>[savings + budget bar]</span>
            <span>[GPU usage]</span>
            <span>[provider dots]</span>
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
    value: 90.2,
    suffix: '%',
    decimals: 1,
    color: '#22c55e',
    label: 'Cost saved vs all-Opus',
    sub: 'Real replay · $12.33 → $1.21 on 1,437 prompts',
  },
  {
    value: 84,
    suffix: '%',
    decimals: 0,
    color: '#7c3aed',
    label: 'Prompts run free on Ollama',
    sub: '1,150 of 1,437 prompts needed zero API spend',
  },
  {
    value: 94,
    suffix: '%',
    decimals: 0,
    color: '#06b6d4',
    label: 'Backtest accuracy',
    sub: '95% of decisions high-confidence (conf ≥ 0.6)',
  },
  {
    value: 1,
    prefix: '<',
    suffix: 'ms',
    decimals: 0,
    color: '#f97316',
    label: 'Classify latency',
    sub: 'Pure regex, no LLM, SHA-256 cache, zero blocking',
  },
  {
    value: 10,
    suffix: 'min',
    decimals: 0,
    color: '#eab308',
    label: 'To tune from your data',
    sub: 'Run replay on your own Claude Code history',
  },
  {
    value: 59,
    suffix: '/59',
    decimals: 0,
    color: '#22c55e',
    label: 'Tests passing',
    sub: 'node:test · zero external frameworks',
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
  const shown = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString();

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
    <section className="section section-alt">
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
 * Pricing — success fee model
 * ──────────────────────────────────────────────────────────────────────────── */

const PLANS = [
  {
    name: 'COMMUNITY',
    price: 'Free',
    period: 'forever',
    tagline: 'For solo builders and OSS hackers.',
    features: [
      'Full router (T0 → T3)',
      'All 4 tiers, no caps',
      'Auto-tuning every night',
      'MIT license · self-host',
      'Community learning pool',
    ],
    cta: 'Get started →',
    ctaHref: '#waitlist',
    highlighted: false,
  },
  {
    name: 'PRO',
    price: '$9',
    period: '/ month',
    tagline: 'For vibe coders who ship every week.',
    features: [
      'Everything in Community',
      'Personal dashboard',
      'Cost tracking & history',
      'Budget alerts',
      'Priority support',
      'Export decision logs',
    ],
    cta: 'Start free trial →',
    ctaHref: '#waitlist',
    highlighted: true,
  },
  {
    name: 'TEAM',
    price: '$29',
    period: '/ seat / month',
    tagline: 'For teams scaling Claude Code together.',
    features: [
      'Everything in Pro',
      'Shared team router',
      'Org-wide analytics',
      'Org-wide auto-tuning',
      'SLA 99.9%',
      'Private community hub',
    ],
    cta: 'Talk to us →',
    ctaHref: '#waitlist',
    highlighted: false,
  },
];

const FAQ = [
  {
    q: 'Is frugal open source?',
    a: 'Yes. The full router, classifier, and backtest loop are MIT-licensed. You can self-host everything for free, forever. Pro adds the dashboard, budget tracking, and managed tuning — not the core algorithm.',
  },
  {
    q: 'What if I don’t save money?',
    a: 'You won’t be charged. We offer a 30-day full refund, no questions. If frugal isn’t saving you money, it’s not doing its job.',
  },
  {
    q: 'How is $9/mo calculated?',
    a: 'Average user saves ~$44/mo. We take roughly 20% as a success fee. As we learn more about your usage and routing improves, you save more. The better frugal gets, the more you save — and the more we earn. Aligned incentives, by design.',
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
    <section id="pricing" className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">
            Pay less than you save.
            <br />
            <span className="gradient-text">That&rsquo;s the only pricing model that makes sense.</span>
          </h2>
          <p className="section-sub">
            frugal is free to install and run. The community tier is always free. Pro is a
            success fee — you only pay when you&rsquo;re already saving.
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
                href={p.ctaHref}
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
              Average frugal user saves <strong>$44/month</strong> on Claude Code.
              Pro costs <strong>$9/month</strong>.
            </p>
            <p>
              You keep <strong className="good">$35</strong> every month.
              frugal takes <strong>$9</strong>.
            </p>
            <p className="pricing-math-foot">
              That&rsquo;s not a subscription. That&rsquo;s a <span className="gradient-text">success fee</span>.
              We only make sense if you&rsquo;re already saving.
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
            Join the waitlist.
            <br />
            <span className="gradient-text">Be part of building the smartest LLM router on the planet.</span>
          </h2>
          <p className="section-sub">
            Early access: full router + installer + VS Code extension. Free and open source.
            MIT license. Your prompts never leave your machine.
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
                {status === 'loading' ? 'Saving…' : 'Get early access →'}
              </button>
              {status === 'error' && <div className="waitlist-err">{errorMsg}</div>}
              {total !== null && (
                <div className="waitlist-counter">
                  <span className="pulse-dot" /> Join {total.toLocaleString()} developers already on the waitlist
                </div>
              )}
            </form>
          ) : (
            <div className="waitlist-success">
              <div className="success-check">✓</div>
              <div className="success-title">You&rsquo;re on the list.</div>
              <div className="success-sub">
                Developer #{position ?? total ?? '—'} · we&rsquo;ll be in touch.
              </div>
            </div>
          )}
        </div>

        <div className="feature-grid">
          {[
            { icon: '⚡', title: 'One-command install', body: 'bash install.sh — no ports, no daemons, no config' },
            { icon: '🔒', title: 'Zero proxy', body: 'Your prompts never leave your machine' },
            { icon: '🔄', title: 'Self-improving', body: 'Tunes itself every night from your real usage' },
            { icon: '🌐', title: 'Community-powered', body: '312 devs contributing to the shared router' },
          ].map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <div className="feature-title">{f.title}</div>
              <div className="feature-body">{f.body}</div>
            </div>
          ))}
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
            frugal<span className="brand-dot">.</span>
            <span className="footer-meta"> · MIT License · Made with obsession by Paulo Loureiro</span>
          </div>
          <div className="footer-links">
            <a href="#how" onClick={scrollToId('how')}>How it works</a>
            <a href="#analyse" onClick={scrollToId('analyse')}>Analyse project</a>
            <a href="#pricing" onClick={scrollToId('pricing')}>Pricing</a>
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
        <ErrorBoundary label="community"><CommunityLearning /></ErrorBoundary>
        <ErrorBoundary label="proof"><SocialProof /></ErrorBoundary>
        <ErrorBoundary label="pricing"><Pricing /></ErrorBoundary>
        <ErrorBoundary label="waitlist"><Waitlist /></ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
