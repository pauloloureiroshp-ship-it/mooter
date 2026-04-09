'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */
type TierBreakdown = { t0_pct: number; t1_pct: number; t2_pct: number; t3_pct: number };
type Suggestion    = { type: string; name: string; reason: string; savings?: string };
type AnalyseResult = {
  url: string; platform: string; framework: string; language: string;
  llm_detected: boolean; llm_signals: string[];
  savings_pct: number; monthly_savings_usd: number;
  tier_breakdown: TierBreakdown; suggestions: Suggestion[];
  backtest_confidence: number; backtest_prompts: number; community_users: number;
  cached: boolean; error?: string;
};

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const TIERS = [
  { key: 't0_pct', label: 'T0 — Ollama local', model: 'qwen3:30b · $0.00', color: '#7c3aed' },
  { key: 't1_pct', label: 'T1 — Claude Haiku', model: 'haiku-4-5 · $0.80/Mtok', color: '#06b6d4' },
  { key: 't2_pct', label: 'T2 — Sonnet',       model: 'sonnet-4-6 · $3/Mtok',   color: '#22c55e' },
  { key: 't3_pct', label: 'T3 — Opus',          model: 'opus-4-6 · $15/Mtok',   color: '#eab308' },
] as const;

const SUG_ICON: Record<string, string> = {
  llm: '🤖', connector: '🔌', skill: '✨', cli: '⚡', tool: '🔬',
};

