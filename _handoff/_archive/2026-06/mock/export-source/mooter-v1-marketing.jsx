/* Mooter v1 — marketing artboards
   Exposed: HeroArtboard, InstallArtboard, PackBrowserArtboard, MethodologyArtboard */

const {
  MooterMark, PastorCrook, MooEmoji, TierChip, MonoNum, Eyebrow,
  TrafficLights, TerminalCard, StatuslineCard, ProgressBar,
  NavBar, Btn, Card, ProviderLogo, Dotgrid,
} = window;

/* =========================================================
   HERO — "Got Moo?" + terminal + 3-line statusline
   ========================================================= */
function HeroArtboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <NavBar activeKey="how"/>

      <div style={{padding:'72px 64px 56px', maxWidth:1440, margin:'0 auto'}}>
        {/* eyebrow pill */}
        <div style={{display:'flex', gap:10, alignItems:'center', marginBottom:36}}>
          <span style={{
            display:'inline-flex', alignItems:'center', gap:8,
            border:'1px solid var(--border-light)',
            padding:'5px 12px',
            borderRadius:9999,
            fontFamily:'var(--font-mono)', fontSize:11.5, letterSpacing:'0.04em',
            color:'var(--muted)',
          }}>
            <span style={{width:7, height:7, borderRadius:'50%', background:'var(--green)'}}/>
            {`Open source · MIT · ${window.MOOTER_VTAG} · open beta`}
          </span>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:64, alignItems:'start'}}>
          {/* LEFT */}
          <div>
            {/* GOT MOO?  — dominant brand mark */}
            <h1 style={{
              fontFamily:'var(--font-sans)',
              fontWeight:700,
              fontSize: 168,
              lineHeight: 0.92,
              letterSpacing:'-0.055em',
              margin:0,
              color:'var(--text)',
            }}>
              Got Moo<span style={{color:'var(--accent)'}}>?</span>
            </h1>

            {/* one-sentence definition (pillar 1) */}
            <p style={{
              fontFamily:'var(--font-sans)',
              fontSize: 24,
              lineHeight: 1.35,
              letterSpacing:'-0.015em',
              color:'var(--text)',
              maxWidth: 560,
              marginTop: 36,
              marginBottom: 18,
              textWrap:'balance',
            }}>
              The AI shepherd for Claude Code. Routes every prompt across your <span style={{color:'var(--accent)'}}>GPU</span>, your <span style={{color:'var(--accent)'}}>subscriptions</span>, and your <span style={{color:'var(--accent)'}}>local models</span> — Opus quality at Ollama cost.
            </p>

            <p style={{color:'var(--muted)', fontSize:15.5, lineHeight:1.6, maxWidth:540, marginBottom: 32}}>
              Same results. Up to <MonoNum color="var(--text)">90%</MonoNum> less cost. Validated on <MonoNum color="var(--text)">1,437</MonoNum> real prompts from the community.
            </p>

            {/* CTAs */}
            <div style={{display:'flex', gap:12, alignItems:'center', marginBottom: 28}}>
              <Btn kind="primary" size="lg">Install mooter →</Btn>
              <Btn kind="ghost" size="lg" icon={<ProviderLogo name="github" size={14}/>}>Sign in</Btn>
            </div>

            {/* proof line */}
            <div style={{display:'flex', gap:24, flexWrap:'wrap', color:'var(--muted)', fontSize:13}}>
              <span>✓ Hook, not a proxy</span>
              <span>✓ Runs locally</span>
              <span>✓ &lt;<MonoNum color="var(--text)">50ms</MonoNum> overhead</span>
            </div>
          </div>

          {/* RIGHT — terminal + statusline */}
          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            <TerminalCard title="claude · live routing" subtitle={<span style={{color:'var(--tier-2)'}}>T2 sonnet</span>}>
              <div style={{fontSize:13, lineHeight:1.85}}>
                <div style={{color:'var(--term-dim)'}}>$ claude <span style={{color:'var(--accent)'}}>"draft the system map for the auth refactor"</span></div>
                <div style={{color:'var(--term-dim)', marginTop:6}}>  ├─ <span style={{color:'var(--term-fg)'}}>classify</span>  <span style={{color:'var(--green)'}}>14ms</span>  <span style={{opacity:0.5}}>·</span>  intent=<span style={{color:'var(--accent)'}}>arch</span>  complexity=<span style={{color:'var(--tier-2)'}}>med</span></div>
                <div style={{color:'var(--term-dim)'}}>  ├─ <span style={{color:'var(--term-fg)'}}>profile</span>   GPU=<span style={{color:'var(--term-fg)'}}>RTX 4090</span>  sub=<span style={{color:'var(--term-fg)'}}>claude-max</span></div>
                <div style={{color:'var(--term-dim)'}}>  ├─ <span style={{color:'var(--term-fg)'}}>pack</span>      <span style={{color:'var(--accent)'}}>diagram-systems</span>  <span style={{opacity:0.5}}>(trust 98)</span></div>
                <div style={{color:'var(--term-dim)'}}>  └─ <span style={{color:'var(--term-fg)'}}>route</span>     → <span style={{color:'var(--tier-2)'}}>claude-sonnet</span>  <span style={{opacity:0.5}}>(over opus, saves $0.31)</span></div>
                <div style={{marginTop:14, color:'var(--green)'}}>
                  ✓ generating system map…  <span style={{color:'var(--term-dim)'}}>(streamed by sonnet, scaffolded by pack)</span>
                </div>
                <div style={{marginTop:4, color:'var(--term-dim)'}}>
                  <span style={{display:'inline-block', width:7, height:13, background:'var(--accent)', verticalAlign:'middle', animation:'mblink 1.1s steps(2) infinite'}}/>
                </div>
              </div>
            </TerminalCard>

            {/* 3-line statusline */}
            <StatuslineCard/>

            {/* tiny caption */}
            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)', paddingLeft:4}}>
              <span>Smart routing intelligence — two axes: complexity + domain.</span>
            </div>
          </div>
        </div>

        {/* live community pulse strip */}
        <div style={{
          marginTop: 56,
          border:'1px solid var(--border)',
          background:'var(--surface)',
          borderRadius: 14,
          padding: '20px 28px',
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)',
          gap: 24,
        }}>
          {[
            ['prompts routed', '14,231', 'this week'],
            ['avg savings',    '89.9%',  'vs all-Opus'],
            ['$ saved',        '$184K',  'community total'],
            ['active devs',    '247',    'opted-in herd'],
          ].map(([label, num, sub]) => (
            <div key={label}>
              <Eyebrow>{label}</Eyebrow>
              <div style={{fontFamily:'var(--font-mono)', fontSize:30, fontVariantNumeric:'tabular-nums', fontWeight:600, letterSpacing:'-0.02em', marginTop:4}}>{num}</div>
              <div style={{fontSize:12.5, color:'var(--muted)', marginTop:2}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   INSTALL — one command, auto-detect callouts
   ========================================================= */
function InstallArtboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden', padding:'64px 64px'}}>
      <Dotgrid/>
      <div style={{maxWidth: 1100, margin:'0 auto'}}>
        <Eyebrow>§09 · In a nutshell</Eyebrow>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:54, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.05, marginTop:10, marginBottom: 14}}>
          One command.<br/>Your whole stack, herded.
        </h2>
        <p style={{color:'var(--muted)', fontSize:16, maxWidth: 600, lineHeight:1.6, marginBottom:48}}>
          Mooter probes your machine, maps your subscriptions, and writes its hook into Claude Code. No proxies, no MitM, no telemetry by default.
        </p>

        {/* install command + callouts */}
        <div style={{position:'relative', marginBottom: 48}}>
          {/* command block */}
          <div style={{
            background: 'var(--term-bg)',
            border: '1px solid var(--term-border)',
            borderRadius: 14,
            padding: '32px 36px',
            fontFamily:'var(--font-mono)',
            fontSize: 30,
            letterSpacing:'-0.01em',
            color:'var(--term-fg)',
            display:'flex', alignItems:'center', gap:18,
            position:'relative',
            boxShadow:'var(--shadow-md)',
          }}>
            <span style={{color:'var(--accent)'}}>$</span>
            <span>
              <span style={{color:'var(--term-dim)'}}>bash &lt;(curl -fsSL </span>
              <span style={{color:'var(--accent)'}}>https://mooter.ai/install.sh</span>
              <span style={{color:'var(--term-dim)'}}>)</span>
            </span>
            <button style={{
              marginLeft:'auto',
              fontFamily:'var(--font-mono)',
              fontSize:12,
              padding:'8px 14px',
              background:'rgba(255,255,255,0.05)',
              border:'1px solid var(--term-border)',
              borderRadius:6,
              color:'var(--term-fg)',
            }}>copy</button>
          </div>
        </div>

        {/* what it auto-detects — 3 col */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 16, marginBottom: 40}}>
          {[
            {
              title: 'Hardware',
              icon: '◇',
              items: ['GPU (CUDA / Metal)','VRAM ceiling','OS + arch','Ollama runtime'],
              detected: 'RTX 4090 · 24GB',
            },
            {
              title: 'Subscriptions',
              icon: '◈',
              items: ['Anthropic plan + budget','OpenAI plan','Google plan','API keys (optional)'],
              detected: 'Claude Max · 80/wk',
            },
            {
              title: 'Local models',
              icon: '◯',
              items: ['Models in Ollama','Per-model VRAM fit','Pack compatibility','Skip download if present'],
              detected: '8 models found',
            },
          ].map(({title, icon, items, detected}) => (
            <Card key={title} padding={20}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
                <div style={{display:'flex', alignItems:'center', gap:10}}>
                  <span style={{color:'var(--accent)', fontSize:18}}>{icon}</span>
                  <strong style={{fontSize:15, letterSpacing:'-0.01em'}}>{title}</strong>
                </div>
                <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--green)'}}>● live</span>
              </div>
              <ul style={{margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:6}}>
                {items.map(i => (
                  <li key={i} style={{fontSize:13, color:'var(--muted)', display:'flex', gap:8, alignItems:'center'}}>
                    <span style={{color:'var(--green)'}}>✓</span>{i}
                  </li>
                ))}
              </ul>
              <div style={{marginTop:14, padding:'8px 10px', background:'var(--accent-08)', border:'1px solid var(--accent-25)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--accent)'}}>
                detected · {detected}
              </div>
            </Card>
          ))}
        </div>

        {/* verify state */}
        <Card padding={18} style={{display:'flex', alignItems:'center', gap:16}}>
          <span style={{
            width:36, height:36, borderRadius:'50%',
            background:'var(--accent-08)', border:'1px solid var(--accent-25)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <span style={{
              width:8, height:8, borderRadius:'50%', background:'var(--accent)',
              animation:'mpulse 1.6s ease-in-out infinite',
            }}/>
          </span>
          <div style={{flex:1}}>
            <div style={{fontSize:14, fontWeight:600}}>Waiting for mooter to phone home…</div>
            <div style={{fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:2}}>
              ●●●○○  · auth-token: <span style={{color:'var(--accent)'}}>7c81b…42a</span>  ·  install-id: <span style={{color:'var(--accent)'}}>moo_4f2c</span>
            </div>
          </div>
          <Btn kind="ghost" size="sm">Cancel</Btn>
        </Card>

        {/* note */}
        <div style={{marginTop:24, fontSize:12.5, color:'var(--muted)', display:'flex', gap:8, alignItems:'center'}}>
          <span>Your code never leaves your machine. ToS-safe. Hook lives at <span style={{fontFamily:'var(--font-mono)', color:'var(--text)'}}>~/.claude/hooks/mooter.js</span>.</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   PACK BROWSER — gallery + filter
   ========================================================= */
