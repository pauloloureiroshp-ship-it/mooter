/* Mooter landing — components (hero + stats + nav + footer) */

const MOOTER_MARK = (
  <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-label="Mooter">
    {/* ears — use B8C0C8 so they're visible on the beige landing background */}
    <path fill="#B8C0C8" d="M2 2c-1 1 1 7 4.5 8.5S11 6 10 6C6.5 6 4 0 2 2z"/>
    <path fill="#B8C0C8" d="M34 2c1 1-1 7-4.5 8.5S25 6 26 6c3.5 0 6-6 8-4z"/>
    <path fill="#F5D7D8" d="M4.5 3.5c-.5.5 1 5 3 6s3-3.5 2-3.5c-2 0-3.5-3-5-2.5z"/>
    <path fill="#F5D7D8" d="M31.5 3.5c.5.5-1 5-3 6s-3-3.5-2-3.5c2 0 3.5-3 5-2.5z"/>
    <path fill="#B8C0C8" d="M4 8s-4 2-4 11c0 0 6-1 7-3 0 0 2-12.25-3-8z"/>
    <path fill="#B8C0C8" d="M27.995 8.043s4 2 4 11c0 0-6-.999-7-2.999 0 0-2-12.251 3-8.001z"/>
    <path fill="#CCD3DA" d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z"/>
    <path fill="#EDAEB0" d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z"/>
    <ellipse fill="#C16A6F" cx="9.5" cy="26" rx="1.5" ry="3"/>
    <ellipse fill="#C16A6F" cx="26.5" cy="26" rx="1.5" ry="3"/>
    <path fill="#2C2F33" d="M11 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
    <path fill="#2C2F33" d="M21 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
  </svg>
);

// Tiny re-usable logo by path
function Logo({ name, size = 16, color }) {
  return (
    <img src={`assets/logos-providers/${name}.svg`} width={size} height={size} alt={name}
         style={{ display: 'block', color: color || 'currentColor', filter: color ? undefined : undefined }} />
  );
}

function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#top" className="nav-brand">{MOOTER_MARK}<span>mooter</span></a>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#models">Models</a>
          <a href="#compare">Compare</a>
          <a href="#simulator">Simulator</a>
          <a href="#install">Install</a>
        </div>
        <div className="nav-right">
          <span className="nav-os">
            <Logo name="apple" size={11} /> macOS
            <span style={{ opacity: 0.4 }}>·</span>
            <Logo name="windows" size={11} /> Win
            <span style={{ opacity: 0.4 }}>·</span>
            <Logo name="linux" size={11} /> Linux
          </span>
          <a href="https://github.com/pauloloureiroshp-ship-it/frugal" className="btn btn-secondary" style={{padding:'8px 14px', fontSize:13}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2c-3.34.72-4.04-1.6-4.04-1.6-.55-1.4-1.34-1.77-1.34-1.77-1.1-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.3.46-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.92 1.24 3.22 0 4.6-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .31.22.7.83.57A12 12 0 0 0 12 .3"/></svg>
            Sign in with GitHub
          </a>
          <a href="#install" className="btn btn-primary">Get started</a>
        </div>
      </div>
    </nav>
  );
}

