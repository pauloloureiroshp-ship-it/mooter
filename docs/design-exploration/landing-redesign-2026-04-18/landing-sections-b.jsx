/* Mooter landing — sections B: terminal compare, install, simulator */

function TerminalCompare() {
  // Prompts with their routing decision (for mooter side)
  const prompts = [
    { cmd: '"fix login button color"',          opus: { model:'claude-3-opus', cost:'$0.048', time:'6.2s' }, mooter: { tier:'T0', model:'qwen2.5:3b (local)', cost:'$0.000', time:'0.4s', cls:'ok' } },
    { cmd: '"explain this TypeError"',          opus: { model:'claude-3-opus', cost:'$0.051', time:'7.1s' }, mooter: { tier:'T1', model:'claude-haiku',       cost:'$0.001', time:'1.1s', cls:'ok' } },
    { cmd: '"rename var userInfo → currentUser"',opus:{ model:'claude-3-opus', cost:'$0.039', time:'5.4s' }, mooter: { tier:'T0', model:'qwen2.5:3b (local)', cost:'$0.000', time:'0.3s', cls:'ok' } },
    { cmd: '"refactor auth for multi-tenant"',   opus:{ model:'claude-3-opus', cost:'$0.052', time:'8.1s' }, mooter: { tier:'T3', model:'claude-opus (guardrail)',cost:'$0.052',time:'8.1s',cls:'warn'} },
  ];

  const [step, setStep]       = React.useState(-1);  // -1 = idle, 0..3 = running
  const [running, setRunning] = React.useState(false);

  function replay() {
    if (running) return;
    setStep(-1);
    setRunning(true);
    let i = 0;
    const advance = () => {
      setStep(i);
      i++;
      if (i < prompts.length) setTimeout(advance, 900);
      else setRunning(false);
    };
    setTimeout(advance, 300);
  }

  // accumulated cost helpers
  const opusTotal   = prompts.slice(0, step + 1).reduce((a, p) => a + parseFloat(p.opus.cost.slice(1)), 0);
  const mooterTotal = prompts.slice(0, step + 1).reduce((a, p) => a + parseFloat(p.mooter.cost.slice(1)), 0);
  const savedAmt    = opusTotal - mooterTotal;
  const savedPct    = opusTotal > 0 ? Math.round((savedAmt / opusTotal) * 100) : 0;

  const visible = (i) => step >= i;

  return (
    <section className="band beige-2">
      <div className="page">
        <div className="section-head">
          <span className="eyebrow">Same prompts · Different bill</span>
          <h2>The difference shows up in your terminal.</h2>
          <p className="lede muted">Four identical prompts sent to Claude Code. Left: every single one goes to Opus. Right: mooter routes each to the right model. Quality: same. Cost: a fraction.</p>
        </div>

        {/* replay button */}
        <div style={{marginBottom:20, display:'flex', alignItems:'center', gap:14}}>
          <button
            className="btn btn-secondary"
            onClick={replay}
            disabled={running}
            style={{fontSize:13, padding:'9px 18px', display:'inline-flex', alignItems:'center', gap:8}}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.9"/></svg>
            {running ? 'running session…' : step < 0 ? 'Run session' : 'Replay'}
          </button>
          {step >= 0 && (
            <div style={{fontFamily:'JetBrains Mono', fontSize:12, color:'var(--muted-ink)', display:'flex', gap:10, alignItems:'center'}}>
              <span>{step + 1} / {prompts.length} prompts</span>
              {!running && <span style={{color:'var(--t0-green)', fontWeight:700}}>✓ session complete</span>}
            </div>
          )}
        </div>

        <div className="term-compare">
          {/* WITHOUT MOOTER */}
          <div className="without">
            <div className="term-label"><span style={{width:8,height:8,borderRadius:'50%',background:'#B8523F'}}></span> Without mooter</div>
            <div className="term">
              <div className="term-head">
                <div className="dots"><i/><i/><i/></div>
                <div className="title" style={{marginLeft:8}}>claude-code · session</div>
                {step >= 0 && (
                  <div style={{marginLeft:'auto', fontSize:10.5, fontFamily:'JetBrains Mono', color:'#D46A5A', fontWeight:700}}>
                    ${opusTotal.toFixed(3)}
                  </div>
                )}
              </div>
              <div className="term-body" style={{minHeight:170}}>
                {prompts.map((p, i) => !visible(i) ? null : (
                  <React.Fragment key={i}>
                    <div style={{animation: step === i ? 'fadeIn 0.3s ease' : undefined}}>
                      <span className="prompt">$</span> <span className="cmd">{p.cmd}</span>
                    </div>
                    <div>
                      <span className="muted">  → {p.opus.model}</span>{' '}
                      <span className="err">{p.opus.cost} · {p.opus.time}</span>
                    </div>
                    {i < prompts.length - 1 && <div style={{height:6}}/>}
                  </React.Fragment>
                ))}
                {step >= prompts.length - 1 && (
                  <>
                    <div style={{height:10, borderTop:'1px solid #2a241f', marginTop:12, paddingTop:12}}/>
                    <div style={{color:'#D46A5A'}}>● session · 4 prompts · $0.190 · avg 6.7s</div>
                    <div className="muted" style={{fontSize:11, marginTop:4}}>every prompt → Opus. no routing layer.</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* WITH MOOTER */}
          <div className="with">
            <div className="term-label"><span style={{width:8,height:8,borderRadius:'50%',background:'#3D8B5E'}}></span> With mooter</div>
            <div className="term">
              <div className="term-head">
                <div className="dots"><i/><i/><i/></div>
                <div className="title" style={{marginLeft:8}}>mooter · classify → route</div>
                {step >= 0 && (
                  <div style={{marginLeft:'auto', fontSize:10.5, fontFamily:'JetBrains Mono', color:'#6FB28C', fontWeight:700}}>
                    ${mooterTotal.toFixed(3)}
                  </div>
                )}
              </div>
              <div className="term-body" style={{minHeight:170}}>
                {prompts.map((p, i) => !visible(i) ? null : (
                  <React.Fragment key={i}>
                    <div style={{animation: step === i ? 'fadeIn 0.3s ease' : undefined}}>
                      <span className="prompt">$</span> <span className="cmd">{p.cmd}</span>
                    </div>
                    <div>
                      <span className="muted">  {p.mooter.tier} → {p.mooter.model}</span>{' '}
                      <span className={p.mooter.cls}>{p.mooter.cost} · {p.mooter.time}</span>
                    </div>
                    {i < prompts.length - 1 && <div style={{height:6}}/>}
                  </React.Fragment>
                ))}
                {step >= prompts.length - 1 && (
                  <>
                    <div style={{height:10, borderTop:'1px solid #2a241f', marginTop:12, paddingTop:12}}/>
                    <div style={{color:'#6FB28C'}}>● session · 4 prompts · $0.053 · avg 2.5s</div>
                    <div className="rose" style={{fontSize:11, marginTop:4}}>saved $0.137 · 72% · faster on 3 of 4</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* live savings counter — appears as session runs */}
        {step >= 0 && (
          <div style={{
            marginTop: 28,
            display: 'flex',
            justifyContent: 'center',
            gap: 32,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontFamily: 'JetBrains Mono',
            fontSize: 13,
            padding: '18px 24px',
            background: 'var(--beige-card)',
            border: '1px solid var(--beige-line)',
            borderRadius: 12,
            transition: 'all 0.3s',
          }}>
            <div>
              <span className="muted" style={{fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', display:'block', marginBottom:4}}>Without</span>
              <span style={{fontSize:24, fontWeight:700, color:'#B8523F'}}>${opusTotal.toFixed(3)}</span>
            </div>
            <div style={{color:'var(--faint-ink)', fontSize:18}}>→</div>
            <div>
              <span className="muted" style={{fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', display:'block', marginBottom:4}}>With mooter</span>
              <span style={{fontSize:24, fontWeight:700, color:'var(--rose)'}}>${mooterTotal.toFixed(3)}</span>
            </div>
            {savedAmt > 0 && (
              <>
                <div style={{color:'var(--faint-ink)', fontSize:18}}>·</div>
                <div>
                  <span className="muted" style={{fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', display:'block', marginBottom:4}}>Saved</span>
                  <span style={{fontSize:24, fontWeight:700, color:'var(--t0-green)'}}>{savedPct}%</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* static summary when no session run yet */}
        {step < 0 && (
          <div style={{marginTop: 24, display:'flex', justifyContent:'center', gap: 32, alignItems:'center', flexWrap:'wrap', fontFamily:'JetBrains Mono', fontSize:13, opacity:0.6}}>
            <div><span className="muted" style={{fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase'}}>Without</span> <span style={{fontSize:22, fontWeight:600}}>$0.190</span></div>
            <div style={{color:'var(--faint-ink)'}}>→</div>
            <div><span className="muted" style={{fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase'}}>With mooter</span> <span style={{fontSize:22, fontWeight:600, color:'var(--rose)'}}>$0.053</span></div>
            <div style={{color:'var(--faint-ink)'}}>·</div>
            <div style={{color:'var(--t0-green)', fontWeight:700}}>72% saved · click "Run session" ↑</div>
          </div>
        )}
      </div>
    </section>
  );
}

function InstallSection() {
  const [tab, setTab] = React.useState('bash');
  const [copied, setCopied] = React.useState(false);
  const cmds = {
    bash: `bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)`,
    npm:  `npx mooter@latest install`,
  };
  const copy = () => {
    navigator.clipboard?.writeText(cmds[tab]);
    setCopied(true);
    setTimeout(()=>setCopied(false), 1500);
  };
  return (
    <section className="band" id="install">
      <div className="page">
        <div className="section-head">
          <span className="eyebrow">Install</span>
          <h2>Terminal + VS Code. One install.</h2>
          <p className="lede muted">Works on macOS, Windows and Linux. Needs Node.js ≥18 and Claude Code. Under one minute from curl to first routed prompt.</p>
        </div>
        <div className="install-grid">
          <div>
            <div className="tabs">
              <button className={`tab ${tab==='bash'?'active':''}`} onClick={()=>setTab('bash')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                bash
              </button>
              <button className={`tab ${tab==='npm'?'active':''}`} onClick={()=>setTab('npm')}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 10V0h24v10H12v2H7v-2zM1 9h3V2H2v6h1v1zm6-7v9h2V3h2v6h1V2zm7 0v7h3V3h1v6h1V2z"/></svg>
                npm
              </button>
            </div>
            <div className="install-code">
              <button className="copy" onClick={copy}>{copied ? '✓ copied' : 'copy'}</button>
              <span style={{color:'#6FB28C'}}>$</span> {cmds[tab]}
            </div>
            <div className="install-req">
              Requires Node.js ≥18 · Claude Code · curl
            </div>
            <div style={{marginTop: 22, display:'flex', gap: 14, alignItems:'center', flexWrap:'wrap'}}>
              <span style={{fontSize:12, color:'var(--muted-ink)', fontFamily:'JetBrains Mono', letterSpacing:'0.06em', textTransform:'uppercase'}}>Works on</span>
              <div style={{display:'inline-flex', gap:10, alignItems:'center', padding:'8px 14px', background:'var(--beige-card)', border:'1px solid var(--beige-line)', borderRadius:999, fontSize:13}}>
                <Logo name="apple" size={16}/> macOS
              </div>
              <div style={{display:'inline-flex', gap:10, alignItems:'center', padding:'8px 14px', background:'var(--beige-card)', border:'1px solid var(--beige-line)', borderRadius:999, fontSize:13}}>
                <Logo name="windows" size={16}/> Windows
              </div>
              <div style={{display:'inline-flex', gap:10, alignItems:'center', padding:'8px 14px', background:'var(--beige-card)', border:'1px solid var(--beige-line)', borderRadius:999, fontSize:13}}>
                <Logo name="linux" size={16}/> Linux
              </div>
            </div>
          </div>

          <div className="vsc-card">
            <div className="vsc-head">
              <Logo name="vscode" size={28}/>
              <div>
                <div className="title">VS Code Extension</div>
                <div className="sub">statusline · live routing decisions</div>
              </div>
            </div>
            <p style={{margin:0, fontSize:13.5, color:'var(--ink-2)', lineHeight: 1.55}}>
              Real-time statusline showing model, tier, cost and savings for every prompt — without leaving your editor. Also surfaces why the classifier picked the model it picked.
            </p>
            <div style={{display:'flex', gap:10, flexWrap:'wrap', marginTop:'auto'}}>
              <a href="#" className="btn btn-rose">
                <Logo name="vscode" size={14}/>
                Install extension
              </a>
              <a href="#" className="btn btn-secondary">Marketplace</a>
            </div>
            <div style={{fontSize:11, fontFamily:'JetBrains Mono', color:'var(--muted-ink)', letterSpacing:'0.04em'}}>
              v0.9.2 · 14,238 installs · 4.9 ★
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Savings Simulator ──────────────────────────────────────
function Simulator() {
  const d = window.LANDING_DATA;
  const [gpu, setGpu]     = React.useState('rtx4070');
  const [os, setOs]       = React.useState('mac');
  const [sub, setSub]     = React.useState('pro');
  const [prompts, setPrompts] = React.useState(200);

  const gpuObj = d.gpus.find(g => g.id === gpu) || (d.gpusExtended || []).find(g => g.id === gpu) || d.gpus[0];
  const subObj = d.subs.find(s => s.id === sub) || d.subs[0];

  // mix: t0 (local, free), t1 haiku, t2 sonnet, t3 opus
  const t0 = Math.min(0.88, gpuObj.t0Mix);
  const remaining = 1 - t0;
  // of remaining paid: 50% haiku, 35% sonnet, 15% opus
  const t1 = remaining * 0.50;
  const t2 = remaining * 0.35;
  const t3 = remaining * 0.15;

  const pricePer = { t0: 0, t1: 0.001, t2: 0.003, t3: 0.015 };
  const opusAll = 0.015;

  const withoutMonthly = prompts * 30 * opusAll;
  const mooterPerPrompt = t0*pricePer.t0 + t1*pricePer.t1 + t2*pricePer.t2 + t3*pricePer.t3;
  const withMonthly = prompts * 30 * mooterPerPrompt * subObj.mult;

  const saved = withoutMonthly - withMonthly;
  const pct   = Math.round((saved / withoutMonthly) * 100);

  const fmt = (n) => '$' + n.toLocaleString(undefined, {maximumFractionDigits: 0});

  return (
    <section className="band" id="simulator">
      <div className="page">
        <div className="section-head">
          <span className="eyebrow">Savings simulator</span>
          <h2>How much could you save?</h2>
          <p className="lede muted">Pick your hardware, OS and subscription. No signup. We compute the routing mix from your actual setup.</p>
        </div>

        <div className="sim">
          <div className="sim-col">
            <h4>Your setup</h4>

            <div className="sim-group">
              <div className="label">Operating system</div>
              <div className="sim-opts">
                {d.oses.map(o => (
                  <button key={o.id} className={`sim-opt ${os===o.id?'active':''}`} onClick={()=>setOs(o.id)}>
                    <Logo name={o.logo} size={14}/> {o.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="sim-group">
              <div className="label">GPU / accelerator <span style={{color:'var(--faint-ink)', textTransform:'none', letterSpacing:0}}>(popular picks)</span></div>
              <div className="sim-opts">
                {d.gpus.map(g => (
                  <button key={g.id} className={`sim-opt ${gpu===g.id?'active':''}`} onClick={()=>setGpu(g.id)}>
                    {g.brand === 'none'
                      ? <span style={{fontSize:12}}>∅</span>
                      : <Logo name={g.brand} size={14}/>}
                    {g.label}
                  </button>
                ))}
              </div>
              <div style={{marginTop: 10}}>
                <div className="label" style={{marginBottom: 6}}>Other GPU not listed?</div>
                <select
                  className="sim-select"
                  value={(d.gpusExtended || []).some(g => g.id === gpu) ? gpu : ""}
                  onChange={e => e.target.value && setGpu(e.target.value)}
                >
                  <option value="">— Pick another GPU —</option>
                  {(d.gpusExtended || []).map(g => (
                    <option key={g.id} value={g.id}>{g.label} · {g.vram > 0 ? g.vram + ' GB' : 'CPU'}</option>
                  ))}
                </select>
                <div style={{fontSize:10.5, color:'var(--faint-ink)', fontFamily:'JetBrains Mono', marginTop:6, letterSpacing:'0.02em'}}>
                  Don't see yours? Mooter probes any GPU at install — all are supported.
                </div>
              </div>
            </div>

            <div className="sim-group">
              <div className="label">Subscription / CLI</div>
              <div className="sim-opts">
                {d.subs.map(s => (
                  <button key={s.id} className={`sim-opt ${sub===s.id?'active':''}`} onClick={()=>setSub(s.id)}>
                    <Logo name={s.logo} size={12}/> {s.label}
                  </button>
                ))}
              </div>
              <div style={{fontSize:10.5, color:'var(--faint-ink)', fontFamily:'JetBrains Mono', marginTop:6, letterSpacing:'0.02em'}}>
                Claude Code · Codex · Gemini · Copilot · Cursor · Grok — all supported.
              </div>
            </div>

            <div className="sim-group">
              <div className="label">Prompts per day: <strong className="mono" style={{color:'var(--ink)'}}>{prompts}</strong></div>
              <input className="sim-slider" type="range" min="20" max="800" step="10" value={prompts}
                     onChange={e=>setPrompts(+e.target.value)} />
              <div style={{display:'flex', justifyContent:'space-between', fontSize:10.5, color:'var(--faint-ink)', fontFamily:'JetBrains Mono', marginTop:4}}>
                <span>20</span><span>200</span><span>500</span><span>800</span>
              </div>
            </div>
          </div>

          <div className="sim-result">
            <div>
              <div className="row"><span className="k">Without mooter</span><span className="v strike">{fmt(withoutMonthly)}/mo</span></div>
              <div className="row"><span className="k">With mooter</span><span className="v" style={{color:'var(--rose-soft)'}}>{fmt(withMonthly)}/mo</span></div>
              <div className="row"><span className="k">Your GPU mix (T0 local)</span><span className="v">{Math.round(t0*100)}%</span></div>
              <div className="row"><span className="k">Subscription adjustment</span><span className="v">×{subObj.mult.toFixed(2)}</span></div>
            </div>
            <div className="big">
              <div className="k">You save</div>
              <div className="v">{fmt(saved)}<span style={{fontSize:22, color:'var(--rose-soft)', marginLeft:6}}>/mo</span></div>
              <div className="sub">{pct}% reduction · {fmt(saved*12)}/year</div>
            </div>
            <div className="sim-tier-breakdown">
              <div className="k" style={{fontSize:11, color:'#9A9083', textTransform:'uppercase', fontFamily:'JetBrains Mono', letterSpacing:'0.1em', marginBottom:8}}>Routing mix</div>
              <div className="bar">
                <span style={{width: (t0*100)+'%', background:'#3D8B5E'}}/>
                <span style={{width: (t1*100)+'%', background:'#5A9BD4'}}/>
                <span style={{width: (t2*100)+'%', background:'#A88BD4'}}/>
                <span style={{width: (t3*100)+'%', background:'#D46A5A'}}/>
              </div>
              <div className="legend">
                <span><span className="dot" style={{background:'#3D8B5E'}}/>T0 {Math.round(t0*100)}%</span>
                <span><span className="dot" style={{background:'#5A9BD4'}}/>T1 {Math.round(t1*100)}%</span>
                <span><span className="dot" style={{background:'#A88BD4'}}/>T2 {Math.round(t2*100)}%</span>
                <span><span className="dot" style={{background:'#D46A5A'}}/>T3 {Math.round(t3*100)}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { TerminalCompare, InstallSection, Simulator });
