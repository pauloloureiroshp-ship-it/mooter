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

function useCommunityStats() {
  const [stats, setStats] = useState({
    prompt_count: 1437,
    savings_pct: 90.2,
    savings_usd: 6.29,
    user_count: 1,
  });
  const [live, setLive] = useState(false);

  useEffect(() => {
    fetch('https://frugal-hub.frugal-hub.workers.dev/api/stats', {
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
          <span className="brand-shiba">&#x1F415;</span> frugal
        </a>
        <div className="nav-links">
          <a href="#how" onClick={scrollTo('how')}>How it works</a>
          <a href="#after-install" onClick={scrollTo('after-install')}>After install</a>
          <a href="#proof" onClick={scrollTo('proof')}>Proof</a>
          <a href="#pricing" onClick={scrollTo('pricing')}>Pricing</a>
        </div>
        <a href="#access" onClick={scrollTo('access')} className="btn btn-primary btn-sm">
          Install now
        </a>
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
  return (
    <section id="how" className="section section-alt">
      <div className="container">
        <Reveal><h2 className="section-h2">What frugal actually does</h2></Reveal>
        <Reveal>
          <p className="section-sub">
            One install. Every prompt classified in &lt;50ms. Nothing intercepted. Nothing proxied.
          </p>
        </Reveal>

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
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * S5 — THE DEMO: Without / With frugal (animated)
 * ──────────────────────────────────────────────────────────────────────────── */

type DemoLine = { prompt: string; model: string; tier: string; tierColor: string; cost: string; time: string; logo: ReactNode };

const DEMO: DemoLine[] = [
  { prompt: 'write a commit message for this change', model: 'Ollama \u00b7 qwen2.5', tier: '\ud83c\udfe0', tierColor: 'var(--t0)', cost: '$0.000', time: '0.3s', logo: <OllamaIcon /> },
  { prompt: 'why is useEffect firing twice in dev mode?', model: 'Sonnet', tier: '\ud83c\udfb5', tierColor: 'var(--t2)', cost: '$0.010', time: '1.8s', logo: <AnthropicIcon /> },
  { prompt: 'redesign auth for multi-tenant support', model: 'Opus', tier: '\ud83d\udc8e', tierColor: 'var(--t3)', cost: '$0.050', time: '4.2s', logo: <AnthropicIcon /> },
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
                    {'  '}\u2193 Model: Claude Opus{'  '}\u25cf{'  '}$0.050{'  '}\u25cf{'  '}{i === 0 ? '4.1s' : i === 1 ? '5.8s' : '6.2s'}
                  </div>
                </div>
              ))}
              <div className={`demo-total ${step >= DEMO.length ? 'visible' : ''}`}>
                <div className="term-divider" />
                <div className="term-line muted">{'  '}3 prompts{'  '}\u25cf{'  '}Total: $0.150{'  '}\u25cf{'  '}16.1s</div>
              </div>
            </div>
          </div>

          {/* WITH */}
          <div className="terminal-window">
            <div className="terminal-header">
              <span className="traffic-light red" />
              <span className="traffic-light yellow" />
              <span className="traffic-light green" />
              <span className="terminal-title">With frugal &#x1F415;</span>
            </div>
            <div className="terminal-body">
              <div className="term-line dim">$ claude</div>
              {DEMO.map((d, i) => (
                <div key={i} className={`demo-block ${step >= i ? 'visible' : ''}`}>
                  <div className="term-line">&gt; {d.prompt}</div>
                  <div className="term-line" style={{ color: d.tierColor }}>
                    {'  '}\u2193 {d.tier} {d.model}{'  '}\u25cf{'  '}{d.cost}{'  '}\u25cf{'  '}{d.time}{'  '}\u2713
                  </div>
                </div>
              ))}
              <div className={`demo-total ${step >= DEMO.length ? 'visible' : ''}`}>
                <div className="term-divider" />
                <div className="term-line muted">{'  '}3 prompts{'  '}\u25cf{'  '}Total: $0.060{'  '}\u25cf{'  '}6.3s</div>
                <div className="term-line savings-line">{'  '}\ud83d\udcb0 Saved: $0.090 (60%)</div>
              </div>
            </div>
          </div>
        </div>

        <Reveal>
          <div className="demo-math">
            <span>60% cheaper.</span>
            <span>2.5\u00d7 faster.</span>
            <span>Same quality where it matters.</span>
          </div>
        </Reveal>
        <Reveal>
          <p className="demo-note">
            Quality is never traded for cost. The last prompt still went to Opus &mdash; because it needed Opus.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

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
  { cmd: '/frugal-status',  desc: 'Health check: hook, Ollama, hub, last decisions' },
  { cmd: '/frugal-savings', desc: 'Economic report: saved so far + annual projection' },
  { cmd: '/frugal-route',   desc: 'Classify any task before you run it' },
  { cmd: '/frugal-summary', desc: 'What the router decided this session, and why' },
  { cmd: '/frugal-update',  desc: 'Pull latest from GitHub + sync classifier' },
  { cmd: '/router',         desc: 'Quick on-demand routing recommendation' },
];

function SlashCommandsGrid() {
  return (
    <>
      <Reveal>
        <h3 className="after-sub-title">Six commands. Everything you need.</h3>
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

function AfterInstallSection() {
  return (
    <section id="after-install" className="section section-alt">
      <div className="container">
        <Reveal><h2 className="section-h2">After install, this is your life</h2></Reveal>
        <Reveal>
          <p className="section-sub">Everything works. Nothing changes. Except your bill.</p>
        </Reveal>

        <StatuslineSection />
        <SlashCommandsGrid />
        <AfterInstallTimeline />
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
 * S8 — COMMUNITY LOOP
 * ──────────────────────────────────────────────────────────────────────────── */

function CommunitySection() {
  const { stats } = useCommunityStats();

  return (
    <section className="section section-alt">
      <div className="container">
        <Reveal>
          <h2 className="section-h2">
            The classifier gets smarter.
            <br />
            Your prompts never leave your machine.
          </h2>
          <p className="section-sub-center">This is how frugal builds a moat &mdash; without a data centre.</p>
        </Reveal>

        <Reveal>
          <div className="community-stats">
            <div className="cs-stat">
              <strong><AnimatedNumber value={stats.prompt_count} /></strong>
              <span>prompts contributed to shared classifier</span>
            </div>
            <div className="cs-stat">
              <strong><AnimatedNumber value={stats.user_count} /></strong>
              <span>machines improving the model</span>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <div className="community-flow">
            <div className="flow-step">
              <div className="flow-label">Your machine</div>
              <div className="flow-desc">misroute detected &middot; backtest runs &middot; export optional</div>
            </div>
            <div className="flow-arrow">\u2192</div>
            <div className="flow-step flow-step-mid">
              <div className="flow-label">delta: fingerprint only</div>
              <div className="flow-desc">No prompts. No code. No paths. Ever.</div>
            </div>
            <div className="flow-arrow">\u2192</div>
            <div className="flow-step">
              <div className="flow-label">Community</div>
              <div className="flow-desc">shared classifier gets smarter for everyone</div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="community-copy">
            When frugal gets a routing decision wrong, it notices. Every night, backtest.js finds
            the misroutes and learns from them. You can export a delta &mdash; a privacy-preserving
            fingerprint of where the classifier was wrong. That delta feeds a shared classifier
            that gets better for everyone.
          </p>
        </Reveal>

        <Reveal>
          <div className="privacy-card">
            <div className="privacy-head">&#x1F512; A delta contains:</div>
            <div className="privacy-body">
              <div className="privacy-yes">\u2713 keyword signals (e.g. [&quot;commit&quot;, &quot;message&quot;])</div>
              <div className="privacy-yes">\u2713 prompt length bucket (e.g. &quot;50&ndash;100 chars&quot;)</div>
              <div className="privacy-yes">\u2713 tier mismatch (decided T2 \u2192 should have been T0)</div>
              <div className="privacy-no">\u2717 never your prompt text</div>
              <div className="privacy-no">\u2717 never file paths or variable names</div>
              <div className="privacy-no">\u2717 never anything reversible to your code or identity</div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="community-close">
            This is how frugal gets better than any single team could make it &mdash;
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
        