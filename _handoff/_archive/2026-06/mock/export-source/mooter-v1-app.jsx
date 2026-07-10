/* Mooter v1 — app surfaces
   Exposed: DashboardArtboard, SettingsArtboard */

const {
  MooterMark, PastorCrook, MooEmoji, TierChip, MonoNum, Eyebrow,
  TrafficLights, TerminalCard, StatuslineCard, ProgressBar,
  Btn, Card, ProviderLogo, Dotgrid,
} = window;

/* ---------- shared app shell ---------- */
function AppShell({activeKey, children}) {
  const nav = [
    ['dashboard','Dashboard','◆'],
    ['packs','Packs','◇'],
    ['forge','Forge','✦'],
    ['digest','Digest','◐'],
    ['community','Community','⌬'],
    ['settings','Settings','⚙'],
  ];
  const [collapsed, setCollapsed] = React.useState(() => {
    try { return localStorage.getItem('mooter-sidebar-collapsed') === '1'; } catch (e) { return false; }
  });
  const toggle = () => setCollapsed(c => {
    const n = !c;
    try { localStorage.setItem('mooter-sidebar-collapsed', n ? '1' : '0'); } catch (e) {}
    return n;
  });
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', display:'flex', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      {/* sidebar */}
      <aside style={{
        width: collapsed ? 66 : 220,
        borderRight:'1px solid var(--border)',
        background:'var(--bg-2)',
        padding: collapsed ? '22px 12px' : '22px 18px',
        display:'flex', flexDirection:'column',
        position:'relative',
        zIndex: 1,
        transition:'width .2s ease, padding .2s ease',
      }}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom: 24, justifyContent: collapsed ? 'center' : 'flex-start'}}>
          <MooterMark size={26}/>
          {!collapsed && <span style={{fontFamily:'var(--font-sans)', fontWeight:600, fontSize:16}}>mooter</span>}
          {!collapsed && <span style={{marginLeft:'auto', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', padding:'2px 6px', border:'1px solid var(--border)', borderRadius:9999}}>{window.MOOTER_VSHORT}</span>}
        </div>

        {/* collapse toggle + ⌘K hint */}
        <button onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={{
          display:'flex', alignItems:'center', justifyContent: collapsed ? 'center' : 'space-between', gap:8,
          padding:'7px 10px', marginBottom:14, cursor:'pointer',
          background:'transparent', border:'1px solid var(--border)', borderRadius:7,
          color:'var(--muted)', fontFamily:'var(--font-mono)', fontSize:11.5,
        }}>
          {!collapsed && <span>⌘K to search</span>}
          <span style={{fontSize:13}}>{collapsed ? '»' : '«'}</span>
        </button>

        <nav style={{display:'flex', flexDirection:'column', gap:2}}>
          {nav.map(([k, label, icon]) => {
            const active = k === activeKey;
            return (
              <a key={k} href={mhref(k) || '#'} title={collapsed ? label : undefined} style={{
                display:'flex', alignItems:'center', gap:11,
                padding:'9px 12px',
                borderRadius:7,
                fontSize:13.5,
                color: active ? 'var(--text)' : 'var(--muted)',
                background: active ? 'var(--surface)' : 'transparent',
                border: active ? '1px solid var(--border-light)' : '1px solid transparent',
                fontWeight: active ? 600 : 500,
                textDecoration:'none',
                cursor:'pointer',
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}>
                <span style={{color: active ? 'var(--accent)' : 'var(--muted)', width:14, textAlign:'center'}}>{icon}</span>
                {!collapsed && label}
              </a>
            );
          })}
        </nav>

        <div style={{marginTop:'auto', paddingTop:18, borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex', alignItems:'center', gap:10, justifyContent: collapsed ? 'center' : 'flex-start'}}>
            <span style={{width:30, height:30, borderRadius:'50%', background:'var(--accent-12)', border:'1px solid var(--accent-25)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--accent)', fontFamily:'var(--font-mono)', fontWeight:700, fontSize:13, flexShrink:0}}>P</span>
            {!collapsed && <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:12.5, fontWeight:600}}>paulo</div>
              <div style={{fontSize:11, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>claude max</div>
            </div>}
            {!collapsed && <span style={{color:'var(--muted)', fontSize:14}}>⋯</span>}
          </div>
        </div>
      </aside>

      <main style={{flex:1, padding:'28px 36px', overflow:'hidden', position:'relative', zIndex: 1}}>
        {children}
      </main>
    </div>
  );
}

/* =========================================================
   DASHBOARD HOME
   ========================================================= */
function DashboardArtboard() {
  return (
    <AppShell activeKey="dashboard">
      {/* header */}
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:24}}>
        <div>
          <Eyebrow>Good evening, paulo</Eyebrow>
          <h2 style={{fontSize:30, fontWeight:700, letterSpacing:'-0.03em', margin:'6px 0 0 0'}}>Your router's been busy. Got savings.</h2>
        </div>
        <div style={{display:'flex', gap:10}}>
          <Btn kind="ghost" size="md">Open digest</Btn>
          <Btn kind="primary" size="md">Train adapter</Btn>
        </div>
      </div>

      {/* caption — honest single-dev framing */}
      <div style={{marginBottom:16, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:8}}>
        <span aria-hidden="true">🐮</span>
        <span>Live data from 1 dev (Paulo). Community aggregate goes live soon.</span>
      </div>

      {/* top row: alltime hero + stats stack */}
      <div className="m-stack" style={{display:'grid', gridTemplateColumns:'1.7fr 1fr', gap:16, marginBottom:16}}>
        {/* hero savings widget — real alltime */}
        <Card padding={24} style={{background:'linear-gradient(135deg, rgba(232,136,138,0.07), transparent 60%)', borderColor:'var(--accent-25)', position:'relative'}}>
          <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
            <div>
              <Eyebrow>Saved alltime · vs all-Opus</Eyebrow>
              <div style={{display:'flex', alignItems:'baseline', gap:14, marginTop:8}}>
                <span style={{fontFamily:'var(--font-mono)', fontSize:54, fontWeight:700, letterSpacing:'-0.03em', color:'var(--green)'}}>$25.95</span>
                <span style={{fontFamily:'var(--font-mono)', fontSize:14, color:'var(--muted)'}}>across <MonoNum color="var(--text)">658</MonoNum> routed calls</span>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:10, marginTop:6}}>
                <ProgressBar value={47} color="var(--green)" />
                <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--green)'}}>47% saved</span>
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <Eyebrow>this week · 7d</Eyebrow>
              <div style={{fontFamily:'var(--font-mono)', fontSize:15, fontWeight:600, color:'var(--muted)', marginTop:8}}>live soon</div>
              <div style={{fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:2}}>weekly slice soon</div>
            </div>
          </div>

          {/* installed packs (real) */}
          <div style={{marginTop:28}}>
            <Eyebrow>installed packs · 3</Eyebrow>
            <div style={{display:'flex', gap:10, marginTop:10, flexWrap:'wrap'}}>
              {['data-spreadsheet','diagram-systems','voice'].map(p => (
                <span key={p} style={{fontFamily:'var(--font-mono)', fontSize:12.5, color:'var(--accent)', background:'var(--accent-08)', border:'1px solid var(--accent-25)', borderRadius:7, padding:'6px 12px'}}>{p}</span>
              ))}
            </div>
          </div>
        </Card>

        {/* right column stats */}
        <div style={{display:'flex', flexDirection:'column', gap:12}}>
          <Card padding={16}>
            <Eyebrow>Calls routed · alltime</Eyebrow>
            <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:8}}>
              <span style={{fontFamily:'var(--font-mono)', fontSize:24, fontWeight:600}}>658</span>
              <span style={{fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>single dev</span>
            </div>
            <div style={{fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:10}}>per-tier breakdown <span style={{color:'var(--text)'}}>live soon</span></div>
          </Card>

          <Card padding={16}>
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
              <Eyebrow>Adapter · Forge</Eyebrow>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)'}}>◌ idle</span>
            </div>
            <div style={{fontSize:13.5, marginTop:8, lineHeight:1.5}}>Local adapter training</div>
            <div style={{fontSize:12, color:'var(--muted)', marginTop:2}}>Ships with <MonoNum color="var(--text)">Wave 5</MonoNum> · DoRA r=32, ToS-safe</div>
            <Btn kind="rose" size="sm" style={{marginTop:12, width:'100%', justifyContent:'center'}}>Coming Wave 5</Btn>
          </Card>

          <Card padding={16}>
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between'}}>
              <Eyebrow>Plan · Claude Max</Eyebrow>
              <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--green)'}}>● ok</span>
            </div>
            <div style={{marginTop:10, fontFamily:'var(--font-mono)', fontSize:13, color:'var(--muted)'}}>
              5h-window usage <span style={{color:'var(--text)'}}>live soon</span>
            </div>
            <div style={{fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:6}}>quota forecast soon</div>
          </Card>
        </div>
      </div>

      {/* recent sessions — honest soon state */}
      <Card padding={0} style={{overflow:'hidden'}}>
        <div style={{padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)'}}>
          <div>
            <Eyebrow>Recent sessions</Eyebrow>
            <div style={{fontSize:14, fontWeight:600, marginTop:2}}>Per-session history</div>
          </div>
          <span style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--muted)'}}>live soon</span>
        </div>
        <div style={{padding:'40px 20px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <span style={{width:9, height:9, borderRadius:'50%', background:'var(--yellow)', animation:'mpulse 1.8s ease-in-out infinite'}}/>
          <div style={{fontSize:13.5, color:'var(--text)'}}>Session-by-session replay lands soon.</div>
          <div style={{fontSize:12, color:'var(--muted)', maxWidth:440, lineHeight:1.55}}>Until then the alltime numbers above are the real ones — <span style={{color:'var(--text)'}}>658</span> calls, <span style={{color:'var(--green)'}}>$25.95</span> saved, <span style={{color:'var(--text)'}}>47%</span> vs all-Opus.</div>
        </div>
      </Card>
    </AppShell>
  );
}

