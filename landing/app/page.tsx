'use client';

import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

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
 * SVG Logos
 * ──────────────────────────────────────────────────────────────────────────── */

function AnthropicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="5" fill="#CC785C" />
      <text x="10" y="14" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="sans-serif">A</text>
    </svg>
  );
}

function OllamaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="5" fill="#1c1c1e" stroke="#444" strokeWidth="1" />
      <circle cx="7.5" cy="9" r="2" fill="white" />
      <circle cx="12.5" cy="9" r="2" fill="white" />
      <path d="M6.5 14 Q10 16.5 13.5 14" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function OpenAIIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="5" fill="#000" />
      <circle cx="10" cy="10" r="5" stroke="white" strokeWidth="1.5" fill="none" />
      <circle cx="10" cy="10" r="2" fill="white" />
    </svg>
  );
}

function GeminiIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="5" fill="#fff" />
      <text x="10" y="15" textAnchor="middle" fill="#4285F4" fontSize="13" fontWeight="800" fontFamily="sans-serif">G</text>
    </svg>
  );
}

function MistralIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="5" fill="#FF7000" />
      <rect x="4" y="7" width="5" height="5" fill="white" />
      <rect x="11" y="7" width="5" height="5" fill="white" />
      <rect x="4" y="13" width="5" height="5" fill="white" />
    </svg>
  );
}

function GrokIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect width="20" height="20" rx="5" fill="#000" />
      <text x="10" y="15" textAnchor="middle" fill="white" fontSize="13" fontWeight="800" fontFamily="sans-serif">X</text>
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
          <span className="brand-shiba">🐕</span> frugal
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollTo('how')}>How it works</a>
          <a href="#proof" onClick={scrollTo('proof')}>See the proof</a>
          <a href="#pricing" onClick={scrollTo('pricing')}>Pricing</a>
        </div>
        <a href="#access" onClick={scrollTo('access')} className="btn btn-primary btn-sm">
          Get access
        </a>
      </div>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S2 — HERO
 * ──────────────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section id="top" className="hero">
      <div className="container narrow hero-inner">
        <h1 className="hero-h1">
          The right model.
          <br />
          For every prompt. Automatically.
        </h1>

        <p className="hero-sub">
          frugal routes your AI prompts to the cheapest model that can handle them —
          using your own hardware, your existing subscriptions, in under 50ms.
        </p>

        <div className="hero-chips">
          <span className="proof-chip">✓ Works with Claude · GPT · Gemini · Ollama</span>
          <span className="proof-chip">&lt;50ms routing</span>
          <span className="proof-chip">No proxy. No port. No config.</span>
        </div>

        <a href="#access" onClick={scrollTo('access')} className="btn btn-primary hero-cta">
          Request early access →
        </a>
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
            <div className="problem-icon">💸</div>
            <div className="problem-title">&ldquo;My AI bill this week: $63&rdquo;</div>
            <p className="problem-body">
              Most of it was commit messages, file reads, and rename operations.
            </p>
          </Reveal>
          <Reveal className="problem-card" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="problem-icon">⏸</div>
            <div className="problem-title">&ldquo;I had to stop building&rdquo;</div>
            <p className="problem-body">
              Budget ran out Thursday. I had a GPU and three subscriptions doing nothing.
            </p>
          </Reveal>
          <Reveal className="problem-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="problem-icon">🤯</div>
            <div className="problem-title">&ldquo;I just want to ship&rdquo;</div>
            <p className="problem-body">
              I don&rsquo;t want to think about which model to use. I just want answers.
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
 * S4 — THE SOLUTION
 * ──────────────────────────────────────────────────────────────────────────── */

