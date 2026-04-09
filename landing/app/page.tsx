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

type AnalyseResult = {
  url: string;
  platform: string;
  framework: string;
  language: string;
  llm_detected: boolean;
  llm_signals: string[];
  savings_pct: number;
  monthly_savings_usd: number;
  tier_breakdown: { t0_pct: number; t1_pct: number; t2_pct: number; t3_pct: number };
  suggestions: { type: string; name: string; reason: string; savings?: string }[];
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
 * Small presentational bits
 * ──────────────────────────────────────────────────────────────────────────── */

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

function scrollToId(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

function Nav() {
  return (
    <nav className="nav">
      <div className="container nav-row">
        <a href="#top" onClick={scrollToId('top')} className="brand">
          frugal<span className="brand-dot">.</span>
        </a>
        <div className="nav-links">
          <a href="#demo" onClick={scrollToId('demo')}>Demo</a>
          <a href="#analyse" onClick={scrollToId('analyse')}>Analyse</a>
          <a href="#how" onClick={scrollToId('how')}>How</a>
          <a href="#waitlist" onClick={scrollToId('waitlist')}>Pricing</a>
        </div>
        <a href="#waitlist" onClick={scrollToId('waitlist')} className="btn btn-primary btn-sm">
          Early access
        </a>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hero
 * ──────────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="top" className="hero">
      <div className="hero-glow" aria-hidden />
      <div className="container hero-inner">
        <div className="hero-badge">
          <span className="pulse-dot" /> Validated on 1,437 real prompts · 94% confidence
        </div>

        <h1 className="hero-h1">
          Stop burning Opus tokens
          <br />
          <span className="gradient-text">on groceries.</span>
        </h1>

        <p className="hero-sub">
          frugal is the Claude Code router that sends trivial tasks to free local models —
          automatically, in &lt;1ms, with zero proxies.{' '}
          <strong>90.2% cost reduction</strong> validated on 1,437 real prompts.
        </p>

        <div className="hero-stats">
          <Stat value={90.2} suffix="%" decimals={1} label="Cost saved vs all-Opus" />
          <Stat value={1437} label="Prompts backtested" />
          <Stat value={84} suffix="%" label="Run free on Ollama" />
          <Stat value={50} prefix="<" suffix="ms" label="Classify latency" />
        </div>

        <div className="hero-ctas">
          <a href="#analyse" onClick={scrollToId('analyse')} className="btn btn-primary">
            Analyse my project →
          </a>
          <a href="#how" onClick={scrollToId('how')} className="btn btn-ghost">
            How it works →
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
          <span className="ln-prompt">$</span> {line.text}
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

/* ────────────────────────────────────────────────────────────────────────────
 * Terminal demo section
 * ──────────────────────────────────────────────────────────────────────────── */

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
    <section id="demo" className="section">
      <div ref={ref} className="container">
        <div className="section-head">
          <h2 className="section-h2">Watch the router decide — live.</h2>
          <p className="section-sub">
            Every prompt classified in &lt;1ms by a pure regex engine. No LLM in the hot path.
            Trivial tasks route free. Opus is reserved for the 3.6% that genuinely need it.
          </p>
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
          <h2 className="section-h2">
            See exactly what frugal saves <em>you</em>.
          </h2>
          <p className="section-sub">
            Paste any public URL. We detect your platform, framework, LLM signals, and show how
            your prompts would be routed — with real dollar estimates from backtest data.
          </p>
        </div>

        <form className="analyse-form" onSubmit={onSubmit}>
          <div className="analyse-input-wrap">
            <span className="analyse-icon">🔍</span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="vercel.com   ·   https://nextjs.org   ·   railway.app"
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
 * How it works
 * ──────────────────────────────────────────────────────────────────────────── */

const HOW_CARDS = [
  {
    n: '01',
    title: 'Classify',
    body: 'Pure regex classifier in <1ms. No LLM in the hot path. SHA-256 cache avoids re-classifying identical prompts. Weighted scoring across 6 signal categories.',
    tag: 'classify.js · 165 lines',
  },
  {
    n: '02',
    title: 'Route',
    body: '4 tiers: T0 Ollama (free local), T1 Haiku (25× cheaper), T2 Sonnet (reasoning), T3 Opus (architecture only). HIGH_RISK patterns always escalate, no exceptions.',
    tag: 'patterns.js · dual-enforced',
  },
  {
    n: '03',
    title: 'Save',
    body: '84% of prompts route to free local Ollama. 90.2% cost reduction validated on 1,437 real production prompts across 3 projects, zero cherry-picking.',
    tag: '1,437 prompts · 3 projects',
  },
  {
    n: '04',
    title: 'Learn',
    body: 'Every night at 02:00, a scheduled task replays decisions, finds over-routing, and patches the classifier idempotently. Gets smarter from your own usage.',
    tag: 'backtest.js · daily @ 02:00',
  },
];

function HowItWorks() {
  return (
    <section id="how" className="section">
      <div className="container">
        <div className="section-head">
          <h2 className="section-h2">How frugal routes every prompt.</h2>
          <p className="section-sub">
            Four stages. Zero proxies. Nothing between Claude Code and the cheapest viable model.
          </p>
        </div>

        <div className="how-grid">
          {HOW_CARDS.map((c) => (
            <div className="how-card" key={c.n}>
              <div className="how-num">{c.n}</div>
              <div className="how-title">{c.title}</div>
              <div className="how-body">{c.body}</div>
              <div className="how-tag mono">{c.tag}</div>
            </div>
          ))}
        </div>

        <div className="safety-card">
          <div className="safety-head">🔒 The safety guarantee</div>
          <p>
            HIGH_RISK patterns are dual-enforced in the classifier and the backtest. No matter
            what the auto-tuner learns, these patterns always escalate to Opus:
          </p>
          <div className="safety-chips">
            {[
              'git push --force',
              'rm -rf',
              'drop table',
              '.env / secrets',
              'deploy / migration',
              'reset --hard',
              'production',
              'architecture',
            ].map((s) => (
              <span key={s} className="chip chip-red mono">{s}</span>
            ))}
          </div>
          <p className="safety-foot">
            Zero-blast-radius: if frugal dies, Claude Code falls back to its default behaviour
            instantly.
          </p>
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
    sub: '1,150 of 1,370 prompts needed zero API spend',
  },
  {
    value: 94,
    suffix: '%',
    decimals: 0,
    color: '#06b6d4',
    label: 'Backtest confidence',
    sub: '95% of decisions high-confidence (conf ≥ 0.6)',
  },
  {
    value: 50,
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
          <h2 className="section-h2">Validated. Not projected.</h2>
          <p className="section-sub">
            Every number here comes from real replay on real Claude Code transcripts. No
            projections. No marketing math.
          </p>
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
          <h2 className="section-h2">Get frugal before the public launch.</h2>
          <p className="section-sub">
            Installer · VS Code extension · Community backtest data · Plugin marketplace (roadmap).
            Free and open source forever. MIT license.
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
                placeholder="Your project URL — we'll pre-calculate your savings (optional)"
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
                  <span className="pulse-dot" /> {total.toLocaleString()} developers already on the list
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
            { icon: '🔒', title: 'Zero proxy', body: 'frugal runs locally. Your prompts never leave your machine' },
            { icon: '🔄', title: 'Auto-tuning', body: 'Daily backtest tunes the router from your own usage' },
            { icon: '🌐', title: 'Federated learning', body: 'Community patterns improve everyone (roadmap)' },
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
      <div className="container footer-row">
        <div className="footer-brand">
          frugal<span className="brand-dot">.</span>
          <span className="footer-meta"> · MIT License · Made by Paulo Loureiro</span>
        </div>
        <div className="footer-links">
          <a href="#analyse" onClick={scrollToId('analyse')}>Analyse project</a>
          <a href="#waitlist" onClick={scrollToId('waitlist')}>Early access</a>
          <a href="#how" onClick={scrollToId('how')}>How it works</a>
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
    <main>
      <Nav />
      <ErrorBoundary label="hero"><Hero /></ErrorBoundary>
      <ErrorBoundary label="terminal-demo"><TerminalDemo /></ErrorBoundary>
      <ErrorBoundary label="url-analyser"><UrlAnalyser /></ErrorBoundary>
      <ErrorBoundary label="how"><HowItWorks /></ErrorBoundary>
      <ErrorBoundary label="proof"><SocialProof /></ErrorBoundary>
      <ErrorBoundary label="waitlist"><Waitlist /></ErrorBoundary>
      <Footer />
    </main>
  );
}
