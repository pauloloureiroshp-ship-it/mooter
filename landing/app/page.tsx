'use client';

import { useEffect, useRef, useState } from 'react';

type TierBreakdown = { t0_pct: number; t1_pct: number; t2_pct: number; t3_pct: number };
type Suggestion = { type: string; name: string; reason: string; savings?: string };

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
  backtest_prompts: number;
  community_users: number;
  cached: boolean;
  error?: string;
};

const TIER_COLORS = ['#7c3aed', '#06b6d4', '#22c55e', '#eab308'];
const TIER_LABELS = [
  { label: 'T0 — Ollama local', model: 'qwen3:30b' },
  { label: 'T1 — Claude Haiku', model: '25× cheaper than Opus' },
  { label: 'T2 — Claude Sonnet', model: 'reasoning tasks' },
  { label: 'T3 — Claude Opus', model: 'architecture only' },
];
const SUG_ICONS: Record<string, string> = {
  llm: '🤖', connector: '🔌', skill: '✨', cli: '⚡', tool: '🔬',
};

// ── Terminal line helpers ─────────────────────────────────────────────────────
function TLine({ prompt = '❯', pClass = '', cmd }: { prompt?: string; pClass?: string; cmd: string }) {
  return (
    <div className="t-line">
      <span className={`t-prompt${pClass ? ' ' + pClass : ''}`}>{prompt}</span>
      <span className="t-cmd">{cmd}</span>
    </div>
  );
}
function TOut({ text, cls = 'fg' }: { text: string; cls?: string }) {
  return <div className={`t-out ${cls}`}>{text}</div>;
}
function TSpacer() { return <div className="t-spacer" />; }

function CostRow({ label, val, type }: { label: string; val: string; type: 'bad' | 'good' | 'dim' }) {
  return (
    <div className={`cost-row ${type === 'dim' ? '' : type}`}>
      <span className="cost-label">{label}</span>
      <span className={`cost-val ${type}`}>{val}</span>
    </div>
  );
}

function TierBarRow({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="t-tier-row">
      <span className="t-tier-label">{label}</span>
      <div className="t-tier-bar">
        <div className="t-tier-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="t-tier-pct" style={{ color }}>{pct}%</span>
    </div>
  );
}

// ── Terminal Without frugal ───────────────────────────────────────────────────
function TerminalWithout() {
  return (
    <div className="terminal-window">
      <div className="terminal-titlebar">
        <span className="tdot r" /><span className="tdot y" /><span className="tdot g" />
        <span className="t-title">VS Code Terminal — bash</span>
        <span className="t-tag"><span className="badge badge-orange">WITHOUT frugal</span></span>
      </div>
      <div className="terminal-body">
        <TLine cmd="git commit -m 'fix button color'" />
        <TSpacer />
        <TOut text="⠸ Routing to Claude Opus 4..." cls="warn" />
        <TOut text="  model: claude-opus-4" cls="dim" />
        <TOut text="  tokens_in:  2,847" cls="dim" />
        <TOut text="  tokens_out:    34" cls="dim" />
        <TSpacer />
        <CostRow label="this prompt" val="$0.0043" type="bad" />
        <CostRow label="estimated/day (avg 120 prompts)" val="$0.52" type="bad" />
        <CostRow label="estimated/month" val="$15.60" type="bad" />
        <TSpacer />
        <TLine cmd="# asking claude to rename a variable..." />
        <TOut text="⠸ Routing to Claude Opus 4..." cls="warn" />
        <TSpacer />
        <CostRow label="rename variable prompt" val="$0.0038" type="bad" />
        <TSpacer />
        <TLine cmd="# asking claude to explain an error..." />
        <TOut text="⠸ Routing to Claude Opus 4..." cls="warn" />
        <TSpacer />
        <CostRow label="explain error prompt" val="$0.0051" type="bad" />
        <TSpacer />
        <TOut text="▓ 3 prompts · $0.013 · ~Opus for everything" cls="red" />
      </div>
      <div className="t-statusbar">
        <div className="t-status-item"><span className="t-sdot" style={{ background: '#ef4444' }} />Opus only</div>
        <div className="t-status-item">$0.52/day</div>
        <div className="t-status-item">$15.60/mo</div>
        <div className="t-status-item" style={{ marginLeft: 'auto' }}>0% local</div>
      </div>
    </div>
  );
}