function HeroTerminalDemo() {
  // 4 scenarios cycling automatically — each shows routing in action
  const scenes = [
    {
      tier: 'T0', tierColor: '#3D8B5E', tierLabel: 'local · free',
      prompt: '"make this button rounded"',
      classify: '8ms', level: 'TRIVIAL', levelCls: 'ok',
      route: '→ qwen2.5:3b', routeColor: '#E8888A', suffix: ' (local)',
      cost: '$0.000', costCls: 'ok',
      sessionN: 1, sessionCost: '$0.000', sessionSaved: '$0.048', sessionPct: '100%',
    },
    {
      tier: 'T1', tierColor: '#3D6FA8', tierLabel: 'haiku · fast',
      prompt: '"explain this TypeError"',
      classify: '11ms', level: 'EXPLAIN', levelCls: 'ok',
      route: '→ claude-haiku', routeColor: '#A0B8D8', suffix: '',
      cost: '$0.001', costCls: 'ok',
      sessionN: 2, sessionCost: '$0.001', sessionSaved: '$0.095', sessionPct: '99%',
    },
    {
      tier: 'T2', tierColor: '#7A5EA8', tierLabel: 'sonnet · reason',
      prompt: '"why does submit crash on iOS?"',
      classify: '12ms', level: 'INVESTIGATE', levelCls: 'ok',
      route: '→ claude-sonnet', routeColor: '#A88BD4', suffix: '',
      cost: '$0.003', costCls: 'ok',
      sessionN: 3, sessionCost: '$0.004', sessionSaved: '$0.140', sessionPct: '97%',
    },
    {
      tier: 'T3', tierColor: '#B8523F', tierLabel: 'opus · critical',
      prompt: '"design payment infra w/ stripe"',
      classify: '19ms', level: 'ARCHITECTURE', levelCls: 'warn',
      route: '→ claude-opus', routeColor: '#D46A5A', suffix: '',
      cost: '$0.042', costCls: 'warn',
      sessionN: 4, sessionCost: '$0.046', sessionSaved: '$0.146', sessionPct: '76%',
    },
  ];

  const [idx, setIdx] = React.useState(0);
  const [visible, setVisible] = React.useState(true);

  // Auto-rotate every 3.5 s with a brief fade
  React.useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % scenes.length);
        setVisible(true);
      }, 250);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const s = scenes[idx];

  return (
    <div className="term">
      <div className="term-head">
        <div className="dots"><i/><i/><i/></div>
        <div className="title" style={{marginLeft: 8}}>mooter · live routing</div>
        {/* scenario chip — shows active tier */}
        <div style={{
          marginLeft: 'auto', fontSize: 10, color: s.tierColor,
          fontFamily: 'JetBrains Mono', background: s.tierColor + '1A',
          border: '1px solid ' + s.tierColor + '44',
          borderRadius: 4, padding: '1px 7px', letterSpacing: '0.04em',
          transition: 'all 0.25s',
        }}>{s.tier} · {s.tierLabel}</div>
      </div>

      {/* body — fades in/out on cycle */}
      <div className="term-body" style={{
        transition: 'opacity 0.25s',
        opacity: visible ? 1 : 0,
        minHeight: 140,
      }}>
        {/* previous prompts as dim context */}
        {idx >= 1 && <><div style={{opacity:0.35}}><span className="muted">$</span> <span style={{color:'#9A8F7E'}}>{scenes[0].prompt}</span> <span className="muted">·</span> <span style={{color:'#3D8B5E'}}>{scenes[0].cost}</span></div><div style={{height:4}}/></>}
        {idx >= 2 && <><div style={{opacity:0.35}}><span className="muted">$</span> <span style={{color:'#9A8F7E'}}>{scenes[1].prompt}</span> <span className="muted">·</span> <span style={{color:'#3D6FA8'}}>{scenes[1].cost}</span></div><div style={{height:4}}/></>}
        {idx >= 3 && <><div style={{opacity:0.35}}><span className="muted">$</span> <span style={{color:'#9A8F7E'}}>{scenes[2].prompt}</span> <span className="muted">·</span> <span style={{color:'#7A5EA8'}}>{scenes[2].cost}</span></div><div style={{height:4}}/></>}

        {/* active prompt */}
        <div><span className="prompt">$</span> <span className="cmd">claude {s.prompt}</span></div>
        <div><span className="muted">  ├─ classify.js</span> <span className="ok">{s.classify}</span> <span className="muted">→ {s.level}</span></div>
        <div>
          <span className="muted">  └─ route</span>
          {' '}<span style={{color: s.routeColor}}>{s.route}</span>
          {s.suffix && <span className="muted">{s.suffix}</span>}
          {' '}<span className={s.costCls}>{s.cost}</span>
        </div>
      </div>

      {/* mini statusline — the mooter HUD */}
      <div style={{
        borderTop: '1px solid #2a241f',
        padding: '8px 20px',
        background: '#0A0807',
        fontFamily: 'JetBrains Mono',
        fontSize: 11,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        transition: 'opacity 0.25s',
        opacity: visible ? 1 : 0,
      }}>
        <svg viewBox="0 0 36 36" width="12" height="12" style={{flexShrink:0}}>
          <path fill="#CCD3DA" d="M22 31h-8C9 31 4 27 4 21v-9C4 6 9 2 14 2h8C28 2 32 6 32 12v9C32 27 28 31 22 31z"/>
          <path fill="#EDAEB0" d="M35 28c0 5-4 8-10 8H11C6 36 1 34 1 28s4-10 10-10h14c5 0 10 4 10 10z"/>
        </svg>
        <span style={{color:'#E8888A', fontWeight:700}}>mooter</span>
        <span style={{color:'#3A332B'}}>│</span>
        <span style={{color: s.tierColor, fontWeight:700}}>{s.tier}</span>
        <span style={{color:'#3A332B'}}>│</span>
        <span style={{color:'#C8BFB2'}}>{s.sessionN}p</span>
        <span style={{color:'#3A332B'}}>·</span>
        <span style={{color:'#C8BFB2'}}>{s.sessionCost} spent</span>
        <span style={{color:'#3A332B', marginLeft:'auto'}}>·</span>
        <span style={{color:'#6FB28C', fontWeight:700}}>{s.sessionSaved} saved ({s.sessionPct})</span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <header className="hero" id="top">
      <div className="page">
        <div className="hero-grid">
          <div>
            <span className="hero-tag"><span className="dot"/> Open source · MIT · Free forever</span>
            <h1>
              You already have the setup.<br/>
              You just don't know it yet. <span className="rose">*</span>
            </h1>
            <p className="lede">
              Your GPU, your subscriptions, your local models — you're already paying for a powerful AI stack.
              But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full
              environment and routes every prompt to the optimal model.{' '}
              <strong style={{color: 'var(--ink)'}}>Same results. Up to 90% less cost.</strong>
            </p>
            <div className="hero-cta">
              <a href="#install" className="btn btn-primary">Install mooter
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </a>
              <a href="#simulator" className="btn btn-secondary">Estimate my savings</a>
            </div>
            <div className="hero-micro">
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg> Hook, not a proxy</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg> Runs locally</span>
              <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg> &lt;50ms overhead</span>
            </div>
          </div>
          <div className="hero-visual"><HeroTerminalDemo/></div>
        </div>
      </div>
    </header>
  );
}

