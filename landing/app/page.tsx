'use client';

import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ────────────────────────────────────────────────────────────────────────────
 * ErrorBoundary — catches render errors so the page never fully crashes
 * ──────────────────────────────────────────────────────────────────────────── */

class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    if (typeof console !== 'undefined') {
      console.warn('[ErrorBoundary]', this.props.label, error?.message);
    }
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * useInView — fade-in on scroll
 * ──────────────────────────────────────────────────────────────────────────── */

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

function FadeIn({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { ref, visible } = useInView();
  return (
    <div ref={ref} className={`fade-in ${visible ? 'visible' : ''} ${className}`}>
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
 * LLM Logos — simple brand-coloured SVG icons
 * ──────────────────────────────────────────────────────────────────────────── */

function ClaudeLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Claude">
      <circle cx="12" cy="12" r="10" fill="#CC785C" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">A</text>
    </svg>
  );
}

function OllamaLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Ollama">
      <rect width="24" height="24" rx="6" fill="#1a1a1a" stroke="#444" strokeWidth="1" />
      <circle cx="9" cy="10" r="2.5" fill="white" />
      <circle cx="15" cy="10" r="2.5" fill="white" />
      <path d="M8 16 Q12 19 16 16" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function OpenAILogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="OpenAI">
      <circle cx="12" cy="12" r="10" fill="#000" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">⬡</text>
    </svg>
  );
}

function GeminiLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Gemini">
      <circle cx="12" cy="12" r="10" fill="#4285F4" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">G</text>
    </svg>
  );
}

function MistralLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Mistral">
      <rect width="24" height="24" rx="6" fill="#FF7000" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">M</text>
    </svg>
  );
}

function GrokLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-label="Grok">
      <rect width="24" height="24" rx="6" fill="#000" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">𝕏</text>
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S1: NAV — minimal, sticky
 * ──────────────────────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <nav className="nav">
      <div className="container nav-row">
        <a href="#top" onClick={scrollTo('top')} className="brand">
          <span className="brand-shiba">🐕</span> frugal
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollTo('how')}>How it works</a>
          <a href="#proof" onClick={scrollTo('proof')}>Proof</a>
          <a href="#community" onClick={scrollTo('community')}>Community</a>
        </div>
        <a href="#access" onClick={scrollTo('access')} className="btn btn-primary btn-sm">
          Early access
        </a>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S2: HERO — the problem in 3 lines
 * ──────────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="top" className="hero">
      <div className="container narrow hero-inner">
        <h1 className="hero-h1">
          Your AI bill is Opus-sized.
          <br />
          Your prompts aren&rsquo;t.
        </h1>

        <p className="hero-sub">
          frugal routes Claude Code prompts to the cheapest model that can handle them.
          83% go free. You only pay Opus when you actually need Opus.
        </p>

        <a href="#access" onClick={scrollTo('access')} className="btn btn-primary hero-cta">
          Get early access →
        </a>

        <div className="hero-metrics">
          <div className="hero-metric" title="Validated on real developer prompts">
            <span className="hero-metric-val">90%</span>
            <span className="hero-metric-label">savings</span>
          </div>
          <div className="hero-metric" title="Pure regex, no LLM call to classify">
            <span className="hero-metric-val">&lt;50ms</span>
            <span className="hero-metric-label">routing</span>
          </div>
          <div className="hero-metric" title="No proxy, no cloud, no port">
            <span className="hero-metric-val">100%</span>
            <span className="hero-metric-label">local</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S3: THE PROBLEM — vibe coder story in 3 moments
 * ──────────────────────────────────────────────────────────────────────────── */