function PackBrowserArtboard() {
  const packs = [
    {name:'diagram-systems', trust:98, installs:'1,247', desc:'ARCH discussions, system maps, Mermaid generation, ADR drafting.', models:'qwen2.5-coder:7b', skills:3, mcps:2, agents:1, saves:87, fit:true, hot:true},
    {name:'code-audit',      trust:94, installs:'892',   desc:'Static review, security patterns, dependency drift checks.',    models:'qwen3:30b',         skills:5, mcps:1, agents:2, saves:81, fit:true},
    {name:'animation-web',   trust:91, installs:'734',   desc:'Framer Motion, CSS keyframes, easing libs, sprite timing.',     models:'qwen2.5-coder:7b', skills:4, mcps:0, agents:1, saves:74, fit:true},
    {name:'data-spreadsheet',trust:88, installs:'612',   desc:'Pandas, SQL, formula audits, ETL prompts, CSV scaffolds.',      models:'qwen3:30b',         skills:6, mcps:3, agents:1, saves:78, fit:true},
    {name:'prd-strategy',    trust:86, installs:'504',   desc:'PRD outlines, RICE scoring, roadmap drafts, OKR tightening.',   models:'sonnet-only',       skills:2, mcps:0, agents:0, saves:62, fit:false},
    {name:'voice-tts',       trust:79, installs:'318',   desc:'Whisper, ElevenLabs scaffolds, transcription pipelines.',       models:'opus-only',         skills:3, mcps:2, agents:0, saves:55, fit:false},
  ];

  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <NavBar activeKey="packs"/>

      <div className="m-pad m-pad-y" style={{padding:'48px 64px', maxWidth:1440, margin:'0 auto'}}>
        <Eyebrow>§05 · Moo Packs</Eyebrow>
        <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginTop: 10, marginBottom:36}}>
          <h2 style={{fontFamily:'var(--font-sans)', fontSize:48, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.05, margin:0, maxWidth: 720}}>
            Tired of which skill, repo, or agent to use? <span style={{color:'var(--muted)'}}>Mooter picks. Packs deliver.</span>
          </h2>
          <Btn kind="rose" size="md">+ Publish a pack</Btn>
        </div>

        <div className="m-stack" style={{display:'grid', gridTemplateColumns:'240px 1fr', gap: 28}}>
          {/* sidebar */}
          <div style={{display:'flex', flexDirection:'column', gap: 20}}>
            <FilterGroup label="Domain" items={['animation-web','code-audit','diagram-systems','data-spreadsheet','prd-strategy','voice-tts','knowledge-third-brain']} active="diagram-systems"/>
            <div>
              <Eyebrow>Trust score</Eyebrow>
              <div style={{marginTop:10, display:'flex', alignItems:'center', gap:10}}>
                <input type="range" defaultValue={75} min={0} max={100} style={{flex:1, accentColor:'var(--accent)'}}/>
                <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--muted)'}}>≥<span style={{color:'var(--text)'}}>75</span></span>
              </div>
            </div>
            <FilterGroup label="Fit" items={['Fits your stack','Needs API only','Needs Ollama','Hardware-bound']} active="Fits your stack" toggles/>
            <div style={{padding:14, background:'var(--accent-08)', border:'1px solid var(--accent-25)', borderRadius:8}}>
              <div style={{fontSize:12.5, color:'var(--accent)', fontWeight:600, marginBottom:6}}>Your stack</div>
              <div style={{fontSize:11.5, color:'var(--muted)', lineHeight:1.6, fontFamily:'var(--font-mono)'}}>
                RTX 4090 · 24GB<br/>
                Claude Max + OpenAI Plus<br/>
                8 Ollama models
              </div>
            </div>
          </div>

          {/* grid */}
          <div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20}}>
              <span style={{fontSize:13.5, color:'var(--muted)'}}><span style={{color:'var(--text)', fontFamily:'var(--font-mono)'}}>6</span> packs match your stack <span style={{color:'var(--muted)'}}>· sorted by trust score</span></span>
              <div style={{display:'flex', gap:8}}>
                <Btn kind="ghost" size="sm">⌄ Most installed</Btn>
                <Btn kind="ghost" size="sm">⊞ Grid</Btn>
              </div>
            </div>

            <div className="m-stack" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 14}}>
              {packs.map(p => <PackCard key={p.name} pack={p}/>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({label, items, active, toggles}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:4}}>
        {items.map(i => (
          <label key={i} style={{display:'flex', alignItems:'center', gap:10, fontSize:13, color: i === active ? 'var(--text)' : 'var(--muted)', cursor:'pointer'}}>
            <span style={{
              width:14, height:14, borderRadius: toggles ? 4 : 3,
              border:'1px solid var(--border-light)',
              background: i === active ? 'var(--accent)' : 'transparent',
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              color:'var(--bg)', fontSize:10,
            }}>{i === active ? '✓' : ''}</span>
            {i}
          </label>
        ))}
      </div>
    </div>
  );
}