function SavingsSparkline({values, max}) {
  const days = ['M','T','W','T','F','S','S'];
  return (
    <div style={{display:'grid', gridTemplateColumns:`repeat(${values.length}, 1fr)`, gap: 8, marginTop:10, alignItems:'end'}}>
      {values.map((v, i) => {
        const h = Math.round((v / max) * 110);
        return (
          <div key={i} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6}}>
            <div style={{width:'100%', height:120, display:'flex', alignItems:'flex-end'}}>
              <div style={{width:'100%', height:h, background:'linear-gradient(180deg, var(--accent), rgba(232,136,138,0.2))', borderRadius:'6px 6px 0 0', position:'relative'}}>
                {i === 3 && (
                  <div style={{position:'absolute', top:-20, left:'50%', transform:'translateX(-50%)', fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent)', whiteSpace:'nowrap'}}>${v.toFixed(2)}</div>
                )}
              </div>
            </div>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--muted)'}}>{days[i]}</span>
            <span style={{fontFamily:'var(--font-mono)', fontSize:10, color: i === 3 ? 'var(--accent)' : 'var(--muted)'}}>{v.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* =========================================================
   SETTINGS — opt-in matrix, sub config, statusline preview
   ========================================================= */
function SettingsArtboard() {
  return (
    <AppShell activeKey="settings">
      <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:24}}>
        <div>
          <Eyebrow>Settings</Eyebrow>
          <h2 style={{fontSize:30, fontWeight:700, letterSpacing:'-0.03em', margin:'6px 0 0 0'}}>Tune your router</h2>
        </div>
        <div style={{display:'flex', gap:10}}>
          <Btn kind="ghost" size="md">Re-run hardware probe</Btn>
          <Btn kind="ghost" size="md">Export config</Btn>
        </div>
      </div>

      {/* layout: 2-col sticky aside + main */}
      <div style={{display:'grid', gridTemplateColumns:'190px 1fr', gap:24}}>
        {/* in-page nav */}
        <nav style={{display:'flex', flexDirection:'column', gap:2, position:'sticky', top:0, alignSelf:'start'}}>
          {[
            ['Profile','active'],
            ['Subscriptions',''],
            ['Hub & telemetry',''],
            ['Statusline',''],
            ['Forge',''],
            ['Hardware',''],
            ['Danger zone','danger'],
          ].map(([label, state]) => (
            <a key={label} style={{
              padding:'7px 11px', borderRadius:6, fontSize:13,
              color: state === 'active' ? 'var(--text)' : state === 'danger' ? 'var(--tier-3)' : 'var(--muted)',
              background: state === 'active' ? 'var(--surface)' : 'transparent',
              borderLeft: state === 'active' ? '2px solid var(--accent)' : '2px solid transparent',
              fontWeight: state === 'active' ? 600 : 500,
            }}>{label}</a>
          ))}
        </nav>

        <div style={{display:'flex', flexDirection:'column', gap:16}}>
          {/* opt-in matrix — the most important block */}
          <Card padding={22}>
            <div style={{marginBottom:18}}>
              <Eyebrow>Hub & telemetry · all opt-in</Eyebrow>
              <h3 style={{fontSize:18, fontWeight:600, letterSpacing:'-0.015em', marginTop:6, marginBottom:6}}>What leaves your machine</h3>
              <p style={{fontSize:13, color:'var(--muted)', lineHeight:1.6, maxWidth: 660, margin:0}}>
                Every toggle is off by default. Hub uploads use k-anonymity ≥<MonoNum color="var(--text)">50</MonoNum> and differential privacy noise ε=<MonoNum color="var(--text)">1.0</MonoNum>.
              </p>
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:1, borderRadius:10, overflow:'hidden', border:'1px solid var(--border)'}}>
              {[
                {label:'Telemetry · routing decisions',     desc:'Anonymous tier + latency + classifier outcome. Drives the savings chart.', on:true, badge:'recommended'},
                {label:'Hub upload · regex patterns',        desc:'Helps the community classifier improve. Strict k-anonymity.',              on:true},
                {label:'Hub upload · pack feedback',         desc:'Trust score updates and quality regression flags.',                         on:true},
                {label:'Forge · self-distillation training', desc:'Trains LoRA adapters on your repo. Code never leaves the machine.',         on:false, badge:'wave 5'},
                {label:'Weekly digest email',                desc:'A summary on Sundays. Easy to unsubscribe.',                                on:true},
                {label:'Leaderboard appearance',             desc:'Show your rank on the community page. Pseudonymous.',                       on:false},
              ].map((opt, i) => (
                <div key={i} style={{display:'flex', alignItems:'center', gap:18, padding:'14px 18px', background:'var(--surface)', borderBottom: i < 5 ? '1px solid var(--border)' : 'none'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <strong style={{fontSize:13.5, color:'var(--text)'}}>{opt.label}</strong>
                      {opt.badge && <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.08em'}}>· {opt.badge}</span>}
                    </div>
                    <div style={{fontSize:12, color:'var(--muted)', marginTop:3}}>{opt.desc}</div>
                  </div>
                  <Toggle on={opt.on}/>
                </div>
              ))}
            </div>
          </Card>

          {/* what we collect — expandable trust card */}
          <Card padding={22}>
            <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
              <span style={{color:'var(--accent)', fontSize:14}}>▾</span>
              <Eyebrow>What mooter collects when you opt-in</Eyebrow>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
              <div>
                <div style={{fontSize:12.5, fontWeight:600, color:'var(--green)', marginBottom:8, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em'}}>We collect <span style={{color:'var(--muted)'}}>· k-anon ≥50</span></div>
                <ul style={{margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:6}}>
                  {[
                    ['Prompt SHA-256 hash', 'NOT prompt text'],
                    ['Tier chosen + cost', 'NOT model response'],
                    ['Pack used + confidence', 'NOT pack contents'],
                    ['Latency in ms', 'NOT request payload'],
                    ['/mooter rate · thumb + sentiment', 'NOT full comment text'],
                  ].map(([what, not]) => (
                    <li key={what} style={{fontSize:12.5, color:'var(--text)', display:'flex', flexDirection:'column'}}>
                      <span style={{display:'flex', alignItems:'center', gap:6}}><span style={{color:'var(--green)'}}>✓</span>{what}</span>
                      <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)', paddingLeft:18}}>{not}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div style={{fontSize:12.5, fontWeight:600, color:'var(--tier-3)', marginBottom:8, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em'}}>We never collect</div>
                <ul style={{margin:0, padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:6}}>
                  {[
                    'Your code · any part, any form',
                    'Your prompts · text, screenshots, partial',
                    'Model responses',
                    'Personal identifiers · IP ≤7 days, anonymized',
                    'Repository URLs or commit messages',
                    'File paths or directory structures',
                  ].map(item => (
                    <li key={item} style={{fontSize:12.5, color:'var(--text)', display:'flex', alignItems:'center', gap:6}}>
                      <span style={{color:'var(--tier-3)'}}>✗</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{marginTop:16, padding:'10px 12px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:6, fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--muted)'}}>
              Revoke anytime · <span style={{color:'var(--accent)'}}>/mooter share OFF</span> · or delete <span style={{color:'var(--text)'}}>~/.mooter/consent.json</span>
            </div>
          </Card>

          {/* statusline preview */}
          <Card padding={22}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
              <div>
                <Eyebrow>Statusline preview</Eyebrow>
                <h3 style={{fontSize:17, fontWeight:600, letterSpacing:'-0.015em', marginTop:6, marginBottom:0}}>How it'll render in Claude Code</h3>
              </div>
              <div style={{display:'flex', gap:6}}>
                {['Healthy','Marginal','Broken'].map((s, i) => (
                  <button key={s} style={{
                    padding:'6px 10px', fontSize:11.5, fontFamily:'var(--font-mono)',
                    background: i === 0 ? 'var(--accent-12)' : 'transparent',
                    color: i === 0 ? 'var(--accent)' : 'var(--muted)',
                    border: `1px solid ${i === 0 ? 'var(--accent-25)' : 'var(--border)'}`,
                    borderRadius:6, cursor:'pointer',
                  }}>{s}</button>
                ))}
              </div>
            </div>
            <StatuslineCard state="healthy"/>
            <div style={{marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10}}>
              {[
                ['Width', '≥120 cols', '3 lines'],
                ['Refresh', 'per-prompt', 'on hook'],
                ['Adapter dot', '◌ idle · ● active', 'shows current'],
              ].map(([label, value, sub]) => (
                <div key={label} style={{padding:10, background:'var(--bg-2)', borderRadius:8, border:'1px solid var(--border)'}}>
                  <div style={{fontSize:11, color:'var(--muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{label}</div>
                  <div style={{fontSize:13, fontWeight:600, marginTop:4}}>{value}</div>
                  <div style={{fontSize:11, color:'var(--muted)', fontFamily:'var(--font-mono)', marginTop:2}}>{sub}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* subscriptions inline edit */}
          <Card padding={22}>
            <Eyebrow>Subscriptions</Eyebrow>
            <h3 style={{fontSize:17, fontWeight:600, letterSpacing:'-0.015em', marginTop:6, marginBottom:14}}>The plans Mooter will route inside</h3>
            <div style={{display:'flex', flexDirection:'column', gap:10}}>
              {[
                ['anthropic','Anthropic', 'Claude Max',  '80/wk',  'var(--text)'],
                ['openai','OpenAI',       'Plus',        '40/day', 'var(--text)'],
                ['google','Google',       '— not set —', null,     'var(--muted)'],
              ].map(([logo, name, plan, budget, color]) => (
                <div key={name} style={{display:'flex', alignItems:'center', gap:14, padding:'12px 14px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:8}}>
                  <span style={{width:28, height:28, borderRadius:6, background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center'}}>
                    <ProviderLogo name={logo} size={15}/>
                  </span>
                  <strong style={{fontSize:13.5, minWidth: 100}}>{name}</strong>
                  <span style={{color, fontSize:13, fontFamily: budget ? 'var(--font-sans)' : 'var(--font-sans)'}}>{plan}</span>
                  {budget && <span style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--muted)'}}>{budget} allowance</span>}
                  <Btn kind="ghost" size="sm" style={{marginLeft:'auto'}}>Edit</Btn>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Toggle({on}) {
  return (
    <span style={{
      width: 38, height: 22, borderRadius: 9999,
      background: on ? 'var(--accent)' : 'var(--border-light)',
      border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border-light)'),
      position:'relative',
      flexShrink: 0,
      cursor:'pointer',
      transition:'background 150ms',
    }}>
      <span style={{
        position:'absolute', top: 2, left: on ? 18 : 2,
        width:16, height:16, borderRadius:'50%',
        background: on ? 'var(--bg)' : 'var(--muted)',
        transition:'left 150ms',
      }}/>
    </span>
  );
}

Object.assign(window, { DashboardArtboard, SettingsArtboard });