/* ─────────────────────────────────────────────────────────────────────────────
   ANIMATED COUNTER
───────────────────────────────────────────────────────────────────────────── */
function Counter({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const step = to / 60;
      const tick = () => {
        start = Math.min(start + step, to);
        setVal(Math.round(start));
        if (start < to) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   TERMINAL TYPEWRITER
───────────────────────────────────────────────────────────────────────────── */
type TLine = { type: 'cmd'|'out'|'gap'|'cost'|'bar'; text?: string; cls?: string; pct?: number; color?: string; label?: string; val?: string; ctype?: 'bad'|'good'|'dim' };

function TerminalWindow({ title, tag, tagColor, lines, statusItems }: {
  title: string; tag: string; tagColor: string;
  lines: TLine[];
  statusItems: { dot: string; label: string }[];
}) {
  const [rendered, setRendered] = useState<TLine[]>([]);
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setActive(true); obs.disconnect(); }
    }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    let i = 0;
    const run = () => {
      if (i >= lines.length) return;
      setRendered(prev => [...prev, lines[i]]);
      i++;
      const delay = lines[i - 1]?.type === 'gap' ? 300 :
                    lines[i - 1]?.type === 'cmd'  ? 120 : 60;
      setTimeout(run, delay);
    };
    run();
  }, [active, lines]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [rendered]);

  return (
    <div ref={ref} className="term-window" style={{ borderColor: tagColor === '#22c55e' ? 'rgba(34,197,94,0.3)' : 'var(--border)' }}>
      <div className="term-bar">
        <span className="tdot r"/><span className="tdot y"/><span className="tdot g"/>
        <span className="term-title">{title}</span>
        <span className="term-tag" style={{ background: `${tagColor}18`, color: tagColor, border: `1px solid ${tagColor}30` }}>{tag}</span>
      </div>
      <div ref={bodyRef} className="term-body">
        {rendered.map((l, i) => {
          if (l.type === 'gap')  return <div key={i} style={{ height: 8 }} />;
          if (l.type === 'cmd')  return <div key={i} className="tl-cmd"><span className="tl-p">❯</span><span className="tl-text">{l.text}</span></div>;
          if (l.type === 'bar')  return (
            <div key={i} className="tl-bar-row">
              <span className="tl-bar-label">{l.label}</span>
              <div className="tl-bar-track"><div className="tl-bar-fill" style={{ width: `${l.pct}%`, background: l.color }} /></div>
              <span className="tl-bar-pct" style={{ color: l.color }}>{l.pct}%</span>
            </div>
          );
          if (l.type === 'cost') return (
            <div key={i} className={`tl-cost ${l.ctype}`}>
              <span className="tl-cost-label">{l.label}</span>
              <span className={`tl-cost-val ${l.ctype}`}>{l.val}</span>
            </div>
          );
          return <div key={i} className={`tl-out ${l.cls || ''}`}>{l.text}</div>;
        })}
        <span className="tl-cursor">▌</span>
      </div>
      <div className="term-status">
        {statusItems.map((s, i) => (
          <div key={i} className="term-status-item">
            <span className="ts-dot" style={{ background: s.dot }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

const WITHOUT_LINES: TLine[] = [
  { type: 'cmd',  text: 'git commit -m "fix: button color"' },
  { type: 'gap' },
  { type: 'out',  text: '⠸ Sending to Claude Opus 4…', cls: 'warn' },
  { type: 'out',  text: '  model:      claude-opus-4', cls: 'dim' },
  { type: 'out',  text: '  tokens_in:  2,847  out: 34', cls: 'dim' },
  { type: 'gap' },
  { type: 'cost', label: 'this prompt', val: '$0.0043', ctype: 'bad' },
  { type: 'cost', label: '120 prompts/day →', val: '$0.52/day', ctype: 'bad' },
  { type: 'cost', label: 'monthly estimate', val: '$15.60/mo', ctype: 'bad' },
  { type: 'gap' },
  { type: 'cmd',  text: '# rename a variable…' },
  { type: 'out',  text: '⠸ Sending to Claude Opus 4…', cls: 'warn' },
  { type: 'cost', label: 'rename variable', val: '$0.0038', ctype: 'bad' },
  { type: 'gap' },
  { type: 'cmd',  text: '# "explain this error"' },
  { type: 'out',  text: '⠸ Sending to Claude Opus 4…', cls: 'warn' },
  { type: 'cost', label: 'explain error', val: '$0.0051', ctype: 'bad' },
  { type: 'gap' },
  { type: 'out',  text: '■ 3 prompts  ·  $0.0132  ·  Opus for everything', cls: 'red' },
];

const WITH_LINES: TLine[] = [
  { type: 'cmd',  text: 'git commit -m "fix: button color"' },
  { type: 'gap' },
  { type: 'out',  text: '⚡ frugal · TRIVIAL · conf 0.97 · <1ms', cls: 'purple' },
  { type: 'out',  text: '  → T1: claude-haiku-4-5  [25× cheaper]', cls: 'ok' },
  { type: 'out',  text: '  tokens_in:  2,847  out: 31', cls: 'dim' },
  { type: 'gap' },
  { type: 'cost', label: 'this prompt', val: '$0.00017', ctype: 'good' },
  { type: 'cost', label: 'saved vs Opus', val: '−96%', ctype: 'good' },
  { type: 'gap' },
  { type: 'cmd',  text: '# rename a variable…' },
  { type: 'out',  text: '⚡ frugal · T0-inline · conf 0.99 · <1ms', cls: 'purple' },
  { type: 'out',  text: '  → T0: ollama qwen3:30b  [free local 🆓]', cls: 'ok' },
  { type: 'cost', label: 'rename variable', val: '$0.000', ctype: 'good' },
  { type: 'gap' },
  { type: 'cmd',  text: '# "explain this error"' },
  { type: 'out',  text: '⚡ frugal · T1 · conf 0.88 · <1ms', cls: 'purple' },
  { type: 'out',  text: '  → T1: claude-haiku-4-5', cls: 'ok' },
  { type: 'cost', label: 'explain error', val: '$0.00019', ctype: 'good' },
  { type: 'gap' },
  { type: 'bar',  label: 'T0 free', pct: 84, color: '#7c3aed' },
  { type: 'bar',  label: 'T1 Haiku', pct: 10, color: '#06b6d4' },
  { type: 'bar',  label: 'T2 Sonnet', pct: 5, color: '#22c55e' },
  { type: 'bar',  label: 'T3 Opus', pct: 1, color: '#eab308' },
  { type: 'gap' },
  { type: 'out',  text: '■ 3 prompts  ·  $0.00036  ·  84% free  ·  −97%', cls: 'ok' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   ANALYSE RESULT CARD
───────────────────────────────────────────────────────────────────────────── */
function ResultCard({ result }: { result: AnalyseResult }) {
  const tierVals = TIERS.map(t => result.tier_breakdown[t.key] ?? 0);

  const platIcon: Record<string, string> = {
    'Vercel': '▲', 'Netlify': '◆', 'Railway': '🚂', 'GitHub Pages': '⬡',
    'Cloudflare Pages': '☁', 'Fly.io': '✈', 'AWS': '☁', 'Render': '◉',
  };

  return (
    <div className="result-root">

      {/* ── Row 1: Stack + Savings ── */}
      <div className="result-row-2">

        {/* Stack card */}
        <div className="rcard">
          <div className="rcard-title">Stack detected</div>
          <div className="stack-list">
            {[
              { k: 'Platform',  v: result.platform,  extra: platIcon[result.platform] || '⬛' },
              { k: 'Framework', v: result.framework },
              { k: 'Language',  v: result.language  },
            ].map(row => (
              <div key={row.k} className="stack-row">
                <span className="sk">{row.k}</span>
                <span className="sv">{row.extra && <span style={{ marginRight: 6, opacity: 0.7 }}>{row.extra}</span>}{row.v}</span>
              </div>
            ))}
            <div className="stack-row">
              <span className="sk">LLM signals</span>
              <span className="sv">
                {result.llm_detected
                  ? <span className="badge-warn">⚡ {result.llm_signals.length} found</span>
                  : <span className="badge-ok">✓ None</span>}
              </span>
            </div>
            {result.llm_detected && (
              <div className="signal-chips">
                {result.llm_signals.map(s => <span key={s} className="chip-warn">{s}</span>)}
              </div>
            )}
            {result.cached && <div className="cache-hint">⚡ Cached result · &lt;1ms</div>}
          </div>
        </div>

        {/* Savings card */}
        <div className="rcard savings-card">
          <div className="rcard-title">frugal savings estimate</div>
          <div className="sav-big">{result.savings_pct}<span className="sav-pct">%</span></div>
          <div className="sav-sub">cost reduction on your Claude Code bill</div>
          <div className="sav-monthly">
            <span className="sav-m-num">≈ ${result.monthly_savings_usd}</span>
            <span className="sav-m-label">/mo saved</span>
          </div>
          <div className="sav-meta">
            <div className="conf-row">
              <span>Confidence</span>
              <div className="conf-track"><div className="conf-fill" style={{ width: `${result.backtest_confidence}%` }} /></div>
              <span className="conf-num">{result.backtest_confidence}%</span>
            </div>
            <div className="sav-dots">
              <span>📊 {result.backtest_prompts.toLocaleString()} prompts</span>
              <span>·</span>
              <span>👥 {result.community_users}+ devs</span>
              <span>·</span>
              <span>🔄 auto-tuning daily</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Tier breakdown ── */}
      <div className="rcard">
        <div className="rcard-title">Router tier breakdown — how frugal allocates your prompts</div>
        <div className="tier-grid">
          {TIERS.map((t, i) => (
            <div key={t.key} className="tier-item">
              <div className="tier-top">
                <span className="tier-label">{t.label}</span>
                <span className="tier-pct" style={{ color: t.color }}>{tierVals[i]}%</span>
              </div>
              <div className="tier-track">
                <div className="tier-fill" style={{ width: `${tierVals[i]}%`, background: t.color }} />
              </div>
              <div className="tier-model">{t.model}</div>
            </div>
          ))}
        </div>
        <div className="tier-footnote">
          T0 runs free on your local GPU via Ollama. T3 (Opus) is reserved for architecture decisions, final reviews, and multi-file refactors only.
        </div>
      </div>

      {/* ── Row 3: Suggestions + CTA ── */}
      <div className="result-row-2">
        <div className="rcard">
          <div className="rcard-title">Recommended for your stack</div>
          <div className="sug-list">
            {result.suggestions.map((s, i) => (
              <div key={i} className="sug-item">
                <div className={`sug-icon si-${s.type}`}>{SUG_ICON[s.type] || '🔧'}</div>
                <div className="sug-body">
                  <div className="sug-name">{s.name}</div>
                  <div className="sug-reason">{s.reason}</div>
                  {s.savings && <div className="sug-savings">↑ {s.savings}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rcard cta-card">
          <div className="cta-domain">
            {result.url.replace(/^https?:\/\//, '').split('/')[0]}
          </div>
          <div className="cta-headline">
            Save ~${result.monthly_savings_usd}/mo<br />starting today
          </div>
          <div className="cta-body">
            frugal runs locally, never proxies your prompts, and auto-tunes every night from your real usage.
          </div>
          <div className="cta-proof">
            <div className="cta-proof-row">
              <span className="cta-proof-dot" style={{ background: '#22c55e' }} />
              <span>Zero proxy · no latency added</span>
            </div>
            <div className="cta-proof-row">
              <span className="cta-proof-dot" style={{ background: '#7c3aed' }} />
              <span>84% of prompts run 100% free</span>
            </div>
            <div className="cta-proof-row">
              <span className="cta-proof-dot" style={{ background: '#06b6d4' }} />
              <span>If frugal dies, Claude Code still works</span>
            </div>
          </div>
          <button
            type="button" className="btn-cta"
            onClick={() => document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Get early access →
          </button>
        </div>
      </div>

    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   LOADING ANIMATION
───────────────────────────────────────────────────────────────────────────── */
const LOAD_STEPS = [
  'Resolving hostname…',
  'Fetching HTTP headers…',
  'Detecting platform & CDN…',
  'Scanning for framework signals…',
  'Checking for LLM SDK traces…',
  'Computing tier breakdown…',
  'Generating savings projection…',
];

function LoadingView({ step }: { step: number }) {
  return (
    <div className="load-root">
      <div className="load-term">
        <div className="load-bar">
          <span className="tdot r"/><span className="tdot y"/><span className="tdot g"/>
          <span className="load-title">frugal analyser</span>
        </div>
        <div className="load-body">
          {LOAD_STEPS.map((s, i) => (
            <div key={i} className={`load-step ${i < step ? 'done' : i === step - 1 ? 'active' : 'pending'}`}>
              <span className="load-step-icon">
                {i < step ? '✓' : i === step - 1 ? '⠸' : '·'}
              </span>
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN PAGE
───────────────────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [url, setUrl]                 = useState('');
  const [analysing, setAnalysing]     = useState(false);
  const [loadStep, setLoadStep]       = useState(0);
  const [result, setResult]           = useState<AnalyseResult | null>(null);
  const [analyseErr, setAnalyseErr]   = useState<string | null>(null);
  const analyserRef                   = useRef<HTMLElement>(null);

  const [email, setEmail]             = useState('');
  const [wlUrl, setWlUrl]             = useState('');
  const [joining, setJoining]         = useState(false);
  const [joined, setJoined]           = useState(false);
  const [wlErr, setWlErr]             = useState<string | null>(null);
  const [wlCount, setWlCount]         = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/waitlist').then(r => r.json())
      .then(d => { if (typeof d.total === 'number') setWlCount(d.total); })
      .catch(() => {});
  }, []);

  const scrollToAnalyser = useCallback(() => {
    analyserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  async function doAnalyse(e: React.FormEvent) {
    e.preventDefault();
    setAnalyseErr(null); setResult(null); setAnalysing(true); setLoadStep(1);
    LOAD_STEPS.forEach((_, i) => setTimeout(() => setLoadStep(i + 2), 600 * (i + 1)));
    try {
      const res  = await fetch('/api/analyse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      const data = await res.json() as AnalyseResult & { hint?: string };
      if (!res.ok) { setAnalyseErr(data.hint || data.error || 'Something went wrong'); return; }
      setResult(data);
      setWlUrl(url);
    } catch (err) {
      setAnalyseErr(err instanceof Error ? err.message : 'network error');
    } finally { setAnalysing(false); setLoadStep(0); }
  }

  async function doWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setWlErr(null); setJoining(true);
    try {
      const res  = await fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, url: wlUrl || undefined, savings_estimate: result?.savings_pct }) });
      const data = await res.json();
      if (!res.ok) { setWlErr(data.hint || data.error || 'Failed to join waitlist'); return; }
      setJoined(true);
      if (typeof data.total === 'number') setWlCount(data.total);
    } catch (err) {
      setWlErr(err instanceof Error ? err.message : 'network error');
    } finally { setJoining(false); }
  }

  return (
    <>
      {/* ─── NAV ─────────────────────────────────────────────────────────── */}
      <nav className="nav">
        <a href="/" className="nav-logo">frugal<span>.</span></a>
        <div className="nav-links">
          <a href="#demo">Demo</a>
          <a href="#analyse">Analyse</a>
          <a href="#how">How</a>
          <a href="#waitlist" className="nav-cta">Early access</a>
        </div>
      </nav>

      <main>

        {/* ─── HERO ────────────────────────────────────────────────────────── */}
        <section className="hero">
          <div className="wrap">
            <div className="hero-pill">
              <span className="pill-dot" /> Backtest-validated · Auto-tuning · Open source · MIT
            </div>
            <h1 className="hero-h1">Stop burning<br /><span className="grad">Opus tokens</span><br />on groceries.</h1>
            <p className="hero-sub">
              frugal is the Claude Code router that sends trivial tasks to free local models — automatically, in &lt;1ms, with zero proxies.<br />
              <strong>90.2% cost reduction</strong> validated on 1,437 real prompts.
            </p>
            <div className="hero-stats">
              {[
                { n: 90,    suf: '.2%',  label: 'cost saved'        },
                { n: 1437,  suf: '',     label: 'prompts backtested' },
                { n: 84,    suf: '%',    label: 'run free on Ollama' },
                { n: 50,    suf: 'ms',   label: 'classify latency', pre: '<' },
              ].map((s, i) => (
                <div key={i} className="hstat">
                  <div className="hstat-n"><Counter to={s.n} suffix={s.suf} prefix={s.pre} /></div>
                  <div className="hstat-l">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="hero-ctas">
              <button type="button" className="btn-primary" onClick={scrollToAnalyser}>Analyse my project →</button>
              <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener noreferrer" className="btn-ghost">View source</a>
            </div>
            <div className="hero-quote">
              &ldquo;You wouldn&apos;t drive a Ferrari to buy groceries.&rdquo;
            </div>
          </div>
        </section>

        {/* ─── TERMINAL DEMO ───────────────────────────────────────────────── */}
        <section id="demo" className="section demo-section">
          <div className="wrap">
            <div className="section-kicker">Real savings · In your terminal</div>
            <h2 className="section-h2">Watch the router decide — live.</h2>
            <p className="section-sub">
              Every prompt classified in &lt;1ms by a pure regex engine. No LLM in the hot path. <br />
              Trivial tasks route free. Opus is reserved for the 3.6% that genuinely need it.
            </p>
            <div className="demo-grid">
              <div>
                <div className="demo-label bad">WITHOUT frugal</div>
                <TerminalWindow
                  title="VS Code — bash" tag="Opus for everything" tagColor="#ef4444"
                  lines={WITHOUT_LINES}
                  statusItems={[
                    { dot: '#ef4444', label: 'Opus only' },
                    { dot: '#ef4444', label: '$0.52/day' },
                    { dot: '#ef4444', label: '$15.60/mo' },
                    { dot: '#6b6b7e', label: '0% free' },
                  ]}
                />
              </div>
              <div>
                <div className="demo-label good">WITH frugal</div>
                <TerminalWindow
                  title="VS Code — bash + frugal" tag="Routed automatically" tagColor="#22c55e"
                  lines={WITH_LINES}
                  statusItems={[
                    { dot: '#22c55e', label: 'frugal active' },
                    { dot: '#22c55e', label: '$0.054/day' },
                    { dot: '#22c55e', label: '$1.62/mo' },
                    { dot: '#7c3aed', label: '84% free local' },
                  ]}
                />
              </div>
            </div>

            {/* Cost comparison table */}
            <div className="cost-table">
              <div className="cost-table-header">Real cost per prompt type</div>
              <div className="cost-rows">
                {[
                  { task: 'git commit message',   without: '$0.0043', with: '$0.00017', tier: 'T1 Haiku',    save: '−96%' },
                  { task: 'rename variable',       without: '$0.0038', with: '$0.000',  tier: 'T0 Ollama',   save: '−100%' },
                  { task: 'explain this error',    without: '$0.0051', with: '$0.00019',tier: 'T1 Haiku',    save: '−96%' },
                  { task: 'debug race condition',  without: '$0.0062', with: '$0.0018', tier: 'T2 Sonnet',   save: '−71%' },
                  { task: 'redesign auth system',  without: '$0.018',  with: '$0.018',  tier: 'T3 Opus ✓',   save: '0%',  note: 'correctly Opus' },
                ].map((row, i) => (
                  <div key={i} className="cost-row-item">
                    <span className="cr-task">{row.task}</span>
                    <span className="cr-without">{row.without}</span>
                    <span className="cr-arrow">→</span>
                    <span className="cr-with">{row.with}</span>
                    <span className="cr-tier">{row.tier}</span>
                    <span className={`cr-save ${row.save === '0%' ? 'dim' : 'green'}`}>{row.save}</span>
                    {row.note && <span className="cr-note">{row.note}</span>}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ─── URL ANALYSER ────────────────────────────────────────────────── */}
        <section id="analyse" className="section analyse-section" ref={analyserRef as React.RefObject<HTMLElement>}>
          <div className="wrap">
            <div className="section-kicker">Your project · Your numbers</div>
            <h2 className="section-h2">See exactly what frugal saves <em>you</em>.</h2>
            <p className="section-sub">
              Paste any public URL. We detect your platform, framework, LLM signals, and show a breakdown of how your prompts would be routed — with real dollar estimates from backtest data.
            </p>

            <form onSubmit={doAnalyse} className="analyse-form">
              <div className="analyse-input-wrap">
                <span className="analyse-icon">🔍</span>
                <input
                  type="url" required
                  placeholder="https://github.com/you/project  ·  https://yourapp.vercel.app  ·  https://yourdomain.com"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  disabled={analysing}
                  className="analyse-input"
                />
                <button type="submit" className="btn-primary" disabled={analysing || !url} style={{ flexShrink: 0 }}>
                  {analysing ? 'Analysing…' : 'Analyse →'}
                </button>
              </div>
              <div className="analyse-examples">
                Try:&nbsp;
                {['https://vercel.com', 'https://nextjs.org', 'https://railway.app'].map(ex => (
                  <button key={ex} type="button" className="ex-btn" onClick={() => setUrl(ex)}>{ex.replace('https://', '')}</button>
                ))}
              </div>
              {analyseErr && <div className="err-msg">⚠ {analyseErr}</div>}
            </form>

            {analysing && <LoadingView step={loadStep} />}
            {result && <ResultCard result={result} />}

          </div>
        </section>

        {/* ─── HOW IT WORKS ────────────────────────────────────────────────── */}
        <section id="how" className="section">
          <div className="wrap">
            <div className="section-kicker">Under the hood</div>
            <h2 className="section-h2">How frugal routes every prompt.</h2>
            <div className="how-grid">
              {[
                { n: '01', title: 'Classify', desc: 'Pure regex classifier in <1ms. No LLM in the hot path. SHA-256 cache avoids re-classifying identical prompts. Weighted scoring across 6 signal categories.', tag: 'classify.js · 165 lines' },
                { n: '02', title: 'Route',    desc: '4 tiers: T0 Ollama (free local), T1 Haiku (25× cheaper), T2 Sonnet (reasoning), T3 Opus (architecture only). HIGH_RISK patterns always escalate, no exceptions.', tag: 'patterns.js · dual-enforced' },
                { n: '03', title: 'Save',     desc: '84% of prompts route to free local Ollama. 90.2% cost reduction validated on 1,437 real production prompts across 3 projects, zero cherry-picking.', tag: '1,437 prompts · 3 projects' },
                { n: '04', title: 'Learn',    desc: 'Every night at 02:00, a scheduled task replays decisions, finds over-routing, and patches classify.js idempotently. Gets smarter from your own usage.', tag: 'backtest.js · daily @ 02:00' },
              ].map(c => (
                <div key={c.n} className="how-card">
                  <div className="how-n">{c.n}</div>
                  <div className="how-title">{c.title}</div>
                  <div className="how-desc">{c.desc}</div>
                  <div className="how-tag">{c.tag}</div>
                </div>
              ))}
            </div>

            {/* Safety guarantee */}
            <div className="safety-card">
              <div className="safety-header">
                <span className="safety-icon">🔒</span>
                <strong>The safety guarantee</strong>
              </div>
              <div className="safety-body">
                HIGH_RISK patterns are dual-enforced in <code>classify.js</code> and <code>backtest.js</code>. No matter what the auto-tuner learns, these patterns <em>always</em> escalate to Opus:
                <div className="safety-chips">
                  {['git push --force', 'rm -rf', 'drop table', '.env / secrets', 'deploy / migration', 'reset --hard', 'production', 'architecture'].map(p => (
                    <span key={p} className="chip-red">{p}</span>
                  ))}
                </div>
                Zero-blast-radius: if frugal dies, Claude Code falls back to its default behaviour instantly.
              </div>
            </div>

            {/* Statusline preview */}
            <div className="statusline-card">
              <div className="statusline-label">Live statusline — after every Claude Code prompt</div>
              <div className="statusline-preview">
                <span className="sl-seg git">⬆ main·a1b2</span>
                <span className="sl-sep">│</span>
                <span className="sl-seg brand">🐕 frugal v0.9</span>
                <span className="sl-sep">│</span>
                <span className="sl-seg tier">[T1] hku 0.3s</span>
                <span className="sl-sep">│</span>
                <span className="sl-seg dist">qwn <span style={{color:'#7c3aed'}}>84%</span> · hku <span style={{color:'#06b6d4'}}>10%</span> · son <span style={{color:'#22c55e'}}>5%</span> · ops <span style={{color:'#eab308'}}>1%</span></span>
                <span className="sl-sep">│</span>
                <span className="sl-seg savings">💰 $1.21 <span style={{color:'#22c55e'}}>(90%↑)</span> ▓▓▓▓▓▓▓░░░</span>
                <span className="sl-sep">│</span>
                <span className="sl-seg gpu">💻 RTX 4090 ▓▓▓▓░ 61%</span>
                <span className="sl-sep">│</span>
                <span className="sl-seg dots">●●◐○○○</span>
              </div>
              <div className="statusline-legend">
                {['git branch', 'frugal brand', 'last turn tier', 'session distribution', 'savings + budget bar', 'GPU usage', 'provider dots'].map((l, i) => (
                  <span key={i} className="sl-legend-item">{l}</span>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* ─── SOCIAL PROOF ────────────────────────────────────────────────── */}
        <section className="section proof-section">
          <div className="wrap">
            <div className="section-kicker">The numbers</div>
            <h2 className="section-h2">Validated. Not projected.</h2>
            <div className="proof-grid">
              {[
                { n: 90,   suf: '.2%', color: '#22c55e', label: 'Cost saved vs all-Opus', sub: 'Real replay · $12.33 → $1.21 on 1,437 prompts' },
                { n: 84,   suf: '%',   color: '#7c3aed', label: 'Prompts run free on Ollama', sub: '1,150 of 1,370 prompts needed zero API spend' },
                { n: 94,   suf: '%',   color: '#06b6d4', label: 'Backtest confidence', sub: '95% of decisions high-confidence (conf ≥ 0.6)' },
                { n: 1,    suf: 'ms',  color: '#f97316', label: 'Classify latency', pre: '<', sub: 'Pure regex, no LLM, SHA-256 cache, zero blocking' },
                { n: 10,   suf: 'min', color: '#eab308', label: 'To tune from your data', sub: 'Run replay.js on your own Claude Code history' },
                { n: 59,   suf: '/59', color: '#22c55e', label: 'Tests passing',    sub: 'node:test · zero external frameworks' },
              ].map((p, i) => (
                <div key={i} className="proof-card">
                  <div className="proof-n" style={{ color: p.color }}>
                    <Counter to={p.n} suffix={p.suf} prefix={p.pre} />
                  </div>
                  <div className="proof-label">{p.label}</div>
                  <div className="proof-sub">{p.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── WAITLIST ────────────────────────────────────────────────────── */}
        <section id="waitlist" className="section wl-section">
          <div className="wrap wl-wrap">
            <div className="section-kicker">Early access</div>
            <h2 className="section-h2">Get frugal before the public launch.</h2>
            <p className="section-sub">
              Installer · VS Code extension · Community backtest data · Plugin marketplace (roadmap).<br />
              Free and open source forever. MIT license.
            </p>

            {joined ? (
              <div className="wl-success">
                <div className="wl-check">✓</div>
                <div className="wl-success-msg">You&apos;re on the list.</div>
                {wlCount !== null && <div className="wl-count">Developer #{wlCount} · we&apos;ll be in touch.</div>}
              </div>
            ) : (
              <form onSubmit={doWaitlist} className="wl-form">
                <input type="email" required placeholder="your@email.com"
                  value={email} onChange={e => setEmail(e.target.value)} disabled={joining} className="wl-input" />
                <input type="url" placeholder="Your project URL (optional — we'll pre-calculate savings)"
                  value={wlUrl} onChange={e => setWlUrl(e.target.value)} disabled={joining} className="wl-input" />
                <button type="submit" className="btn-primary btn-full" disabled={joining || !email}>
                  {joining ? 'Joining…' : 'Get early access →'}
                </button>
                {wlErr && <div className="err-msg">⚠ {wlErr}</div>}
                <div className="wl-counter">
                  {wlCount !== null
                    ? `${wlCount} developer${wlCount === 1 ? '' : 's'} already on the list`
                    : 'MIT · Local-first · No proxy · Open source'}
                </div>
              </form>
            )}

            <div className="wl-features">
              {[
                { icon: '⚡', title: 'One-command install',  desc: 'bash install.sh — no ports, no daemons, no config' },
                { icon: '🔒', title: 'Zero proxy',           desc: 'frugal runs locally. Your prompts never leave your machine' },
                { icon: '🔄', title: 'Auto-tuning',          desc: 'Daily backtest tunes the router from your own usage' },
                { icon: '🌐', title: 'Federated learning',   desc: 'Community patterns improve everyone (roadmap)' },
              ].map((f, i) => (
                <div key={i} className="wl-feat">
                  <span className="wl-feat-icon">{f.icon}</span>
                  <div>
                    <div className="wl-feat-title">{f.title}</div>
                    <div className="wl-feat-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

      </main>

      {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="footer">
        <div>frugal · MIT License · Made by Paulo Loureiro</div>
        <div className="footer-links">
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="#analyse">Analyse project</a>
          <a href="#waitlist">Early access</a>
        </div>
      </footer>
    </>
  );
}
