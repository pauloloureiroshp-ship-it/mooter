/* Mooter v1 — auth & onboarding artboards
   Exposed: AuthArtboard, OnbStep1, OnbStep2, OnbStep3, OnbStep4, OnbStep5 */

const {
  MooterMark, PastorCrook, MooEmoji, TierChip, MonoNum, Eyebrow,
  TrafficLights, TerminalCard, StatuslineCard, ProgressBar,
  Btn, Card, ProviderLogo, Dotgrid,
} = window;

/* =========================================================
   AUTH — GitHub OAuth landing
   ========================================================= */
function AuthArtboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', minHeight:'100vh', position:'relative', overflowX:'hidden'}}>
      <Dotgrid/>
      {/* top brand */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'24px clamp(20px, 5vw, 40px)', position:'relative', zIndex:1}}>
        <a href={mhref('home')} style={{display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'var(--text)'}}>
          <MooterMark size={26}/>
          <span style={{fontFamily:'var(--font-sans)', fontWeight:600, fontSize:17}}>mooter</span>
        </a>
        <a href={mhref('home')} style={{fontSize:13.5, color:'var(--muted)', textDecoration:'none'}}>← Back to mooter.ai</a>
      </div>

      {/* two-column: sign-in + illustrative teaser. wraps under ~860px. */}
      <div style={{
        display:'flex', flexWrap:'wrap', gap:'clamp(28px, 5vw, 64px)',
        alignItems:'flex-start', justifyContent:'center',
        maxWidth: 1080, margin:'0 auto', padding:'clamp(16px, 4vw, 48px) clamp(20px, 5vw, 40px) 64px',
        position:'relative', zIndex:1,
      }}>
        {/* ── LEFT · sign-in ── */}
        <div style={{flex:'1 1 380px', maxWidth: 460, width:'100%'}}>
          <Card padding={36} style={{background:'var(--surface)', borderColor:'var(--border-light)', boxShadow:'var(--shadow-lg)'}}>
            <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:20}}>
              <MooterMark size={44}/>
              <div>
                <Eyebrow>Sign in</Eyebrow>
                <h2 style={{fontSize:22, fontWeight:700, letterSpacing:'-0.02em', margin:0, marginTop:4}}>Welcome to the herd</h2>
              </div>
            </div>

            {/* offline-first message */}
            <div style={{display:'flex', gap:10, alignItems:'flex-start', padding:'12px 14px', marginBottom:20, background:'var(--accent-06)', border:'1px solid var(--accent-25)', borderRadius:10}}>
              <span style={{color:'var(--green)', fontFamily:'var(--font-mono)', fontSize:13, marginTop:1}}>●</span>
              <p style={{fontSize:13, color:'var(--text)', lineHeight:1.55, margin:0}}>
                <strong style={{fontWeight:600}}>Mooter works fully offline — no account needed.</strong> <span style={{color:'var(--muted)'}}>Sign in only for federated wisdom and cross-device sync.</span>
              </p>
            </div>

            {/* big github cta */}
            <button style={{
              width:'100%', background:'var(--text)', color:'var(--bg)', border:'1px solid var(--text)',
              borderRadius:10, padding:'14px 16px', fontFamily:'var(--font-sans)', fontWeight:600, fontSize:15,
              display:'flex', alignItems:'center', justifyContent:'center', gap:10, cursor:'pointer',
            }}>
              <ProviderLogo name="github" size={18}/>
              Continue with GitHub
            </button>

            <div style={{display:'flex', alignItems:'center', gap:10, margin:'18px 0', color:'var(--muted)', fontSize:11.5, fontFamily:'var(--font-mono)'}}>
              <span style={{flex:1, height:1, background:'var(--border)'}}/>
              <span>OR</span>
              <span style={{flex:1, height:1, background:'var(--border)'}}/>
            </div>

            <Btn kind="ghost" size="md" style={{width:'100%', justifyContent:'center'}}>
              Use an install token →
            </Btn>

            <div style={{marginTop:22, fontSize:11.5, color:'var(--muted)', lineHeight:1.6, fontFamily:'var(--font-mono)'}}>
              By continuing you agree to the <a style={{color:'var(--accent)'}}>terms</a> and acknowledge the <a style={{color:'var(--accent)'}}>privacy policy</a>. Hub uploads stay opt-in.
            </div>
          </Card>

          {/* scopes */}
          <div style={{marginTop:18, display:'flex', flexDirection:'column', gap:6}}>
            <Eyebrow>What we ask GitHub for</Eyebrow>
            {[
              ['read:user', 'Your handle and avatar'],
              ['user:email', 'A way to send your weekly digest'],
              ['—', 'No repo access. No write. No org listing.'],
            ].map(([scope, desc]) => (
              <div key={scope} style={{display:'flex', gap:14, fontSize:12.5}}>
                <span style={{fontFamily:'var(--font-mono)', color:'var(--accent)', minWidth: 84}}>{scope}</span>
                <span style={{color:'var(--muted)'}}>{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT · illustrative dashboard teaser ── */}
        <div style={{flex:'1 1 380px', maxWidth: 460, width:'100%'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
            <Eyebrow>What you unlock when you sync</Eyebrow>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)', border:'1px dashed var(--border-light)', borderRadius:6, padding:'2px 8px'}}>illustrative</span>
          </div>

          <Card padding={22} style={{position:'relative', overflow:'hidden'}}>
            {/* savings */}
            <Eyebrow>Cross-device savings · synced</Eyebrow>
            <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:8}}>
              <span style={{fontFamily:'var(--font-mono)', fontSize:34, fontWeight:700, letterSpacing:'-0.03em', color:'var(--muted)'}}>$<span style={{color:'var(--text)'}}>—</span></span>
              <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--muted)'}}>your number after sign-in</span>
            </div>
            <div style={{marginTop:10, height:8, borderRadius:9999, background:'var(--bg-2)', overflow:'hidden'}}>
              <div style={{width:'47%', height:'100%', background:'linear-gradient(90deg, var(--green), var(--tier-1))', opacity:0.5}}/>
            </div>

            {/* 5h quota forecast */}
            <div style={{marginTop:22, paddingTop:18, borderTop:'1px solid var(--border)'}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <Eyebrow>5-hour quota forecast</Eyebrow>
                <span style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--muted)'}}>resets in ~3h</span>
              </div>
              <div style={{display:'flex', gap:4, marginTop:10}}>
                {Array.from({length: 20}).map((_, i) => (
                  <span key={i} style={{flex:1, height:18, borderRadius:2, background: i < 11 ? 'var(--tier-2)' : 'var(--bg-2)', opacity: i < 11 ? 0.55 : 1}}/>
                ))}
              </div>
              <div style={{marginTop:8, fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--muted)'}}>predicts when you'll hit the wall — before you do</div>
            </div>

            {/* herd */}
            <div style={{marginTop:22, paddingTop:18, borderTop:'1px solid var(--border)'}}>
              <Eyebrow>Your herd</Eyebrow>
              <div style={{display:'flex', alignItems:'center', gap:10, marginTop:10}}>
                <div style={{display:'flex'}}>
                  {['#E8888A','#5A9BD4','#A88BD4','#4CAF6A','#D46A5A'].map((c, i) => (
                    <span key={i} style={{width:28, height:28, borderRadius:'50%', background:'var(--surface)', border:'1px solid var(--border-light)', marginLeft: i ? -8 : 0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12}}>
                      <span style={{width:12, height:12, borderRadius:'50%', background:c, opacity:0.5}}/>
                    </span>
                  ))}
                </div>
                <span style={{fontFamily:'var(--font-mono)', fontSize:12.5, color:'var(--muted)'}}>federated routing wisdom, opt-in</span>
              </div>
            </div>

            {/* veil note */}
            <div style={{marginTop:22, paddingTop:14, borderTop:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.55, display:'flex', gap:8, alignItems:'flex-start'}}>
              <span aria-hidden="true">🐮</span>
              <span>Sample layout — not real data. Your own numbers replace these the moment you sign in. Offline, none of this is needed.</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ONBOARDING SHELL — wraps each step with progress + title
   ========================================================= */
function OnbShell({step, title, sub, children, ctaLabel='Continue →', secondaryLabel='Skip'}) {
  const total = 5;
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden', display:'flex', flexDirection:'column'}}>
      <Dotgrid/>
      {/* top — brand + progress */}
      <div style={{padding:'22px 40px 0', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <MooterMark size={24}/>
          <span style={{fontFamily:'var(--font-sans)', fontWeight:600, fontSize:15.5}}>mooter</span>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--muted)'}}>
          <span>step {step}/{total}</span>
          <span style={{display:'flex', gap:4}}>
            {Array.from({length: total}).map((_, i) => (
              <span key={i} style={{
                width: 22, height: 3, borderRadius:9999,
                background: i + 1 <= step ? 'var(--accent)' : 'var(--border)',
              }}/>
            ))}
          </span>
        </div>
      </div>

      {/* body */}
      <div style={{flex:1, padding:'24px 40px 28px', maxWidth: 900, width:'100%', margin:'0 auto', display:'flex', flexDirection:'column'}}>
        <div style={{marginTop: 18, marginBottom: 22}}>
          <Eyebrow>onboarding · {step} of {total}</Eyebrow>
          <h2 style={{fontSize: 34, fontWeight:700, letterSpacing:'-0.03em', lineHeight:1.08, marginTop:8, marginBottom:6}}>{title}</h2>
          {sub && <p style={{color:'var(--muted)', fontSize:15, lineHeight:1.55, maxWidth:620, margin:0}}>{sub}</p>}
        </div>
        <div style={{flex:1}}>{children}</div>
      </div>

      {/* footer ctas */}
      <div style={{borderTop:'1px solid var(--border)', padding:'18px 40px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--bg-2)'}}>
        <Btn kind="ghost" size="md">← Back</Btn>
        <div style={{display:'flex', gap:10}}>
          <Btn kind="ghost" size="md">{secondaryLabel}</Btn>
          <Btn kind="primary" size="md">{ctaLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---- Step 1: hardware probe (animated terminal) ---- */
function OnbStep1() {
  return (
    <OnbShell step={1} title="Scanning your machine…" sub="Mooter probes your GPU, OS, Ollama install and local models. Your filesystem is read once; nothing leaves your machine.">
      <TerminalCard title="mooter · install probe">
        <div style={{fontSize:13.5, lineHeight:1.9}}>
          {[
            ['> Scanning your machine...', 'var(--term-dim)', null],
            ['✓ macOS 15.4 detected',     'var(--green)',   '14ms'],
            ['✓ Apple M3 Max · 36GB unified', 'var(--green)', '22ms'],
            ['✓ Ollama running on :11434', 'var(--green)',  '8ms'],
            ['✓ 8 local models found',     'var(--green)',  '47ms'],
          ].map(([line, color, ms]) => (
            <div key={line} style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
              <span style={{color}}>{line}</span>
              {ms && <span style={{color:'var(--term-dim)', fontSize:11}}>{ms}</span>}
            </div>
          ))}
          <div style={{marginTop:10, paddingLeft:18, color:'var(--term-dim)', fontSize:12.5}}>
            qwen2.5-coder:7b<br/>
            qwen3:30b<br/>
            deepseek-coder:6.7b<br/>
            llama3.2:3b · 8b · 70b<br/>
            phi3.5:3.8b · gemma2:9b
          </div>
          <div style={{marginTop:16, padding:'10px 12px', background:'rgba(76,175,106,0.07)', border:'1px solid rgba(76,175,106,0.25)', borderRadius:6}}>
            <div style={{color:'var(--green)', fontSize:13}}>Looks good. Got Moo? <span style={{color:'var(--accent)'}}>?</span></div>
            <div style={{color:'var(--term-dim)', fontSize:11.5, marginTop:4}}>
              estimated VRAM ceiling: <span style={{color:'var(--text)'}}>36GB</span>  ·  T0 capability: <span style={{color:'var(--green)'}}>high</span>  ·  classifier latency: <span style={{color:'var(--text)'}}>{'<'}50ms</span>
            </div>
          </div>
        </div>
      </TerminalCard>

      <div style={{marginTop:18, display:'flex', gap:12, fontSize:12.5, color:'var(--muted)', flexWrap:'wrap'}}>
        <span style={{display:'flex', alignItems:'center', gap:6}}>Probe is read-only. No telemetry sent.</span>
        <span>·</span>
        <a style={{color:'var(--accent)'}}>What does mooter scan? →</a>
      </div>
    </OnbShell>
  );
}

/* ---- Step 2: subscription mapping ---- */
function OnbStep2() {
  const providers = [
    {name:'Anthropic', logo:'anthropic', tiers:['Free','Pro','Max','Team','API only'], active: 'Max'},
    {name:'OpenAI',    logo:'openai',    tiers:['Free','Plus','Codex','API only','None'], active: 'Plus'},
    {name:'Google',    logo:'google',    tiers:['Free','Advanced','Ultra','API only','None'], active: 'None'},
  ];
  return (
    <OnbShell step={2} title="Map your subscriptions" sub="Mooter routes inside the plans you already pay for. Pick what you have — you can change this anytime.">
      <div style={{display:'flex', flexDirection:'column', gap:14}}>
        {providers.map(p => (
          <Card key={p.name} padding={18}>
            <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:14}}>
              <span style={{
                width:34, height:34, borderRadius:8,
                background:'var(--bg-2)', border:'1px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--text)',
              }}>
                <ProviderLogo name={p.logo} size={18}/>
              </span>
              <strong style={{fontSize:15, letterSpacing:'-0.01em'}}>{p.name}</strong>
              <span style={{marginLeft:'auto', fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>
                {p.active === 'None' ? 'skip' : `selected · ${p.active}`}
              </span>
            </div>
            <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
              {p.tiers.map(t => {
                const sel = t === p.active;
                return (
                  <span key={t} style={{
                    fontFamily:'var(--font-sans)', fontSize:13, fontWeight:500,
                    padding:'8px 14px',
                    borderRadius: 9999,
                    border:`1px solid ${sel ? 'var(--accent)' : 'var(--border-light)'}`,
                    background: sel ? 'var(--accent-12)' : 'transparent',
                    color: sel ? 'var(--accent)' : 'var(--muted)',
                    cursor:'pointer',
                  }}>{t}</span>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <div style={{marginTop:16, fontSize:12.5, color:'var(--muted)', display:'flex', alignItems:'center', gap:8}}>
        We never see your keys. Tier hints only influence routing, not auth.
      </div>
    </OnbShell>
  );
}

/* ---- Step 3: pack recommendations ---- */
function OnbStep3() {
  const recs = [
    {name:'diagram-systems', trust:98, desc:'ARCH discussions, system maps, Mermaid generation, ADR drafting.', fit:'Qwen2.5 detected · fits 24GB ceiling', save:73, selected:true},
    {name:'code-audit',      trust:94, desc:'Static review, security patterns, dependency drift checks.',     fit:'Qwen3-30b detected · DoRA ready',     save:81, selected:true},
    {name:'animation-web',   trust:91, desc:'Framer Motion, CSS keyframes, easing libs, sprite timing.',     fit:'Qwen2.5-coder fits',                  save:74, selected:false},
  ];
  return (
    <OnbShell step={3} title="Mooter picked 3 packs for your stack" sub="Each pack bundles skills, MCPs and agents per domain — pre-mapped to models your hardware can run. Install all, some, or none.">
      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        {recs.map(p => (
          <Card key={p.name} padding={18} style={{borderColor: p.selected ? 'var(--accent-25)' : 'var(--border)', background: p.selected ? 'var(--accent-08)' : 'var(--surface)'}}>
            <div style={{display:'flex', alignItems:'center', gap:14}}>
              <span style={{
                width:36, height:36, borderRadius:8,
                background:'var(--accent-08)', border:'1px solid var(--accent-25)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontFamily:'var(--font-mono)', color:'var(--accent)', fontWeight:700, fontSize:14,
              }}>{p.name.slice(0,2)}</span>
              <div style={{flex:1}}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <strong style={{fontFamily:'var(--font-mono)', fontSize:14}}>{p.name}</strong>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--green)'}}>trust {p.trust}</span>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)'}}>· saves ~<span style={{color:'var(--green)'}}>{p.save}%</span> vs all-Opus</span>
                </div>
                <p style={{margin:'4px 0 0 0', fontSize:13, color:'var(--muted)', lineHeight:1.5}}>{p.desc}</p>
                <div style={{marginTop:6, fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--green)'}}>✓ {p.fit}</div>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:6, minWidth: 120}}>
                <Btn kind={p.selected ? 'rose' : 'ghost'} size="sm" style={{justifyContent:'center'}}>{p.selected ? '✓ Selected' : '+ Add'}</Btn>
                <a style={{fontSize:11.5, color:'var(--muted)', textAlign:'center'}}>View manifest →</a>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{marginTop:16, display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:13, color:'var(--muted)'}}>
        <span><MonoNum color="var(--text)">2</MonoNum> packs selected · est. install <MonoNum color="var(--text)">~2 min</MonoNum> · adds <MonoNum color="var(--green)">~$5.20/mo</MonoNum> in expected savings</span>
        <a style={{color:'var(--accent)'}}>Browse all packs →</a>
      </div>
    </OnbShell>
  );
}

/* ---- Step 4: install command + verify ---- */
function OnbStep4() {
  return (
    <OnbShell step={4} title="Run this in your terminal" sub="Mooter will hook into Claude Code, write its config, and verify the connection. Then we'll pick up automatically." ctaLabel="Waiting…" secondaryLabel="Open docs">
      <div style={{
        background: 'var(--term-bg)',
        border: '1px solid var(--term-border)',
        borderRadius: 12,
        padding: '28px 32px',
        fontFamily:'var(--font-mono)',
        fontSize: 24,
        color:'var(--term-fg)',
        display:'flex', alignItems:'center', gap:14,
        boxShadow:'var(--shadow-md)',
      }}>
        <span style={{color:'var(--accent)'}}>$</span>
        <span><span style={{color:'var(--term-dim)'}}>bash &lt;(curl -fsSL </span><span style={{color:'var(--accent)'}}>https://mooter.ai/install.sh</span><span style={{color:'var(--term-dim)'}}>)</span></span>
        <button style={{
          marginLeft:'auto',
          fontFamily:'var(--font-mono)', fontSize:11.5,
          padding:'7px 12px',
          background:'rgba(255,255,255,0.05)',
          border:'1px solid var(--term-border)',
          borderRadius:6,
          color:'var(--term-fg)',
        }}>copy</button>
      </div>

      {/* live verification block */}
      <Card padding={18} style={{marginTop: 20}}>
        <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:14}}>
          <span style={{
            width:38, height:38, borderRadius:'50%',
            background:'var(--accent-08)', border:'1px solid var(--accent-25)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <span style={{width:9, height:9, borderRadius:'50%', background:'var(--accent)', animation:'mpulse 1.4s ease-in-out infinite'}}/>
          </span>
          <div style={{flex:1}}>
            <div style={{fontSize:14, fontWeight:600}}>Waiting for mooter to phone home…</div>
            <div style={{fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:2}}>
              ●●●○○  · install-id <span style={{color:'var(--accent)'}}>moo_4f2c</span>  · expires in <span style={{color:'var(--text)'}}>9:42</span>
            </div>
          </div>
        </div>
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {[
            ['✓','Downloaded installer · 4.2MB','done'],
            ['✓','Wrote hook to ~/.claude/hooks/mooter.js','done'],
            ['◌','Registering install with hub','live'],
            ['○','First decision logged','pending'],
            ['○','Statusline rendered','pending'],
          ].map(([icon, label, state]) => (
            <div key={label} style={{
              display:'flex', gap:10, alignItems:'center',
              fontFamily:'var(--font-mono)', fontSize:12.5,
              color: state === 'done' ? 'var(--green)' : state === 'live' ? 'var(--accent)' : 'var(--muted)',
            }}>
              <span style={{width:14, textAlign:'center'}}>{icon}</span>
              <span style={{color: state === 'pending' ? 'var(--muted)' : 'var(--text)'}}>{label}</span>
            </div>
          ))}
        </div>
      </Card>
    </OnbShell>
  );
}

/* ---- Step 5: confirmation + statusline preview ---- */
function OnbStep5() {
  return (
    <OnbShell step={5} title="You're all set. Mooter's routing." sub="Open Claude Code and try a prompt. The statusline below is what you'll see in your terminal." ctaLabel="Go to dashboard →" secondaryLabel="Open Claude Code">
      <div style={{display:'flex', flexDirection:'column', gap:18}}>
        {/* statusline preview rendered with their profile */}
        <div>
          <Eyebrow>Your statusline · live</Eyebrow>
          <div style={{marginTop:8}}>
            <StatuslineCard/>
          </div>
        </div>

        {/* perfect-match summary */}
        <Card padding={20} style={{background:'linear-gradient(135deg, rgba(232,136,138,0.08), transparent 60%)', borderColor:'var(--accent-25)'}}>
          <Eyebrow>The match Mooter built for you</Eyebrow>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:18, marginTop:14}}>
            {[
              ['Hardware', 'Apple M3 Max', '36GB unified · 8 Ollama models'],
              ['Subscriptions', 'Claude Max + GPT Plus', '~80 sessions/wk allowance'],
              ['Packs', '2 installed', 'diagram-systems · code-audit'],
            ].map(([label, primary, secondary]) => (
              <div key={label}>
                <div style={{fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                <div style={{fontSize:15, fontWeight:600, marginTop:4, color:'var(--text)'}}>{primary}</div>
                <div style={{fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:2}}>{secondary}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* try a prompt */}
        <Card padding={18}>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:10}}>
            <strong style={{fontSize:14}}>Try a prompt</strong>
            <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)'}}>copy to terminal</span>
          </div>
          <div style={{
            background:'var(--term-bg)', border:'1px solid var(--term-border)', borderRadius:8,
            padding:'12px 14px', fontFamily:'var(--font-mono)', fontSize:13.5,
          }}>
            <span style={{color:'var(--accent)'}}>$</span> <span style={{color:'var(--term-fg)'}}>claude </span><span style={{color:'var(--accent)'}}>"draft a system map for the auth refactor"</span>
          </div>
          <div style={{marginTop:8, fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>
            Expected route: <TierChip tier="T2"/> sonnet via <span style={{color:'var(--accent)'}}>diagram-systems</span> · estimated savings <span style={{color:'var(--green)'}}>$0.31</span>
          </div>
        </Card>
      </div>
    </OnbShell>
  );
}

Object.assign(window, { AuthArtboard, OnbStep1, OnbStep2, OnbStep3, OnbStep4, OnbStep5 });