// ── Terminal With frugal ──────────────────────────────────────────────────────
function TerminalWith() {
  return (
    <div className="terminal-window with-frugal">
      <div className="terminal-titlebar">
        <span className="tdot r" /><span className="tdot y" /><span className="tdot g" />
        <span className="t-title">VS Code Terminal — bash + frugal</span>
        <span className="t-tag"><span className="badge badge-green">WITH frugal</span></span>
      </div>
      <div className="terminal-body">
        <TLine cmd="git commit -m 'fix button color'" />
        <TSpacer />
        <TOut text="⚡ frugal classify: TRIVIAL (conf 0.97)" cls="purple" />
        <TOut text="  → T1: claude-haiku-4-5  [25× cheaper]" cls="ok" />
        <TOut text="  tokens_in:  2,847  tokens_out:    31" cls="dim" />
        <TSpacer />
        <CostRow label="this prompt" val="$0.00017" type="good" />
        <CostRow label="saved vs Opus" val="−96%" type="good" />
        <TSpacer />
        <TLine cmd="# rename a variable..." />
        <TOut text="⚡ frugal classify: T0-inline (conf 0.99)" cls="purple" />
        <TOut text="  → T0: ollama qwen3:30b  [free local]" cls="ok" />
        <CostRow label="rename variable prompt" val="$0.000" type="good" />
        <TSpacer />
        <TLine cmd="# explain an error..." />
        <TOut text="⚡ frugal classify: T1 (conf 0.88)" cls="purple" />
        <TOut text="  → T1: claude-haiku-4-5" cls="ok" />
        <CostRow label="explain error prompt" val="$0.00019" type="good" />
        <TSpacer />
        <TierBarRow label="T0 free local" pct={41} color="#7c3aed" />
        <TierBarRow label="T1 Haiku" pct={31} color="#06b6d4" />
        <TierBarRow label="T2 Sonnet" pct={21} color="#22c55e" />
        <TierBarRow label="T3 Opus" pct={7} color="#eab308" />
        <TSpacer />
        <TOut text="▓ 3 prompts · $0.00036 · 41% free · −97% cost" cls="ok" />
      </div>
      <div className="t-statusbar">
        <div className="t-status-item"><span className="t-sdot" style={{ background: '#22c55e' }} />frugal active</div>
        <div className="t-status-item" style={{ color: '#22c55e' }}>$0.054/day</div>
        <div className="t-status-item" style={{ color: '#22c55e' }}>$1.62/mo</div>
        <div className="t-status-item" style={{ marginLeft: 'auto', color: '#7c3aed' }}>41% local · −89% cost</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [url, setUrl] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const analyserRef = useRef<HTMLElement>(null);

  const [email, setEmail] = useState('');
  const [waitlistUrl, setWaitlistUrl] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/waitlist').then(r => r.json()).then(d => {
      if (typeof d.total === 'number') setWaitlistCount(d.total);
    }).catch(() => {});
  }, []);

  function scrollToAnalyser() {
    analyserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitAnalyse(e: React.FormEvent) {
    e.preventDefault();
    setAnalyseError(null); setResult(null); setAnalysing(true); setLoadingStep(1);
    const steps = [1000, 1800, 2400];
    steps.forEach((ms, i) => setTimeout(() => setLoadingStep(i + 2), ms));
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json() as AnalyseResult & { error?: string; hint?: string };
      if (!res.ok) { setAnalyseError(data.hint || data.error || 'Something went wrong'); return; }
      setResult(data);
      setWaitlistUrl(url);
    } catch (err) {
      setAnalyseError(err instanceof Error ? err.message : 'network error');
    } finally {
      setAnalysing(false); setLoadingStep(0);
    }
  }

  async function submitWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setWaitlistError(null); setJoining(true);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, url: waitlistUrl || undefined, savings_estimate: result?.savings_pct }),
      });
      const data = await res.json();
      if (!res.ok) { setWaitlistError(data.hint || data.error || 'Failed to join waitlist'); return; }
      setJoined(true);
      if (typeof data.total === 'number') setWaitlistCount(data.total);
    } catch (err) {
      setWaitlistError(err instanceof Error ? err.message : 'network error');
    } finally { setJoining(false); }
  }

  const tierPcts = result ? [
    result.tier_breakdown.t0_pct,
    result.tier_breakdown.t1_pct,
    result.tier_breakdown.t2_pct,
    result.tier_breakdown.t3_pct,
  ] : [];

  return (
    <>
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav>
        <div className="nav-brand">frugal<span>.</span></div>
        <div className="nav-links">
          <a href="#demo">Demo</a>
          <a href="#analyse">Analyse</a>
          <a href="#how">How it works</a>
          <a href="#waitlist">
            <button type="button" className="btn btn-primary" style={{ padding: '7px 16px', fontSize: '13px' }}>
              Early access
            </button>
          </a>
        </div>
      </nav>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="hero" style={{ border: 'none' }}>
          <div className="container">
            <div className="hero-eyebrow">
              <span className="dot" /> Live · Backtest-validated · Auto-learning
            </div>
            <h1>frugal</h1>
            <div className="hero-tagline">
              Route smarter. <strong>Spend less.</strong>
            </div>
            <div className="hero-tagline" style={{ fontSize: '16px', marginTop: '-8px' }}>
              The intelligent LLM router for Claude Code — <strong>~90% cost savings</strong>, zero quality loss.
            </div>

            <div className="hero-stats">
              <div className="hero-stat">
                <div className="hero-stat-num"><span>89</span>%</div>
                <div className="hero-stat-label">avg cost saved</div>
              </div>
              <div className="hero-divider" />
              <div className="hero-stat">
                <div className="hero-stat-num">1<span>,</span>437</div>
                <div className="hero-stat-label">prompts backtested</div>
              </div>
              <div className="hero-divider" />
              <div className="hero-stat">
                <div className="hero-stat-num">&lt;<span>50</span>ms</div>
                <div className="hero-stat-label">classify latency</div>
              </div>
              <div className="hero-divider" />
              <div className="hero-stat">
                <div className="hero-stat-num"><span>0</span></div>
                <div className="hero-stat-label">proxy / no MITM</div>
              </div>
            </div>

            <div className="hero-cta">
              <button type="button" className="btn btn-primary" onClick={scrollToAnalyser}>
                Analyse my project →
              </button>
              <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener noreferrer">
                <button type="button" className="btn btn-ghost">View on GitHub</button>
              </a>
            </div>
          </div>
        </section>

        {/* ── Terminal Demo ──────────────────────────────────────────────── */}
        <section id="demo" className="terminal-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="container">
            <h2>Real savings. In your terminal.</h2>
            <div className="section-subtitle">
              Every prompt classified in &lt;50ms. The right model, every time — automatically.
            </div>
            <div className="terminal-compare">
              <TerminalWithout />
              <TerminalWith />
            </div>

            <div className="proof-grid" style={{ marginTop: '40px' }}>
              <div className="proof-card">
                <div className="proof-num" style={{ color: '#7c3aed' }}>41%</div>
                <div className="proof-label">of prompts run free on local Ollama</div>
                <div className="proof-sub">qwen3:30b · zero API cost · no internet</div>
              </div>
              <div className="proof-card">
                <div className="proof-num" style={{ color: '#06b6d4' }}>$1.62<span style={{ fontSize: '24px' }}>/mo</span></div>
                <div className="proof-label">average with frugal vs $15.60 without</div>
                <div className="proof-sub">based on 120 prompts/day · real backtest</div>
              </div>
              <div className="proof-card">
                <div className="proof-num" style={{ color: '#22c55e' }}>94%</div>
                <div className="proof-label">backtest confidence score</div>
                <div className="proof-sub">validated on 1,437 real prompts from production dogfood</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── URL Analyser ───────────────────────────────────────────────── */}
        <section id="analyse" className="analyser-section" ref={analyserRef as React.RefObject<HTMLElement>}>
          <div className="container">
            <h2>Analyse your project</h2>
            <div className="section-subtitle">
              Paste any public URL — we detect your stack and show exactly where frugal saves you money.
            </div>

            <form onSubmit={submitAnalyse}>
              <div className="analyser-input-row">
                <input
                  type="url" required
                  placeholder="https://github.com/you/project  or  https://yourapp.vercel.app"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  disabled={analysing}
                />
                <button type="submit" className="btn btn-primary" disabled={analysing || !url}>
                  {analysing ? 'Analysing…' : 'Analyse →'}
                </button>
              </div>
              {analyseError && <div className="error-text">⚠ {analyseError}</div>}
            </form>

            {analysing && (
              <div className="analyse-loading">
                <div className="spinner" />
                <div className="loading-steps">
                  {[
                    'Fetching URL headers…',
                    'Detecting platform & framework…',
                    'Scanning for LLM signals…',
                    'Computing savings projection…',
                  ].map((step, i) => (
                    <div key={i} className={
                      `loading-step ${loadingStep > i + 1 ? 'done' : loadingStep === i + 1 ? 'active' : ''}`
                    }>{step}</div>
                  ))}
                </div>
              </div>
            )}

            {result && (
              <div className="result-grid">

                {/* Stack detection */}
                <div className="result-card">
                  <div className="result-card-title">Stack detected</div>
                  <div className="stack-rows">
                    <div className="stack-row">
                      <span className="stack-key">Platform</span>
                      <span className="stack-val">
                        <span className="badge badge-cyan">{result.platform}</span>
                      </span>
                    </div>
                    <div className="stack-row">
                      <span className="stack-key">Framework</span>
                      <span className="stack-val">
                        <span className="badge badge-purple">{result.framework}</span>
                      </span>
                    </div>
                    <div className="stack-row">
                      <span className="stack-key">Language</span>
                      <span className="stack-val">{result.language}</span>
                    </div>
                    <div className="stack-row">
                      <span className="stack-key">LLM usage</span>
                      <span className="stack-val">
                        <span className={`badge ${result.llm_detected ? 'badge-orange' : 'badge-green'}`}>
                          {result.llm_detected ? `⚡ Detected (${result.llm_signals.length} signal${result.llm_signals.length !== 1 ? 's' : ''})` : '✓ None detected'}
                        </span>
                      </span>
                    </div>
                    {result.llm_detected && result.llm_signals.length > 0 && (
                      <div className="stack-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                        <span className="stack-key">Signals found</span>
                        <div className="signal-chips">
                          {result.llm_signals.map(s => (
                            <span key={s} className="signal-chip">⚡ {s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.cached && (
                      <div className="stack-row">
                        <span className="stack-key">Source</span>
                        <span className="stack-val" style={{ color: 'var(--fg-dim)', fontSize: 12 }}>cached · &lt;1ms</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Savings */}
                <div className="savings-hero">
                  <div>
                    <div className="savings-big">{result.savings_pct}%</div>
                    <div className="savings-label">estimated cost savings with frugal</div>
                  </div>
                  <div>
                    <div className="savings-monthly">≈ ${result.monthly_savings_usd}/mo saved</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 4 }}>
                      at $50/mo baseline spend (120 prompts/day)
                    </div>
                  </div>
                  <div className="savings-meta">
                    <div className="conf-row">
                      <span>Backtest confidence:</span>
                      <div className="conf-bar"><div className="conf-fill" style={{ width: `${result.backtest_confidence}%` }} /></div>
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>{result.backtest_confidence}%</span>
                    </div>
                    <span>·</span>
                    <span>{result.backtest_prompts.toLocaleString()} prompts</span>
                    <span>·</span>
                    <span>{result.community_users}+ community users</span>
                  </div>
                </div>

                {/* Tier breakdown */}
                <div className="result-card">
                  <div className="result-card-title">Router tier breakdown</div>
                  <div className="tier-rows">
                    {TIER_LABELS.map((t, i) => (
                      <div key={i} className="tier-row">
                        <div className="tier-label-row">
                          <span className="tier-name">{t.label}</span>
                          <span className="tier-pct" style={{ color: TIER_COLORS[i] }}>{tierPcts[i]}%</span>
                        </div>
                        <div className="tier-bar">
                          <div className="tier-bar-fill" style={{ width: `${tierPcts[i]}%`, background: TIER_COLORS[i] }} />
                        </div>
                        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 1 }}>{t.model}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Suggestions */}
                <div className="result-card">
                  <div className="result-card-title">Recommended for your stack</div>
                  <div className="suggestions-list">
                    {result.suggestions.map((s, i) => (
                      <div key={i} className="suggestion-item">
                        <div className={`sug-icon ${s.type}`}>{SUG_ICONS[s.type] || '🔧'}</div>
                        <div>
                          <div className="sug-name">{s.name}</div>
                          <div className="sug-reason">{s.reason}</div>
                          {s.savings && <div className="sug-savings">↑ {s.savings}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA after analysis */}
                <div className="result-card full" style={{ textAlign: 'center', background: 'linear-gradient(135deg, var(--surface) 0%, rgba(124,58,237,0.06) 100%)', borderColor: 'rgba(124,58,237,0.2)' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                    Save ~${result.monthly_savings_usd}/mo on <em style={{ fontStyle: 'normal', color: 'var(--brand)' }}>{result.url.replace(/^https?:\/\//, '').split('/')[0]}</em>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--fg-dim)', marginBottom: 20 }}>
                    frugal runs locally, never proxies your prompts, and auto-improves via community backtest data.
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => {
                    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}>
                    Get early access →
                  </button>
                </div>

              </div>
            )}
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section id="how">
          <div className="container">
            <h2 style={{ marginBottom: 8 }}>How it works</h2>
            <div className="section-subtitle">Four tiers. Automatic. Zero config after install.</div>
            <div className="how-grid">
              {[
                { n: '01', title: 'Classify', desc: 'Every prompt classified in <50ms via pure regex. No LLM in the hot path, no latency, no cost.', tag: 'classify.js · weighted scoring' },
                { n: '02', title: 'Route', desc: 'Trivial tasks (rename, format, commit msg) → Ollama free local or Haiku. Opus only for architecture decisions.', tag: 'T0 → T3 · 4 tiers' },
                { n: '03', title: 'Save', desc: '~89% cost reduction validated on 1,437 real prompts. No quality loss on tasks that actually need intelligence.', tag: '89% savings · 94% confidence' },
                { n: '04', title: 'Learn', desc: 'Daily backtest at 02:00 auto-tunes the router from your real usage. Community deltas improve everyone.', tag: 'backtest.js · daily auto-tune' },
              ].map(c => (
                <div key={c.n} className="how-card">
                  <div className="how-number">STEP {c.n}</div>
                  <div className="how-title">{c.title}</div>
                  <div className="how-desc">{c.desc}</div>
                  <div className="how-tag">{c.tag}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Waitlist ──────────────────────────────────────────────────── */}
        <section id="waitlist" className="waitlist-section">
          <div className="container">
            <div className="hero-eyebrow" style={{ justifyContent: 'center', display: 'inline-flex' }}>
              <span className="dot" /> MIT · Local · Private · No proxy
            </div>
            <h2>Get early access</h2>
            <div className="waitlist-sub">
              frugal is free and open source. Join the waitlist for the installer, the VS Code extension, and community backtest data.
            </div>

            {joined ? (
              <div style={{ textAlign: 'center' }}>
                <div className="waitlist-success">✓ You&apos;re on the list.</div>
                <div className="waitlist-counter">
                  {waitlistCount !== null ? `Developer #${waitlistCount} · we'll be in touch.` : "We'll be in touch."}
                </div>
              </div>
            ) : (
              <form onSubmit={submitWaitlist}>
                <div className="waitlist-form-inner">
                  <input
                    type="email" required
                    placeholder="your@email.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled={joining}
                  />
                  <input
                    type="url"
                    placeholder="Project URL (optional — we'll pre-calculate your savings)"
                    value={waitlistUrl}
                    onChange={e => setWaitlistUrl(e.target.value)}
                    disabled={joining}
                  />
                  <button type="submit" className="btn btn-primary" disabled={joining || !email} style={{ width: '100%', justifyContent: 'center' }}>
                    {joining ? 'Joining…' : 'Get early access →'}
                  </button>
                  {waitlistError && <div className="error-text">⚠ {waitlistError}</div>}
                  <div className="waitlist-counter">
                    {waitlistCount !== null
                      ? `Join ${waitlistCount} developer${waitlistCount === 1 ? '' : 's'} already saving on Claude Code`
                      : 'Free & open source · MIT license'}
                  </div>
                </div>
              </form>
            )}
          </div>
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer>
        <div>frugal · MIT License · Made by Paulo Loureiro</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="#analyse">Analyse my project</a>
          <a href="#waitlist">Early access</a>
        </div>
      </footer>
    </>
  );
}