function TheSolution() {
  return (
    <section id="how" className="section section-alt">
      <div className="container">
        <Reveal><h2 className="section-h2">What frugal actually does</h2></Reveal>

        <div className="pillars stagger">
          <Reveal className="pillar" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="pillar-icon">🖥</div>
            <h3>Reads your hardware</h3>
            <p>Detects your GPU, VRAM, and which local models you can run free. Routes there first, always.</p>
          </Reveal>
          <Reveal className="pillar" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="pillar-icon">📋</div>
            <h3>Knows your subscriptions</h3>
            <p>Already paying for Claude Max? GPT Plus? frugal factors that in — it won&rsquo;t duplicate cost.</p>
          </Reveal>
          <Reveal className="pillar" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="pillar-icon">⚡</div>
            <h3>Routes in &lt;50ms</h3>
            <p>Pure regex classifier. No LLM call to decide. No added latency. No round-trip to the cloud.</p>
          </Reveal>
        </div>

        <Reveal>
          <div className="arch-title">Every prompt takes the right path</div>
        </Reveal>

        <Reveal>
          <div className="arch">
            <div className="arch-input">Your Prompt</div>
            <div className="arch-arrow-down">▼</div>
            <div className="arch-classifier">
              <span>🐕</span> frugal classifier
              <span className="arch-meta">&lt;50ms · local · pure regex</span>
            </div>
            <div className="arch-arrow-down">▼</div>
            <div className="arch-branches">
              <div className="arch-branch" style={{ borderColor: 'var(--t0)' }}>
                <div className="arch-branch-head"><OllamaIcon /><span style={{ color: 'var(--t0)' }}>🏠 T0</span></div>
                <div className="arch-branch-model">Ollama · qwen</div>
                <div className="arch-branch-cost" style={{ color: 'var(--green)' }}>FREE</div>
                <div className="arch-branch-pct">83% of prompts</div>
              </div>
              <div className="arch-branch" style={{ borderColor: 'var(--t1)' }}>
                <div className="arch-branch-head"><AnthropicIcon /><span style={{ color: 'var(--t1)' }}>🌸 T1</span></div>
                <div className="arch-branch-model">Claude Haiku</div>
                <div className="arch-branch-cost">~$0.001</div>
                <div className="arch-branch-pct">~5%</div>
              </div>
              <div className="arch-branch" style={{ borderColor: 'var(--t2)' }}>
                <div className="arch-branch-head"><AnthropicIcon /><span style={{ color: 'var(--t2)' }}>🎵 T2</span></div>
                <div className="arch-branch-model">Claude Sonnet</div>
                <div className="arch-branch-cost">~$0.010</div>
                <div className="arch-branch-pct">~12%</div>
              </div>
              <div className="arch-branch" style={{ borderColor: 'var(--t3)' }}>
                <div className="arch-branch-head"><AnthropicIcon /><span style={{ color: 'var(--t3)' }}>💎 T3</span></div>
                <div className="arch-branch-model">Claude Opus</div>
                <div className="arch-branch-cost">~$0.050</div>
                <div className="arch-branch-pct">~4%</div>
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
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S5 — THE DEMO: Without / With frugal (animated)
 * ──────────────────────────────────────────────────────────────────────────── */

type DemoLine = { prompt: string; model: string; tier: string; tierColor: string; cost: string; time: string; logo: ReactNode };

const DEMO: DemoLine[] = [
  { prompt: 'write a commit message for this change', model: 'Ollama · qwen2.5', tier: '🏠', tierColor: 'var(--t0)', cost: '$0.000', time: '0.3s', logo: <OllamaIcon /> },
  { prompt: 'why is useEffect firing twice in dev mode?', model: 'Sonnet', tier: '🎵', tierColor: 'var(--t2)', cost: '$0.010', time: '1.8s', logo: <AnthropicIcon /> },
  { prompt: 'redesign auth for multi-tenant support', model: 'Opus', tier: '💎', tierColor: 'var(--t3)', cost: '$0.050', time: '4.2s', logo: <AnthropicIcon /> },
];

function DemoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref, 0.2);
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let tid: ReturnType<typeof setTimeout>;
    let i = 0;

    const advance = () => {
      if (cancelled || i > DEMO.length) return;
      setStep(i);
      i++;
      tid = setTimeout(advance, i <= DEMO.length ? 2200 : 0);
    };

    tid = setTimeout(advance, 600);
    return () => { cancelled = true; clearTimeout(tid); };
  }, [visible]);

  return (
    <section id="demo" className="section">
      <div ref={ref} className="container">
        <Reveal><h2 className="section-h2">What changes when you install frugal</h2></Reveal>

        <div className="demo-panels">
          {/* WITHOUT */}
          <div className="terminal-window">
            <div className="terminal-header">
              <span className="traffic-light red" />
              <span className="traffic-light yellow" />
              <span className="traffic-light green" />
              <span className="terminal-title">Without frugal</span>
            </div>
            <div className="terminal-body">
              <div className="term-line dim">$ claude</div>
              {DEMO.map((d, i) => (
                <div key={i} className={`demo-block ${step >= i ? 'visible' : ''}`}>
                  <div className="term-line">&gt; {d.prompt}</div>
                  <div className="term-line muted">
                    {'  '}↳ Model: Claude Opus{'  '}●{'  '}$0.050{'  '}●{'  '}{i === 0 ? '4.1s' : i === 1 ? '5.8s' : '6.2s'}
                  </div>
                </div>
              ))}
              <div className={`demo-total ${step >= DEMO.length ? 'visible' : ''}`}>
                <div className="term-divider" />
                <div className="term-line muted">{'  '}3 prompts{'  '}●{'  '}Total: $0.150{'  '}●{'  '}16.1s</div>
              </div>
            </div>
          </div>

          {/* WITH */}
          <div className="terminal-window">
            <div className="terminal-header">
              <span className="traffic-light red" />
              <span className="traffic-light yellow" />
              <span className="traffic-light green" />
              <span className="terminal-title">With frugal 🐕</span>
            </div>
            <div className="terminal-body">
              <div className="term-line dim">$ claude</div>
              {DEMO.map((d, i) => (
                <div key={i} className={`demo-block ${step >= i ? 'visible' : ''}`}>
                  <div className="term-line">&gt; {d.prompt}</div>
                  <div className="term-line" style={{ color: d.tierColor }}>
                    {'  '}↳ {d.tier} {d.model}{'  '}●{'  '}{d.cost}{'  '}●{'  '}{d.time}{'  '}✓
                  </div>
                </div>
              ))}
              <div className={`demo-total ${step >= DEMO.length ? 'visible' : ''}`}>
                <div className="term-divider" />
                <div className="term-line muted">{'  '}3 prompts{'  '}●{'  '}Total: $0.060{'  '}●{'  '}6.3s</div>
                <div className="term-line savings-line">{'  '}💰 Saved: $0.090 (60%)</div>
              </div>
            </div>
          </div>
        </div>

        <Reveal>
          <div className="demo-math">
            <span>60% cheaper.</span>
            <span>2.5× faster.</span>
            <span>Same quality where it matters.</span>
          </div>
        </Reveal>
        <Reveal>
          <p className="demo-note">
            Quality is never traded for cost. The last prompt still went to Opus — because it needed Opus.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S6 — THE STATUSLINE
 * ──────────────────────────────────────────────────────────────────────────── */

function StatuslineSection() {
  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal><h2 className="section-h2">Your terminal tells you everything</h2></Reveal>

        <Reveal>
          <div className="sl-card">
            <div className="sl-bar mono">
              ⬆ main·a1b2{'  '}│{'  '}🐕 frugal v0.9{'  '}│{'  '}
              <span className="sl-t0">[T0] qwen commit 0.3s</span>{'  '}│{'  '}
              qwen 84% · son 12% · ops 4%{'  '}│{'  '}
              <span className="sl-savings">💰 ~$12.80 saved (90%)</span>{'  '}│{'  '}
              <span className="sl-gpu">💻 RTX 4090 ▓▓▓▓░░ 61%</span>{'  '}│{'  '}
              <span className="sl-dots">●●○○○○</span>
            </div>

            <div className="sl-annotations">
              <div className="sl-ann"><span className="sl-ann-num">①</span> Git branch + commit hash</div>
              <div className="sl-ann"><span className="sl-ann-num">②</span> 🐕 frugal — always visible, always there</div>
              <div className="sl-ann"><span className="sl-ann-num">③</span> Last prompt: which model, why, how fast</div>
              <div className="sl-ann"><span className="sl-ann-num">④</span> Your routing mix today (live)</div>
              <div className="sl-ann"><span className="sl-ann-num">⑤</span> Total saved this session (running)</div>
              <div className="sl-ann"><span className="sl-ann-num">⑥</span> Your GPU — frugal is running local models here</div>
              <div className="sl-ann"><span className="sl-ann-num">⑦</span> Provider status: Claude · Ollama · Gemini · GPT · Grok · Mistral</div>
            </div>

            <div className="sl-dot-legend mono">
              <span className="sl-dot-on">●</span> live{'  '}·{'  '}
              <span className="sl-dot-deg">◐</span> degraded{'  '}·{'  '}
              <span className="sl-dot-off">○</span> not configured
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="sl-foot">
            Install once. The statusline appears automatically in every Claude Code session.
          </p>
        </Reveal>
      </div>
    </section>
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
            <div className="proof-big">90%</div>
            <div className="proof-big-label">cost reduction</div>
            <p>
              On real developer prompts. Not benchmarks. Not demos. Real months of actual Claude
              Code usage, replayed through the classifier.
            </p>
            <div className="proof-chips">
              <span className="proof-chip">83% routed free to Ollama</span>
              <span className="proof-chip">Only 4% actually needed Opus</span>
              <span className="proof-chip">&lt;50ms to classify every prompt</span>
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
                <div className="code-line">T0 (free)   ████████████████  78%</div>
                <div className="code-line">T2 (Sonnet) ████░░░░░░░░░░░░  18%</div>
                <div className="code-line">T3 (Opus)   █░░░░░░░░░░░░░░░   4%</div>
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
 * S8 — COMMUNITY LOOP
 * ──────────────────────────────────────────────────────────────────────────── */

function CommunitySection() {
  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">
            The classifier gets smarter.
            <br />
            Your prompts never leave your machine.
          </h2>
          <p className="section-sub">This is how frugal builds a moat — without a data centre.</p>
        </Reveal>

        <Reveal>
          <div className="community-flow">
            <div className="flow-step">
              <div className="flow-label">Your machine</div>
              <div className="flow-desc">misroute detected · backtest runs · export optional</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step flow-step-mid">
              <div className="flow-label">delta: fingerprint only</div>
              <div className="flow-desc">No prompts. No code. No paths. Ever.</div>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-step">
              <div className="flow-label">Community</div>
              <div className="flow-desc">shared classifier gets smarter for everyone</div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="community-copy">
            When frugal gets a routing decision wrong, it notices. Every night, backtest.js finds
            the misroutes and learns from them. You can export a delta — a privacy-preserving
            fingerprint of where the classifier was wrong. That delta feeds a shared classifier
            that gets better for everyone.
          </p>
        </Reveal>

        <Reveal>
          <div className="privacy-card">
            <div className="privacy-head">🔒 A delta contains:</div>
            <div className="privacy-body">
              <div className="privacy-yes">✓ keyword signals (e.g. [&quot;commit&quot;, &quot;message&quot;])</div>
              <div className="privacy-yes">✓ prompt length bucket (e.g. &quot;50–100 chars&quot;)</div>
              <div className="privacy-yes">✓ tier mismatch (decided T2 → should have been T0)</div>
              <div className="privacy-no">✗ never your prompt text</div>
              <div className="privacy-no">✗ never file paths or variable names</div>
              <div className="privacy-no">✗ never anything reversible to your code or identity</div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="community-close">
            This is how frugal gets better than any single team could make it —
            powered by the community, not a training run.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S9 — PRICING + ACCESS
 * ──────────────────────────────────────────────────────────────────────────── */

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
    setSubs((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
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
    <section id="pricing" className="section">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">Free to use. You pay only when we save you money.</h2>
          <p className="section-sub-center">That&rsquo;s not marketing. That&rsquo;s the model.</p>
        </Reveal>

        <div className="pricing-grid stagger">
          <Reveal className="pricing-card" style={{ '--i': 0 } as React.CSSProperties}>
            <div className="plan-emoji">🐕</div>
            <div className="plan-name">Community</div>
            <div className="plan-price">Free</div>
            <p className="plan-desc">The full router. Classify. Route. Save.</p>
            <ul className="plan-features">
              <li>✓ classify.js + hook + 6 subagents</li>
              <li>✓ Real-time statusline</li>
              <li>✓ replay.js — validate your savings</li>
              <li>✓ Manual backtest + tuning</li>
              <li>✓ Community classifier updates (opt-in)</li>
              <li>✓ No time limit. No feature gate.</li>
            </ul>
            <a href="#access" onClick={scrollTo('access')} className="btn btn-ghost btn-block">
              Download free
            </a>
          </Reveal>

          <Reveal className="pricing-card featured" style={{ '--i': 1 } as React.CSSProperties}>
            <div className="plan-badge">most popular</div>
            <div className="plan-emoji">⚡</div>
            <div className="plan-name">Pro</div>
            <div className="plan-price">$9 <span className="plan-period">/ month</span></div>
            <p className="plan-desc">or nothing if we don&rsquo;t save you at least $9</p>
            <ul className="plan-features">
              <li>✓ Auto-tuning (nightly backtest auto-applies)</li>
              <li>✓ Hardware-aware routing (GPU VRAM detection)</li>
              <li>✓ Subscription-aware routing</li>
              <li>✓ Budget guardrail (auto-downgrade near limit)</li>
              <li>✓ Priority classifier updates</li>
              <li>✓ frugal-hub access (v1.1)</li>
            </ul>
            <a href="#access" onClick={scrollTo('access')} className="btn btn-primary btn-block">
              Request early access
            </a>
          </Reveal>

          <Reveal className="pricing-card" style={{ '--i': 2 } as React.CSSProperties}>
            <div className="plan-emoji">👥</div>
            <div className="plan-name">Team</div>
            <div className="plan-price">$29 <span className="plan-period">/ seat / mo</span></div>
            <p className="plan-desc">Everything in Pro, for your team.</p>
            <ul className="plan-features">
              <li>✓ Shared team config (frugal.config.json)</li>
              <li>✓ Per-developer cost + routing analytics</li>
              <li>✓ Team delta aggregation</li>
              <li>✓ Dedicated onboarding</li>
            </ul>
            <a href="#access" onClick={scrollTo('access')} className="btn btn-ghost btn-block">
              Talk to us
            </a>
          </Reveal>
        </div>

        <Reveal>
          <div className="guarantee-box">
            <p>
              Pro costs <strong>$9/month</strong>. The average Pro user saves{' '}
              <strong>$23/month</strong>. If you don&rsquo;t save at least $9, you don&rsquo;t pay.
            </p>
            <p className="guarantee-foot">We only make money when you make money.</p>
          </div>
        </Reveal>

        {/* Waitlist form */}
        <div id="access" className="access-section">
          <Reveal>
            <h2 className="section-h2 access-h2">Join the private beta</h2>
            <p className="section-sub-center">
              We&rsquo;re onboarding one developer at a time. Hardware matters — tell us what
              you&rsquo;re running.
            </p>
          </Reveal>

          <Reveal>
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

                  <select
                    value={hw}
                    onChange={(e) => setHw(e.target.value)}
                    className="access-select"
                  >
                    <option value="">What hardware are you running?</option>
                    {HW_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>

                  <div className="access-subs-label">Which AI subscriptions do you have?</div>
                  <div className="access-subs">
                    {AI_SUBS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`sub-chip ${subs.includes(s) ? 'active' : ''}`}
                        onClick={() => toggleSub(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>

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
                  You&rsquo;re in the queue. We&rsquo;ll reach out within 48 hours.
                </div>
              )}
            </div>
          </Reveal>
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
        <div className="footer-brand mono">🐕 frugal · built by Paulo Loureiro · v0.9.0</div>
        <div className="footer-links">
          <a href="#how" onClick={scrollTo('how')}>Docs</a>
          <a href="#proof" onClick={scrollTo('proof')}>Security</a>
          <a href="#pricing" onClick={scrollTo('pricing')}>NOTICE</a>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page — 9 sections + footer. No more.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <ErrorBoundary><TheProblem /></ErrorBoundary>
        <ErrorBoundary><TheSolution /></ErrorBoundary>
        <ErrorBoundary><DemoSection /></ErrorBoundary>
        <ErrorBoundary><StatuslineSection /></ErrorBoundary>
        <ErrorBoundary><ProofSection /></ErrorBoundary>
        <ErrorBoundary><CommunitySection /></ErrorBoundary>
        <ErrorBoundary><PricingAccess /></ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