function PackCard({pack}) {
  return (
    <Card padding={18} style={{position:'relative', display:'flex', flexDirection:'column', gap:10, minHeight: 280}}>
      {pack.hot && <span style={{position:'absolute', top:14, right:14, fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.1em'}}>◉ trending</span>}
      <div style={{display:'flex', alignItems:'center', gap:10}}>
        <span style={{
          width:32, height:32, borderRadius:8,
          background:'var(--accent-08)', border:'1px solid var(--accent-25)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'var(--font-mono)', color:'var(--accent)', fontWeight:700, fontSize:14,
        }}>{pack.name.slice(0,2)}</span>
        <div>
          <div style={{fontWeight:600, fontSize:14, fontFamily:'var(--font-mono)'}}>{pack.name}</div>
          <div style={{fontSize:11, color:'var(--muted)', display:'flex', gap:8, fontFamily:'var(--font-mono)', marginTop:2}}>
            <span>trust <span style={{color:'var(--green)'}}>{pack.trust}</span></span>
            <span>·</span>
            <span>{pack.installs} installs</span>
          </div>
        </div>
      </div>

      <p style={{fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:'2px 0 0 0'}}>{pack.desc}</p>

      <div style={{display:'flex', gap:10, fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--muted)', flexWrap:'wrap'}}>
        <span>skills <span style={{color:'var(--text)'}}>{pack.skills}</span></span>
        <span>mcps <span style={{color:'var(--text)'}}>{pack.mcps}</span></span>
        <span>agents <span style={{color:'var(--text)'}}>{pack.agents}</span></span>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:10, fontSize:11.5, fontFamily:'var(--font-mono)'}}>
        <ProgressBar value={pack.saves} color="var(--green)" />
        <span style={{color:'var(--muted)'}}><span style={{color:'var(--green)'}}>{pack.saves}%</span> saves vs Opus</span>
      </div>

      <div style={{fontSize:11.5, color: pack.fit ? 'var(--green)' : 'var(--yellow)', fontFamily:'var(--font-mono)', display:'flex', alignItems:'center', gap:6}}>
        {pack.fit ? '✓' : '⚠'} {pack.fit ? 'Fits your stack' : 'Needs API only'} · models <span style={{color:'var(--text)'}}>{pack.models}</span>
      </div>

      <div style={{display:'flex', gap:8, marginTop:'auto'}}>
        <Btn kind="primary" size="sm" style={{flex:1, justifyContent:'center'}}>Install</Btn>
        <Btn kind="ghost" size="sm" style={{flex:1, justifyContent:'center'}}>View</Btn>
      </div>
    </Card>
  );
}

/* =========================================================
   METHODOLOGY — interactive cost calculator
   ========================================================= */
function MethodologyArtboard() {
  // computed inline; the calc is illustrative, not live
  const baseline = 184;
  const withMooter = 19;
  const saved = baseline - withMooter;
  const pct = Math.round((saved / baseline) * 100);

  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <NavBar activeKey="how"/>

      <div style={{padding:'56px 64px', maxWidth:1280, margin:'0 auto'}}>
        <Eyebrow>§11 · Methodology</Eyebrow>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:48, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.05, marginTop:10, marginBottom:14}}>
          We don't hide the math.
        </h2>
        <p style={{color:'var(--muted)', fontSize:16, maxWidth: 740, lineHeight:1.6, marginBottom: 40}}>
          <strong style={{color:'var(--text)'}}>Baseline =</strong> what your prompts would cost on Opus-only. <strong style={{color:'var(--text)'}}>Actual =</strong> what they cost with mooter. <strong style={{color:'var(--text)'}}>Savings =</strong> (baseline − actual) / baseline. Every decision is logged so you can verify.
        </p>

        <div style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:32}}>
          {/* Calculator */}
          <Card padding={28}>
            <Eyebrow>Cost calculator</Eyebrow>
            <h3 style={{fontSize:20, fontWeight:600, letterSpacing:'-0.015em', marginTop:6, marginBottom: 22}}>Tune to your setup</h3>

            <CalcSlider label="Subscription" value="Claude Max" steps={['Free','Pro','Max','API only']} idx={2}/>
            <CalcSlider label="Prompts per day" value="180" steps={['10','50','120','180','300','500']} idx={3} mono/>
            <CalcSlider label="% critical (T3)" value="12%" steps={['0%','6%','12%','20%','30%']} idx={2} mono/>
            <CalcSlider label="Local GPU" value="24GB+" steps={['None','8GB','16GB','24GB+']} idx={3}/>

            <div style={{marginTop: 22, paddingTop:18, borderTop:'1px solid var(--border)', display:'flex', gap:14, fontSize:12, color:'var(--muted)'}}>
              <span>Defaults reflect the median vibe-coder session.</span>
            </div>
          </Card>

          {/* Results */}
          <div style={{display:'flex', flexDirection:'column', gap:16}}>
            <Card padding={24} style={{background:'linear-gradient(135deg, rgba(232,136,138,0.07), transparent 60%)', borderColor:'var(--accent-25)'}}>
              <Eyebrow>Monthly projection</Eyebrow>
              <div style={{display:'flex', gap:24, marginTop:14, marginBottom:6}}>
                <div>
                  <div style={{fontSize:12, color:'var(--muted)'}}>Without mooter</div>
                  <div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, color:'var(--muted)', textDecoration:'line-through', textDecorationColor:'var(--accent)'}}>${baseline}</div>
                </div>
                <div>
                  <div style={{fontSize:12, color:'var(--muted)'}}>With mooter</div>
                  <div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, color:'var(--text)'}}>${withMooter}</div>
                </div>
                <div style={{marginLeft:'auto', textAlign:'right'}}>
                  <div style={{fontSize:12, color:'var(--muted)'}}>Saved</div>
                  <div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:700, color:'var(--green)'}}>${saved}</div>
                  <div style={{fontSize:12, color:'var(--green)', fontFamily:'var(--font-mono)'}}>({pct}%)</div>
                </div>
              </div>
            </Card>

            {/* tier distribution donut (simple css) */}
            <Card padding={22}>
              <Eyebrow>Predicted tier distribution</Eyebrow>
              <div style={{display:'flex', gap:24, alignItems:'center', marginTop:14}}>
                <DonutChart segments={[
                  {color:'var(--tier-0)', value: 52, label:'T0'},
                  {color:'var(--tier-1)', value: 22, label:'T1'},
                  {color:'var(--tier-2)', value: 14, label:'T2'},
                  {color:'var(--tier-3)', value: 12, label:'T3'},
                ]}/>
                <div style={{flex:1, display:'flex', flexDirection:'column', gap:6}}>
                  {[
                    ['T0','tier-0','52%','local — Ollama'],
                    ['T1','tier-1','22%','haiku · gpt-4o-mini'],
                    ['T2','tier-2','14%','sonnet · gpt-4o'],
                    ['T3','tier-3','12%','opus · o1-pro'],
                  ].map(([t, var_, pct, label]) => (
                    <div key={t} style={{display:'flex', alignItems:'center', gap:10, fontSize:12.5}}>
                      <TierChip tier={t}/>
                      <span style={{color:'var(--muted)'}}>{label}</span>
                      <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', color:'var(--text)'}}>{pct}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* benchmark numbers */}
            <Card padding={20}>
              <Eyebrow>Live benchmark · n=1,437 prompts</Eyebrow>
              <div style={{marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12}}>
                {[
                  ['Mooter', '0.09', '96', 'var(--accent)'],
                  ['Sonnet-only', '0.42', '97', 'var(--tier-2)'],
                  ['Opus-only', '0.84', '100', 'var(--tier-3)'],
                ].map(([label, cost, qual, color]) => (
                  <div key={label} style={{textAlign:'center', padding:'12px 8px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:8}}>
                    <div style={{fontSize:11, color:'var(--muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
                    <div style={{fontFamily:'var(--font-mono)', fontSize:22, fontWeight:600, marginTop:4, color}}>${cost}</div>
                    <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>qual <span style={{color:'var(--text)', fontFamily:'var(--font-mono)'}}>{qual}</span></div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:14, fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>
                seed=42 · env_hash=8a1c…f02b · <a style={{color:'var(--accent)', textDecoration:'underline'}}>pre-reg →</a>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalcSlider({label, value, steps, idx, mono}) {
  const pct = (idx / (steps.length - 1)) * 100;
  return (
    <div style={{marginBottom: 22}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
        <span style={{fontSize:13, color:'var(--muted)'}}>{label}</span>
        <span style={{fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize:14, fontWeight: 600, color:'var(--text)'}}>{value}</span>
      </div>
      <div style={{position:'relative', height: 8, background:'var(--bg-2)', borderRadius:9999, border:'1px solid var(--border)'}}>
        <div style={{position:'absolute', left:0, top:0, bottom:0, width: `${pct}%`, background:'var(--accent)', borderRadius:9999}}/>
        <div style={{
          position:'absolute', left: `calc(${pct}% - 8px)`, top:-4,
          width:16, height:16, borderRadius:'50%',
          background:'var(--text)',
          border:'2px solid var(--accent)',
          boxShadow:'var(--shadow-sm)',
        }}/>
      </div>
      <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--muted)'}}>
        {steps.map((s, i) => <span key={s} style={{color: i === idx ? 'var(--accent)' : 'var(--muted)'}}>{s}</span>)}
      </div>
    </div>
  );
}

function DonutChart({segments, size=120}) {
  const total = segments.reduce((a,b) => a + b.value, 0);
  const C = 2 * Math.PI * 42;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{flexShrink:0}}>
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--bg-2)" strokeWidth="14"/>
      {segments.map((s, i) => {
        const dash = (s.value / total) * C;
        const el = <circle key={i} cx="50" cy="50" r="42" fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${dash} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)"/>;
        offset += dash;
        return el;
      })}
      <text x="50" y="48" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fontWeight="600" fill="var(--text)">52%</text>
      <text x="50" y="62" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="var(--muted)">T0</text>
    </svg>
  );
}

Object.assign(window, { HeroArtboard, InstallArtboard, PackBrowserArtboard, MethodologyArtboard });