function TheProblem() {
  return (
    <section className="section">
      <div className="container">
        <FadeIn>
          <h2 className="section-h2">Sound familiar?</h2>
        </FadeIn>

        <div className="problem-grid">
          <FadeIn className="problem-card">
            <div className="problem-icon">🔥</div>
            <div className="problem-title">You&rsquo;re building something real</div>
            <p className="problem-body">
              You use Claude Code 8 hours a day. It&rsquo;s your pair programmer.
            </p>
          </FadeIn>

          <FadeIn className="problem-card">
            <div className="problem-icon">💸</div>
            <div className="problem-title">Then the bill lands</div>
            <p className="problem-body">
              $47 this week. Most of it: commit messages, file reads, rename operations.
            </p>
          </FadeIn>

          <FadeIn className="problem-card">
            <div className="problem-icon">😤</div>
            <div className="problem-title">You have an RTX 4090 sitting idle</div>
            <p className="problem-body">
              A GPU that could run a 30B model free. But every prompt still goes to Opus.
            </p>
          </FadeIn>
        </div>

        <FadeIn>
          <p className="problem-foot">
            frugal fixes this. It&rsquo;s not a subscription to another AI. It&rsquo;s a router
            that stops wasting the one you already have.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S4: HOW IT WORKS — Architecture diagram + Demo
 * ──────────────────────────────────────────────────────────────────────────── */

function HowItWorks() {
  return (
    <section id="how" className="section section-alt">
      <div className="container">
        {/* 4A: Architecture diagram */}
        <FadeIn>
          <h2 className="section-h2">How frugal decides</h2>
        </FadeIn>

        <FadeIn>
          <div className="arch-diagram">
            <div className="arch-input">
              <div className="arch-label">Your prompt</div>
            </div>

            <div className="arch-arrow">▼</div>

            <div className="arch-classifier">
              <span className="arch-shiba">🐕</span>
              <span>frugal classifier</span>
              <span className="arch-meta">&lt;50ms · local · pure regex</span>
            </div>

            <div className="arch-branches">
              <div className="arch-branch arch-t0">
                <div className="arch-branch-head">
                  <OllamaLogo size={18} />
                  <span className="arch-tier" style={{ color: '#4ec9b0' }}>🏠 T0</span>
                </div>
                <div className="arch-branch-model">Ollama · qwen2.5</div>
                <div className="arch-branch-cost good">FREE</div>
                <div className="arch-branch-pct">83% of prompts</div>
              </div>

              <div className="arch-branch arch-t1">
                <div className="arch-branch-head">
                  <ClaudeLogo size={18} />
                  <span className="arch-tier" style={{ color: '#569cd6' }}>🌸 T1</span>
                </div>
                <div className="arch-branch-model">Claude Haiku</div>
                <div className="arch-branch-cost">~$0.001</div>
                <div className="arch-branch-pct">~5% of prompts</div>
              </div>

              <div className="arch-branch arch-t2">
                <div className="arch-branch-head">
                  <ClaudeLogo size={18} />
                  <span className="arch-tier" style={{ color: '#dcdcaa' }}>🎵 T2</span>
                </div>
                <div className="arch-branch-model">Claude Sonnet</div>
                <div className="arch-branch-cost">~$0.010</div>
                <div className="arch-branch-pct">~12% of prompts</div>
              </div>

              <div className="arch-branch arch-t3">
                <div className="arch-branch-head">
                  <ClaudeLogo size={18} />
                  <span className="arch-tier" style={{ color: '#f44747' }}>💎 T3</span>
                </div>
                <div className="arch-branch-model">Claude Opus</div>
                <div className="arch-branch-cost">~$0.050</div>
                <div className="arch-branch-pct">~4% of prompts</div>
              </div>
            </div>

            <p className="arch-foot">
              The classifier never calls an LLM to decide. It reads the prompt. That&rsquo;s it.
            </p>

            <div className="arch-providers">
              <span className="arch-providers-label">Also supports:</span>
              <div className="arch-provider-logos">
                <GeminiLogo size={18} />
                <OpenAILogo size={18} />
                <GrokLogo size={18} />
                <MistralLogo size={18} />
              </div>
            </div>
          </div>
        </FadeIn>

        {/* 4B: Demo — Watch the router decide */}
        <FadeIn>
          <h2 className="section-h2 section-h2-sub">Watch the router decide</h2>
        </FadeIn>

        <div className="demo-grid">
          <FadeIn className="demo-card demo-t0">
            <div className="demo-prompt mono">
              <span className="cursor">▍</span> write a commit message for this change
            </div>
            <div className="demo-decision">
              <OllamaLogo size={16} />
              <span className="demo-tier" style={{ color: '#4ec9b0' }}>🏠 Ollama</span>
              <span className="mono">· qwen2.5 · 0.3s ·</span>
              <span className="demo-cost good mono">$0.000</span>
            </div>
            <div className="demo-reason">trivial_local — commit messages never need Opus</div>
          </FadeIn>

          <FadeIn className="demo-card demo-t2">
            <div className="demo-prompt mono">
              <span className="cursor">▍</span> why is my useEffect firing twice in dev mode?
            </div>
            <div className="demo-decision">
              <ClaudeLogo size={16} />
              <span className="demo-tier" style={{ color: '#dcdcaa' }}>🎵 Sonnet</span>
              <span className="mono">· 1.8s ·</span>
              <span className="demo-cost mono">$0.010</span>
            </div>
            <div className="demo-reason">reasoning_intermediate — debugging needs context</div>
          </FadeIn>

          <FadeIn className="demo-card demo-t3">
            <div className="demo-prompt mono">
              <span className="cursor">▍</span> redesign the auth system for multi-tenant
            </div>
            <div className="demo-decision">
              <ClaudeLogo size={16} />
              <span className="demo-tier" style={{ color: '#f44747' }}>💎 Opus</span>
              <span className="mono">· 4.2s ·</span>
              <span className="demo-cost mono">$0.050</span>
            </div>
            <div className="demo-reason">architecture_critical — irreversible decisions need the best</div>
          </FadeIn>
        </div>

        <FadeIn>
          <div className="demo-summary mono">
            3 prompts · total cost $0.060 · without frugal: $0.150 · saved: 60%
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S5: STATUSLINE — what your terminal looks like after install
 * ──────────────────────────────────────────────────────────────────────────── */

function Statusline() {
  return (
    <section className="section">
      <div className="container">
        <FadeIn>
          <h2 className="section-h2">What your terminal looks like after install</h2>
        </FadeIn>

        <FadeIn>
          <div className="sl-card">
            <div className="sl-bar mono">
              ⬆ main·a1b2{'  '}│{'  '}🐕 frugal v0.9{'  '}│{'  '}
              <span className="sl-t0">[T0] qwen commit 0.3s L1→T0</span>{'  '}│{'  '}
              qwen 84% · son 12% · ops 4%{'  '}│{'  '}
              <span className="sl-savings">💰 ~$12.80 (90%)</span>{'  '}│{'  '}
              <span className="sl-gpu">💻 RTX 4090 ▓▓▓▓░░ 61%</span>{'  '}│{'  '}
              <span className="sl-dots">●●○○○○</span>
            </div>

            <div className="sl-annotations">
              <div className="sl-ann"><span className="sl-ann-num">①</span> Git branch + commit</div>
              <div className="sl-ann"><span className="sl-ann-num">②</span> 🐕 frugal brand + version</div>
              <div className="sl-ann"><span className="sl-ann-num">③</span> Last turn: tier · model · category · latency · cascade</div>
              <div className="sl-ann"><span className="sl-ann-num">④</span> Model distribution (your routing mix, live)</div>
              <div className="sl-ann"><span className="sl-ann-num">⑤</span> Money saved today (running total)</div>
              <div className="sl-ann"><span className="sl-ann-num">⑥</span> Your GPU utilization (if Ollama is running)</div>
              <div className="sl-ann"><span className="sl-ann-num">⑦</span> Provider status: Claude · Ollama · Gemini · GPT · Grok · Mistral</div>
            </div>

            <div className="sl-dot-legend mono">
              <span className="sl-dot-on">●</span> live{'  '}·{'  '}
              <span className="sl-dot-deg">◐</span> degraded{'  '}·{'  '}
              <span className="sl-dot-off">○</span> not configured
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S6: PROOF — validation without exposing internals
 * ──────────────────────────────────────────────────────────────────────────── */

function Proof() {
  return (
    <section id="proof" className="section section-alt">
      <div className="container">
        <FadeIn>
          <h2 className="section-h2">The numbers are real. Here&rsquo;s how to verify.</h2>
        </FadeIn>

        <div className="proof-cols">
          <FadeIn className="proof-col">
            <h3>What we validated</h3>
            <p>
              We replayed months of real Claude Code usage through the classifier.
              Not hand-picked prompts. Not benchmarks. Every prompt, in order.
            </p>
            <div className="proof-results mono">
              <div><span className="t0-color">83%</span>{'  '}routed free to local Ollama</div>
              <div><span className="t2-color">12%</span>{'  '}routed to Sonnet</div>
              <div><span className="t3-color">{' '}4%</span>{'  '}routed to Opus</div>
              <div className="proof-divider" />
              <div className="good"><strong>90%</strong>{'  '}projected cost reduction</div>
            </div>
          </FadeIn>

          <FadeIn className="proof-col">
            <h3>How you validate yours</h3>
            <div className="code-block mono">
              <div className="code-comment"># After installing frugal, run this:</div>
              <div className="code-line">node ~/.claude/tools/router/replay.js</div>
              <div className="code-blank" />
              <div className="code-comment"># Shows your routing distribution</div>
              <div className="code-comment"># and projected savings on your own history.</div>
              <div className="code-comment"># Takes &lt; 30 seconds.</div>
            </div>
          </FadeIn>
        </div>

        <FadeIn>
          <p className="proof-tagline">
            We don&rsquo;t ask you to trust our numbers. We give you the tool to validate yours.
          </p>
        </FadeIn>

        <div className="proof-trust">
          <FadeIn className="trust-card">
            <div className="trust-val">&lt;50ms</div>
            <div className="trust-sub">classify latency</div>
          </FadeIn>
          <FadeIn className="trust-card">
            <div className="trust-val">Zero proxy</div>
            <div className="trust-sub">no port, no server, no API</div>
          </FadeIn>
          <FadeIn className="trust-card">
            <div className="trust-val">Reversible</div>
            <div className="trust-sub">uninstall in 30 seconds</div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S7: COMMUNITY — the competitive moat
 * ──────────────────────────────────────────────────────────────────────────── */

function Community() {
  return (
    <section id="community" className="section">
      <div className="container">
        <FadeIn>
          <h2 className="section-h2">
            The classifier gets smarter.
            <br />
            Your prompts never leave your machine.
          </h2>
          <p className="section-sub">This is how frugal builds a moat without a data center.</p>
        </FadeIn>

        <FadeIn>
          <div className="community-flow">
            <div className="flow-step">
              <div className="flow-label">Your machine</div>
              <div className="flow-desc">backtest runs nightly · finds misroutes · exports fingerprint</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="flow-label">frugal-hub</div>
              <div className="flow-desc">anonymous delta · no prompts, ever</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="flow-label">Everyone</div>
              <div className="flow-desc">shared classifier gets smarter</div>
            </div>
          </div>
        </FadeIn>

        <FadeIn>
          <p className="community-copy">
            When the classifier makes a mistake, backtest.js finds it. You export a delta —
            just anonymous signals: keyword presence, prompt length, tier mismatch. No text.
            No code. No paths. That delta feeds a shared classifier that benefits everyone.
          </p>
        </FadeIn>

        <FadeIn>
          <div className="privacy-card">
            <div className="privacy-head">🔒 What a delta contains</div>
            <div className="privacy-body">
              <div className="privacy-yes">✓ keyword signals (e.g. [&quot;commit&quot;, &quot;message&quot;])</div>
              <div className="privacy-yes">✓ prompt length bucket (e.g. &quot;50-100 chars&quot;)</div>
              <div className="privacy-yes">✓ tier mismatch (decided T2, should have been T0)</div>
              <div className="privacy-no">✗ never the prompt text</div>
              <div className="privacy-no">✗ never file paths or variable names</div>
              <div className="privacy-no">✗ never anything reversible to your code</div>
            </div>
          </div>
        </FadeIn>

        <FadeIn>
          <p className="community-foot">
            Currently in private beta. Building toward frugal-hub v1.1 — a Cloudflare Worker
            that automates the loop for the entire community.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S8: ACCESS — simple waitlist
 * ──────────────────────────────────────────────────────────────────────────── */

function Access() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'loading') return;
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setStatus('error');
        setErrorMsg(
          data?.error === 'invalid_email'
            ? 'That email doesn\u0027t look right.'
            : 'Something went wrong. Try again?',
        );
        return;
      }
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Try again in a moment.');
    }
  };

  return (
    <section id="access" className="section section-alt">
      <div className="container narrow">
        <FadeIn>
          <h2 className="section-h2">Join the private beta.</h2>
          <p className="section-sub">
            frugal is free. Always will be at the core. We&rsquo;re onboarding developers one at
            a time to validate the classifier across more codebases, languages, and hardware.
          </p>
        </FadeIn>

        <FadeIn>
          <div className="access-card">
            {status !== 'done' ? (
              <form className="access-form" onSubmit={onSubmit}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="access-input"
                  autoComplete="email"
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={status === 'loading'}
                >
                  {status === 'loading' ? 'Sending…' : 'Request access'}
                </button>
                {status === 'error' && <div className="access-err">{errorMsg}</div>}
              </form>
            ) : (
              <div className="access-done">
                You&rsquo;re in the queue. We&rsquo;ll reach out within 48h.
              </div>
            )}
          </div>
        </FadeIn>
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
        <div className="footer-brand">🐕 frugal · built by Paulo Loureiro · v0.9.0</div>
        <div className="footer-links">
          <a href="#how" onClick={scrollTo('how')}>Docs</a>
          <a href="#proof" onClick={scrollTo('proof')}>Security</a>
          <a href="#access" onClick={scrollTo('access')}>NOTICE</a>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page — 8 sections, nothing more
 * ──────────────────────────────────────────────────────────────────────────── */

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ErrorBoundary label="problem"><TheProblem /></ErrorBoundary>
        <ErrorBoundary label="how"><HowItWorks /></ErrorBoundary>
        <ErrorBoundary label="statusline"><Statusline /></ErrorBoundary>
        <ErrorBoundary label="proof"><Proof /></ErrorBoundary>
        <ErrorBoundary label="community"><Community /></ErrorBoundary>
        <ErrorBoundary label="access"><Access /></ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
