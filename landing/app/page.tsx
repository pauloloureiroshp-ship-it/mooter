'use client';

/**
 * page.tsx — frugal landing v0.9.1.
 *
 * Single-page public landing. Sections:
 *   1. Hero
 *   2. URL Analyser (POST /api/analyse)
 *   3. How it works (3 steps)
 *   4. Waitlist form (POST /api/waitlist)
 *   5. Footer
 *
 * All state is client-side. API routes are called from the browser via
 * same-origin fetch. No third-party trackers.
 */

import { useEffect, useRef, useState } from 'react';

type AnalyseResult = {
  url: string;
  platform: string;
  framework: string;
  llm_detected: boolean;
  savings_pct: number;
  cached: boolean;
  error?: string;
};

export default function LandingPage() {
  const [url, setUrl] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<AnalyseResult | null>(null);
  const [analyseError, setAnalyseError] = useState<string | null>(null);
  const analyserRef = useRef<HTMLElement>(null);

  const [email, setEmail] = useState('');
  const [waitlistUrl, setWaitlistUrl] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  // Fetch the live waitlist counter on mount (cheap HEAD request).
  useEffect(() => {
    fetch('/api/waitlist')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.total === 'number') setWaitlistCount(data.total);
      })
      .catch(() => { /* fail silently — counter is non-critical */ });
  }, []);

  function scrollToAnalyser() {
    analyserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitAnalyse(e: React.FormEvent) {
    e.preventDefault();
    setAnalyseError(null);
    setResult(null);
    setAnalysing(true);
    try {
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as AnalyseResult & { error?: string; hint?: string };
      if (!res.ok) {
        setAnalyseError(data.hint || data.error || 'Something went wrong');
        return;
      }
      setResult(data);
      // Pre-fill the waitlist URL with whatever the user just analysed.
      setWaitlistUrl(url);
    } catch (err) {
      setAnalyseError(err instanceof Error ? err.message : 'network error');
    } finally {
      setAnalysing(false);
    }
  }

  async function submitWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setWaitlistError(null);
    setJoining(true);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          url: waitlistUrl || undefined,
          savings_estimate: result?.savings_pct,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWaitlistError(data.hint || data.error || 'Failed to join waitlist');
        return;
      }
      setJoined(true);
      if (typeof data.total === 'number') setWaitlistCount(data.total);
    } catch (err) {
      setWaitlistError(err instanceof Error ? err.message : 'network error');
    } finally {
      setJoining(false);
    }
  }

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="hero" style={{ border: 'none' }}>
        <h1>frugal</h1>
        <div className="tagline">Route smarter. Spend less.</div>
        <div className="sub">
          <strong>~90% cost savings</strong> on Claude Code prompts
        </div>
        <button type="button" className="btn btn-primary" onClick={scrollToAnalyser}>
          Analyse my project →
        </button>
      </section>

      {/* ── URL Analyser ─────────────────────────────────────────────── */}
      <section ref={analyserRef}>
        <h2>Paste your project URL</h2>
        <div className="analyser">
          <form onSubmit={submitAnalyse}>
            <label htmlFor="url-input">URL</label>
            <div className="analyser-form">
              <input
                id="url-input"
                type="url"
                required
                placeholder="https://github.com/... or https://yourapp.vercel.app"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={analysing}
              />
              <button type="submit" className="btn btn-primary" disabled={analysing || !url}>
                {analysing ? 'Analysing…' : 'Analyse →'}
              </button>
            </div>
            {analyseError && <div className="error-text">{analyseError}</div>}
          </form>

          {analysing && <div className="loading">Detecting stack…</div>}

          {result && (
            <div className="result">
              <div className="result-row">
                <span className="result-label">Platform</span>
                <span className="result-value">{result.platform}</span>
              </div>
              <div className="result-row">
                <span className="result-label">Framework</span>
                <span className="result-value">{result.framework}</span>
              </div>
              <div className="result-row">
                <span className="result-label">LLM usage</span>
                <span className={`result-value ${result.llm_detected ? 'yes' : 'no'}`}>
                  {result.llm_detected ? 'Detected' : 'Not detected'}
                </span>
              </div>
              {result.cached && (
                <div className="result-row">
                  <span className="result-label">Cache</span>
                  <span className="result-value" style={{ color: 'var(--fg-dim)' }}>hit</span>
                </div>
              )}
              {result.error === 'unreachable' && (
                <div className="error-text">
                  Couldn&apos;t fetch the URL — showing fallback data. Platform/framework
                  detection may be incomplete.
                </div>
              )}

              <div className="savings-bar">
                <div className="savings-bar-label">Estimated savings with frugal</div>
                <div className="savings-bar-value">{result.savings_pct}%</div>
                <div className="savings-bar-fill">
                  <div style={{ width: `${result.savings_pct}%` }} />
                </div>
                <div className="savings-bar-caption">
                  Based on 1,437 real prompts from frugal&apos;s production dogfood. Actual savings
                  depend on your prompt mix.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section>
        <h2>How it works</h2>
        <div className="steps">
          <div className="step">
            <div className="step-number">01</div>
            <div className="step-title">Classify</div>
            <div className="step-desc">
              Every prompt classified in under 50ms. Pure regex, no LLM in the hot path.
            </div>
          </div>
          <div className="step">
            <div className="step-number">02</div>
            <div className="step-title">Route</div>
            <div className="step-desc">
              Cheap models (Ollama/Haiku) for trivial tasks. Opus only when complexity
              truly warrants it.
            </div>
          </div>
          <div className="step">
            <div className="step-number">03</div>
            <div className="step-title">Save</div>
            <div className="step-desc">
              ~90% cost reduction validated on real workloads. Zero quality loss on the
              tasks that matter.
            </div>
          </div>
        </div>
      </section>

      {/* ── Waitlist ─────────────────────────────────────────────────── */}
      <section>
        <h2>Get early access</h2>
        <div className="waitlist">
          {joined ? (
            <>
              <div className="waitlist-success">✓ You&apos;re on the list.</div>
              <div className="waitlist-counter">
                {waitlistCount !== null
                  ? `You are developer #${waitlistCount} on the waitlist.`
                  : "We'll be in touch."}
              </div>
            </>
          ) : (
            <form onSubmit={submitWaitlist}>
              <div className="waitlist-form">
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={joining}
                />
                <input
                  type="url"
                  placeholder="Project URL (optional)"
                  value={waitlistUrl}
                  onChange={(e) => setWaitlistUrl(e.target.value)}
                  disabled={joining}
                />
                <button type="submit" className="btn btn-primary" disabled={joining || !email}>
                  {joining ? 'Joining…' : 'Get early access'}
                </button>
              </div>
              {waitlistError && <div className="error-text">{waitlistError}</div>}
              <div className="waitlist-counter">
                {waitlistCount !== null
                  ? `Join ${waitlistCount} developer${waitlistCount === 1 ? '' : 's'} saving on Claude Code`
                  : 'Save on Claude Code costs'}
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer>
        frugal · MIT License ·{' '}
        <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </footer>
    </main>
  );
}
