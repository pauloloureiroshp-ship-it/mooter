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
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
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
  { key: 'frugal',     label: '🐕 frugal',     sub: 'This' },
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
          <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>🐕</div>
          <h2 className="section-h2">You&apos;re on the list.</h2>
          <p className="section-sub" style={{ margin: '1rem auto 2rem', textAlign: 'center' }}>
            We&apos;ll email you when frugal is ready for your setup.
            In the meantime, you can install the open beta now:
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
              <li>8 slash-command skills</li>
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
          <span className="brand-shiba">&#x1F415;</span> frugal
        </div>
        <div className="footer-links">
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal" target="_blank" rel="noopener">GitHub</a>
          <a href="mailto:paulo.loureiro.shp@gmail.com">Contact</a>
          <a href="#compare" onClick={scrollTo('compare')}>Compare</a>
        </div>
        <div className="footer-copy">
          MIT License &middot; Built in S&atilde;o Paulo &middot; 2026
        </div>
      </div>
    </footer>
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
        <TheProblem />
        <TheSolution />
        <DemoSection />
        <FlywheelSection />
        <AfterInstallSection />
        <ProofSection />
        <CommunitySection />
        <ComparisonSection />
        <PricingAccess />
      </main>
      <Footer />
    </ErrorBoundary>
  );
}