// ── Animated counters ───────────────────────────────────────
function useCountUp(target, durMs = 1800) {
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / durMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return val;
}

function fmtNum(n) {
  if (n >= 1e9) return (n/1e9).toFixed(2).replace(/\.?0+$/,'') + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(2).replace(/\.?0+$/,'') + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1).replace(/\.?0+$/,'') + 'K';
  return String(n);
}

function StatsStrip() {
  const d = window.LANDING_DATA.stats;
  const prompts = useCountUp(d.prompts);
  const tokens  = useCountUp(d.tokens);
  const saved   = useCountUp(d.saved_usd);
  const models  = useCountUp(d.models, 900);
  return (
    <section className="band tight" style={{paddingTop: 0}}>
      <div className="page">
        <div className="stats">
          <div className="stat">
            <div className="v">{fmtNum(prompts)}</div>
            <div className="k">Prompts routed</div>
            <div className="delta">+1,842 today</div>
          </div>
          <div className="stat">
            <div className="v">{fmtNum(tokens)}</div>
            <div className="k">Tokens optimized</div>
            <div className="delta">across all users</div>
          </div>
          <div className="stat">
            <div className="v"><span className="unit">$</span>{fmtNum(saved)}</div>
            <div className="k">Total saved</div>
            <div className="delta">vs all-Opus baseline</div>
          </div>
          <div className="stat">
            <div className="v">{models}</div>
            <div className="k">Models evaluated</div>
            <div className="delta">4 tiers · weekly backtests</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="page">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="name">{MOOTER_MARK}<span>mooter</span></div>
            <div>Route smarter. Ship faster.</div>
            <div className="tag">MIT · Built in Portugal · 2026</div>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <a href="#how">How it works</a>
            <a href="#models">Models</a>
            <a href="#simulator">Savings simulator</a>
            <a href="#install">Install</a>
          </div>
          <div className="footer-col">
            <h5>Docs</h5>
            <a href="#">Getting started</a>
            <a href="#">Configuration</a>
            <a href="#">Classifier API</a>
            <a href="#">Changelog</a>
          </div>
          <div className="footer-col">
            <h5>Community</h5>
            <a href="https://github.com/pauloloureiroshp-ship-it/frugal">GitHub</a>
            <a href="#">Discord</a>
            <a href="#">Contributors</a>
            <a href="mailto:paulo.loureiro.shp@gmail.com">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 mooter · MIT License</span>
          <span>v0.9.2 · classifier sha 4f8c2a1</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { Nav, Hero, StatsStrip, Footer, Logo, MOOTER_MARK, fmtNum, useCountUp });
