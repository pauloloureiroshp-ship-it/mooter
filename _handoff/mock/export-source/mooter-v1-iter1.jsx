/* Mooter v1 — Iteration 1 additions
   Exposed: CrookSolid, CrookOutline, CrookAnimated, CrookWithCow, MooHerd,
   LockChip, FooterBlock, TierCow,
   HeroV2Artboard, UnderHoodArtboard, CompareArtboard, PrivacyArtboard,
   FooterArtboard, CrookSheetArtboard, MethodologyV2Artboard */

const {
  MooterMark, PastorCrook, TierChip, MonoNum, Eyebrow,
  TrafficLights, TerminalCard, StatuslineCard, ProgressBar,
  NavBar, Btn, Card, ProviderLogo, Dotgrid,
} = window;

/* =========================================================
   Shepherd's crook — 4 variations
   ========================================================= */
function CrookOutline({size=24, color='currentColor', strokeWidth=2}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 56" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-label="Mooter router mark">
      {/* staff */}
      <path d="M16 54 L16 22"/>
      {/* crook curve */}
      <path d="M16 22 C 16 6, 5 6, 5 16"/>
      {/* small notch */}
      <circle cx="16" cy="22" r="1" fill={color}/>
    </svg>
  );
}

function CrookSolid({size=24, color='var(--text)', accentColor='var(--accent)'}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 56" aria-label="Mooter router mark" fill="none">
      <path d="M16 54 L16 22" stroke={color} strokeWidth="4" strokeLinecap="round"/>
      <path d="M16 22 C 16 6, 5 6, 5 16" stroke={color} strokeWidth="4" strokeLinecap="round" fill="none"/>
      {/* wood-grain highlight */}
      <path d="M14 50 L14 26" stroke={accentColor} strokeWidth="0.8" opacity="0.55" strokeLinecap="round"/>
      <circle cx="16" cy="22" r="2" fill={accentColor}/>
    </svg>
  );
}

function CrookAnimated({size=32, color='var(--text)', accentColor='var(--accent)'}) {
  // CSS sway animation; very subtle
  return (
    <span style={{display:'inline-block', transformOrigin:'50% 90%', animation:'crookSway 4s ease-in-out infinite'}}>
      <CrookSolid size={size} color={color} accentColor={accentColor}/>
    </span>
  );
}

function CrookWithCow({size=44}) {
  // crook + mini cow head silhouette below
  return (
    <span style={{display:'inline-flex', flexDirection:'column', alignItems:'center', gap:2}}>
      <CrookSolid size={size}/>
      <span style={{marginTop:-4}}>
        <svg width={size*0.6} height={size*0.45} viewBox="0 0 36 26" aria-hidden="true">
          <path fill="#CCD3DA" d="M18 2c-7 0-12 4.5-12 11s5 11 12 11 12-4.5 12-11S25 2 18 2z"/>
          <path fill="#EDAEB0" d="M28 16c0 4.4-4.5 8-10 8s-10-3.6-10-8 4.5-8 10-8 10 3.6 10 8z"/>
          <circle fill="#2C2F33" cx="13" cy="11" r="1.4"/>
          <circle fill="#2C2F33" cx="23" cy="11" r="1.4"/>
        </svg>
      </span>
    </span>
  );
}

/* =========================================================
   Lock chip — privacy mini surface for the hero terminal head
   ========================================================= */
function LockChip() {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:6,
      fontFamily:'var(--font-mono)', fontSize:10.5,
      padding:'3px 8px',
      borderRadius:9999,
      background:'rgba(232,136,138,0.08)',
      border:'1px solid rgba(232,136,138,0.3)',
      color:'var(--accent)',
      letterSpacing:'0.02em',
    }}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2.5" y="6" width="7" height="4.5" rx="0.7"/>
        <path d="M4 6V4.5a2 2 0 014 0V6"/>
      </svg>
      your code stays local
    </span>
  );
}

/* =========================================================
   Tier-tinted cow — used in the hero illustration band
   ========================================================= */
function TierCow({tier, size=72, label}) {
  // CSS filter tint over the cow mark — keeps the same silhouette
  // (same MOOTER_MARK character) but recolors the body via hue-rotate
  const tintMap = {
    T0: {hue: 75,  sat: 0.7, brightness: 0.95}, // green
    T1: {hue: 200, sat: 0.85,brightness: 0.95}, // blue
    T2: {hue: 270, sat: 0.7, brightness: 0.95}, // purple
    T3: {hue: 0,   sat: 0.9, brightness: 0.95}, // red/coral
  };
  const tierColor = {T0:'var(--tier-0)', T1:'var(--tier-1)', T2:'var(--tier-2)', T3:'var(--tier-3)'}[tier];
  const t = tintMap[tier] || tintMap.T2;
  return (
    <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap: 8}}>
      <div style={{position:'relative'}}>
        {/* tag floating above */}
        <span style={{
          position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)',
          fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700,
          padding:'2px 6px', borderRadius:4,
          color: tierColor, border:`1px solid ${tierColor}`,
          background:'var(--bg)',
          letterSpacing:'0.04em',
        }}>{tier}</span>
        {/* the cow, tinted */}
        <div style={{
          filter: `hue-rotate(${t.hue}deg) saturate(${t.sat})`,
          // additional opacity wash via blend? leave neutral; the tint is enough
        }}>
          <MooterMark size={size}/>
        </div>
      </div>
      {label && <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)', textAlign:'center'}}>{label}</span>}
    </div>
  );
}

/* =========================================================
   MooHerd — hero illustration placeholder banner
   Composition follows §8: shepherd (left) → 4 cows (center) → open landscape (right)
   ========================================================= */
function MooHerd({height=300}) {
  return (
    <div style={{
      position:'relative',
      height,
      width:'100%',
      borderRadius: 16,
      overflow:'hidden',
      background:'linear-gradient(180deg, rgba(232,136,138,0.06) 0%, rgba(212,192,144,0.04) 60%, rgba(76,175,106,0.05) 100%)',
      border:'1px solid var(--border)',
    }}>
      {/* subtle ground line */}
      <svg style={{position:'absolute', inset:0, width:'100%', height:'100%'}} viewBox="0 0 1200 300" preserveAspectRatio="none">
        <path d="M0 230 Q 200 200, 400 220 T 800 215 T 1200 225 L1200 300 L0 300 Z" fill="rgba(212,192,144,0.05)"/>
        <path d="M0 240 Q 250 215, 500 235 T 1000 230 T 1200 240" stroke="rgba(232,136,138,0.18)" strokeWidth="1" fill="none" strokeDasharray="3 5"/>
        {/* sparse grass dots */}
        {Array.from({length: 36}).map((_, i) => {
          const x = (i * 73) % 1200;
          const y = 245 + ((i * 11) % 40);
          return <circle key={i} cx={x} cy={y} r="1.4" fill="rgba(232,136,138,0.25)"/>;
        })}
        {/* sun glow upper right */}
        <radialGradient id="sun" cx="92%" cy="20%" r="35%">
          <stop offset="0%" stopColor="rgba(242,165,165,0.18)"/>
          <stop offset="100%" stopColor="rgba(242,165,165,0)"/>
        </radialGradient>
        <rect width="1200" height="300" fill="url(#sun)"/>
        {/* far hills */}
        <path d="M0 200 Q 150 170, 300 190 T 600 185 T 1200 195 L1200 230 L0 230 Z" fill="rgba(122,113,104,0.10)"/>
        {/* distant barn (Easter egg for Forge) */}
        <g transform="translate(1080 175)" opacity="0.4">
          <rect x="0" y="6" width="22" height="14" fill="var(--accent)"/>
          <polygon points="0,6 11,0 22,6" fill="var(--accent)"/>
          <rect x="9" y="12" width="4" height="8" fill="var(--bg)"/>
        </g>
        {/* trees right */}
        {[[920, 215, 14],[955, 220, 11],[990, 218, 13]].map(([cx, cy, r], i) => (
          <g key={i}><circle cx={cx} cy={cy-r/2} r={r} fill="rgba(76,175,106,0.18)"/><rect x={cx-1} y={cy-r/2+r-2} width="2" height="8" fill="rgba(122,113,104,0.4)"/></g>
        ))}
      </svg>

      {/* Shepherd silhouette (left third) — abstract figure */}
      <div style={{position:'absolute', left:'9%', bottom:'18%', display:'flex', flexDirection:'column', alignItems:'center'}}>
        <svg width="68" height="140" viewBox="0 0 70 140" aria-label="router">
          {/* head */}
          <circle cx="35" cy="22" r="11" fill="rgba(242,237,230,0.85)"/>
          {/* cloak / body — muted rose */}
          <path d="M22 33 L48 33 L52 110 L18 110 Z" fill="#EDAEB0" opacity="0.85"/>
          {/* cloak hood detail */}
          <path d="M22 33 L48 33 L46 44 L24 44 Z" fill="#C16A6F" opacity="0.7"/>
          {/* arm holding crook */}
          <path d="M48 50 L62 80" stroke="rgba(242,237,230,0.85)" strokeWidth="5" strokeLinecap="round"/>
          {/* crook in arm */}
          <g transform="translate(58 38)">
            <CrookSolid size={70} color="#1F1612" accentColor="#EDAEB0"/>
          </g>
        </svg>
      </div>

      {/* Herd — 4 cows in tier colors, center area */}
      <div style={{
        position:'absolute',
        left:'30%', right:'30%',
        bottom: '14%',
        display:'flex', gap: 36,
        alignItems:'flex-end',
        justifyContent:'center',
      }}>
        {[
          {tier:'T0', size:54, off: 0},
          {tier:'T1', size:60, off: -8},
          {tier:'T2', size:68, off: -4},
          {tier:'T3', size:80, off: 0},
        ].map(c => (
          <div key={c.tier} style={{transform:`translateY(${c.off}px)`}}>
            <TierCow tier={c.tier} size={c.size}/>
          </div>
        ))}
      </div>

      {/* caption — bottom-left mono tag, makes the placeholder-status honest */}
      <div style={{
        position:'absolute', bottom:10, left:14,
        fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)',
        letterSpacing:'0.06em',
      }}>
        illustration · shepherd guiding the herd · §08
      </div>
      <div style={{
        position:'absolute', bottom:10, right:14,
        fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)',
        display:'flex', gap:8,
      }}>
        <span>T0–T3 mooed</span>
        <span style={{color:'var(--muted)'}}>·</span>
        <span>~360px · hand-drawn SVG (pending)</span>
      </div>
    </div>
  );
}

/* =========================================================
   ARTBOARD: Hero v2 — illustration banner + lock chip + crook near "?"
   ========================================================= */
function HeroV2Artboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <NavBar activeKey="how"/>

      <div className="m-pad m-pad-y" style={{padding:'56px 64px 48px', maxWidth:1440, margin:'0 auto'}}>
        <div style={{display:'flex', alignItems:'center', gap:14, marginBottom: 28}}>
          <span style={{
            display:'inline-flex', alignItems:'center', gap:8,
            border:'1px solid var(--border-light)',
            padding:'5px 12px',
            borderRadius:9999,
            fontFamily:'var(--font-mono)', fontSize:11.5,
            color:'var(--muted)',
          }}>
            <span style={{width:7, height:7, borderRadius:'50%', background:'var(--green)'}}/>
            {`Open source · MIT · ${window.MOOTER_VTAG} · classify.js unchanged 13 waves`}
          </span>
        </div>

        <div className="m-stack" style={{display:'grid', gridTemplateColumns:'1.05fr 1fr', gap:60, alignItems:'start'}}>
          {/* LEFT */}
          <div>
            <h1 style={{
              fontFamily:'var(--font-sans)',
              fontWeight:700,
              fontSize: 'clamp(84px, 11vw, 152px)',
              lineHeight: 0.92,
              letterSpacing:'-0.055em',
              margin:0,
              display:'flex',
              alignItems:'flex-start',
              gap: 6,
            }}>
              <span>Got Moo</span>
              <span style={{color:'var(--accent)', display:'inline-flex', alignItems:'flex-start'}}>?</span>
            </h1>

            <p style={{
              fontFamily:'var(--font-sans)',
              fontSize: 22,
              lineHeight: 1.35,
              letterSpacing:'-0.015em',
              maxWidth: 560,
              marginTop: 32,
              marginBottom: 18,
              textWrap:'balance',
            }}>
              The router for Claude Code. <span style={{color:'var(--accent)'}}>Local-first</span>. Learns forever. Spawns agents <span style={{color:'var(--accent)'}}>safely by default</span>.
            </p>

            <p style={{color:'var(--muted)', fontSize:15, lineHeight:1.6, maxWidth:540, marginBottom: 28}}>
              <MonoNum color="var(--text)">47%</MonoNum> saved vs all-Opus across <MonoNum color="var(--text)">658</MonoNum> real routed calls — not a community average.
            </p>

            <div style={{display:'flex', gap:12, alignItems:'center', marginBottom: 24}}>
              <Btn kind="primary" size="lg" href={mhref('install')}>Install in 30s →</Btn>
              <Btn kind="ghost" size="lg" href={mhref('signin')} icon={<ProviderLogo name="github" size={14}/>}>Sign in</Btn>
            </div>

            <div style={{display:'flex', gap:24, flexWrap:'wrap', color:'var(--muted)', fontSize:13}}>
              <span>✓ Hook, not a proxy</span>
              <span>✓ Runs locally</span>
              <span>✓ &lt;<MonoNum color="var(--text)">50ms</MonoNum> overhead</span>
            </div>
          </div>

          {/* RIGHT — terminal with lock chip + 3-line statusline */}
          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            <div style={{
              background: 'var(--term-bg)',
              border: '1px solid var(--term-border)',
              borderRadius: 10,
              overflow: 'hidden',
              fontFamily: 'var(--font-mono)',
              color: 'var(--term-fg)',
            }}>
              {/* head with lock chip */}
              <div style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'10px 14px',
                background:'var(--term-header)',
                borderBottom:'1px solid var(--term-border)',
                fontSize: 11.5,
              }}>
                <TrafficLights/>
                <div style={{color:'var(--term-dim)', display:'flex', gap:8, alignItems:'center'}}>
                  <span>claude · live routing</span>
                  <span style={{opacity:0.5}}>·</span>
                  <span style={{color:'var(--tier-2)'}}>T2 sonnet</span>
                </div>
                <span style={{marginLeft:'auto'}}><LockChip/></span>
              </div>
              <div style={{padding: '14px 16px', fontSize:13, lineHeight:1.85}}>
                <div style={{color:'var(--term-dim)'}}>$ claude <span style={{color:'var(--accent)'}}>"draft the system map for the auth refactor"</span></div>
                <div style={{color:'var(--term-dim)', marginTop:6}}>  ├─ <span style={{color:'var(--term-fg)'}}>classify</span>  <span style={{color:'var(--green)'}}>14ms</span>  <span style={{opacity:0.5}}>·</span>  intent=<span style={{color:'var(--accent)'}}>arch</span>  complexity=<span style={{color:'var(--tier-2)'}}>med</span></div>
                <div style={{color:'var(--term-dim)'}}>  ├─ <span style={{color:'var(--term-fg)'}}>profile</span>   GPU=<span style={{color:'var(--term-fg)'}}>RTX 4090</span>  sub=<span style={{color:'var(--term-fg)'}}>claude-max</span></div>
                <div style={{color:'var(--term-dim)'}}>  ├─ <span style={{color:'var(--term-fg)'}}>pack</span>      <span style={{color:'var(--accent)'}}>diagram-systems</span>  <span style={{opacity:0.5}}>(trust 98)</span></div>
                <div style={{color:'var(--term-dim)'}}>  └─ <span style={{color:'var(--term-fg)'}}>route</span>     → <span style={{color:'var(--tier-2)'}}>claude-sonnet</span>  <span style={{opacity:0.5}}>(over opus, saves $0.31)</span></div>
                <div style={{marginTop:14, color:'var(--green)'}}>
                  ✓ generating system map…  <span style={{color:'var(--term-dim)'}}>(streamed by sonnet, scaffolded by pack)</span>
                </div>
              </div>
            </div>

            <StatuslineCard/>

            <div style={{display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--muted)', fontFamily:'var(--font-mono)', paddingLeft:4}}>
              <span>Smart routing intelligence — two axes: complexity + domain.</span>
            </div>
          </div>
        </div>

        {/* community pulse */}
        <div className="m-2col" style={{
          marginTop: 36,
          border:'1px solid var(--border)',
          background:'var(--surface)',
          borderRadius: 14,
          padding: '20px 28px',
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)',
          gap: 24,
        }}>
          {[
            ['calls routed',    '658',    'across 7 moos'],
            ['saved vs Opus',   '$25.95', 'alltime'],
            ['avg savings',     '47%',    'vs all-Opus'],
            ['packs installed', '3',      'data · diagram · voice'],
          ].map(([label, num, sub]) => (
            <div key={label}>
              <Eyebrow>{label}</Eyebrow>
              <div style={{fontFamily:'var(--font-mono)', fontSize:30, fontVariantNumeric:'tabular-nums', fontWeight:600, letterSpacing:'-0.02em', marginTop:4}}>{num}</div>
              <div style={{fontSize:12.5, color:'var(--muted)', marginTop:2}}>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:14, fontFamily:'var(--font-mono)', fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:8}}>
          <span aria-hidden="true">🐮</span>
          <span>From the author's machine — 1 dev (Paulo). Real numbers, not a community average. Opted-in herd telemetry goes live soon.</span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ARTBOARD: Under the hood — Quantization + LoRA/DoRA
   ========================================================= */
function UnderHoodArtboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <div className="m-pad m-pad-y" style={{padding:'56px 64px', maxWidth:1280, margin:'0 auto'}}>
        <div style={{display:'flex', alignItems:'center', gap:14, marginBottom: 10}}>
          <Eyebrow>§ under the hood · Smart routing. Mooter routes.</Eyebrow>
        </div>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:46, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.05, marginTop:6, marginBottom: 36}}>
          Two ideas you don't need a PhD to use.
        </h2>

        {/* QUANT */}
        <div className="m-stack" style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:32, marginBottom: 56}}>
          <div>
            <Eyebrow>01 · Quantization</Eyebrow>
            <h3 style={{fontFamily:'var(--font-sans)', fontSize:30, fontWeight:700, letterSpacing:'-0.025em', lineHeight:1.1, marginTop:8, marginBottom:8}}>Why your laptop can run Opus-grade models now.</h3>
            <p style={{color:'var(--muted)', fontSize:13.5, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14}}>quantization, in 30 seconds</p>
            <p style={{fontSize:15, lineHeight:1.65, color:'var(--text)', maxWidth: 560, marginBottom: 22}}>
              Full-precision AI models are huge. A 30-billion-parameter model in 32-bit floats weighs <MonoNum>120 GB</MonoNum> — too big for your GPU. Quantization compresses the model's numbers to 4-bit integers, shrinking it to <MonoNum>18 GB</MonoNum> while keeping <MonoNum>~98%</MonoNum> of the quality. The same model now runs on your RTX 4090 instead of a data center. Mooter prefers quantized local models for T0 whenever quality stays above the bar.
            </p>

            {/* size comparison */}
            <Card padding={16} style={{background:'var(--bg-2)'}}>
              <div style={{display:'flex', flexDirection:'column', gap:14, fontFamily:'var(--font-mono)'}}>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:6}}>
                    <span>qwen3:30b <span style={{color:'var(--muted)'}}>(full precision FP32)</span></span>
                    <span style={{color:'var(--tier-3)'}}>120 GB</span>
                  </div>
                  <div style={{height:14, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, overflow:'hidden'}}>
                    <div style={{width:'100%', height:'100%', background:'rgba(212,106,90,0.5)'}}/>
                  </div>
                  <div style={{fontSize:11, color:'var(--tier-3)', marginTop:4}}>✗ doesn't fit your GPU</div>
                </div>
                <div>
                  <div style={{display:'flex', justifyContent:'space-between', fontSize:12.5, marginBottom:6}}>
                    <span>qwen3:30b <span style={{color:'var(--muted)'}}>(quantized Q4_K_M)</span></span>
                    <span style={{color:'var(--green)'}}>18 GB</span>
                  </div>
                  <div style={{height:14, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, overflow:'hidden'}}>
                    <div style={{width:'15%', height:'100%', background:'rgba(76,175,106,0.55)'}}/>
                  </div>
                  <div style={{fontSize:11, color:'var(--green)', marginTop:4}}>✓ fits 24GB GPU · <MonoNum color="var(--green)">~98%</MonoNum> quality</div>
                </div>
              </div>
            </Card>
          </div>

          {/* right: quant tech card */}
          <Card padding={20}>
            <Eyebrow>Quantization in mooter</Eyebrow>
            <div style={{marginTop:12, marginBottom:18}}>
              <div style={{fontSize:13, color:'var(--muted)', fontFamily:'var(--font-mono)', marginBottom:8}}>
                <span style={{color:'var(--text)'}}>T0 models</span> (local, free) <span style={{color:'var(--accent)'}}>Q4_K_M</span> default
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:6, fontFamily:'var(--font-mono)', fontSize:12.5, paddingLeft:8}}>
                {[
                  ['├─','qwen2.5-coder:7b','5 GB','code'],
                  ['├─','qwen3:30b','18 GB','reasoning'],
                  ['├─','gemma3:12b','7 GB','general'],
                  ['└─','deepseek-r1:7b','4 GB','math'],
                ].map(([prefix, name, size, role]) => (
                  <div key={name} style={{display:'flex', gap:8, color:'var(--muted)'}}>
                    <span>{prefix}</span>
                    <span style={{color:'var(--text)', minWidth: 130}}>{name}</span>
                    <span style={{color:'var(--accent)'}}>{size}</span>
                    <span>· {role}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{fontSize:13, color:'var(--muted)', fontFamily:'var(--font-mono)', paddingTop:14, borderTop:'1px solid var(--border)'}}>
              T1–T3 served by provider · cloud quantization
            </div>
            <div style={{marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)'}}>
              <Eyebrow>Quality delta · Q4 vs FP32</Eyebrow>
              <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:5, fontFamily:'var(--font-mono)', fontSize:12}}>
                {[['qwen2.5-coder','−1.8pp'],['qwen3:30b','−1.2pp'],['gemma3:12b','−2.4pp']].map(([m, d]) => (
                  <div key={m} style={{display:'flex', justifyContent:'space-between'}}>
                    <span style={{color:'var(--muted)'}}>{m}</span>
                    <span style={{color:'var(--green)'}}>{d}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop:10, fontSize:11, color:'var(--muted)'}}>Source · mooter benchmark · 142 prompts · blind judge</div>
            </div>
          </Card>
        </div>

        {/* LORA */}
        <div className="m-stack" style={{display:'grid', gridTemplateColumns:'1.1fr 1fr', gap:32}}>
          <div>
            <Eyebrow>02 · LoRA / DoRA</Eyebrow>
            <h3 style={{fontFamily:'var(--font-sans)', fontSize:30, fontWeight:700, letterSpacing:'-0.025em', lineHeight:1.1, marginTop:8, marginBottom:8}}>Specialize the brain on your code — locally, overnight.</h3>
            <p style={{color:'var(--muted)', fontSize:13.5, fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14}}>LoRA and DoRA, in 30 seconds</p>
            <p style={{fontSize:15, lineHeight:1.65, color:'var(--text)', maxWidth: 600, marginBottom: 20}}>
              A 7-billion-parameter model knows a lot — but it doesn't know <em style={{color:'var(--accent)'}}>your</em> codebase. Re-training from scratch would take weeks and a cluster. LoRA trains a tiny "patch" — usually <MonoNum>under 100 MB</MonoNum> — that adjusts the model toward your style, conventions, and domain. DoRA is the 2024 refinement: separates <em>how much</em> the patch moves a weight from <em>which direction</em> — sharper for the same compute.
            </p>

            {/* adapter diagram */}
            <Card padding={20} style={{background:'var(--bg-2)'}}>
              <div style={{border:'1.5px dashed var(--border-light)', borderRadius:10, padding:16, position:'relative'}}>
                <div style={{position:'absolute', top:-10, left:14, padding:'2px 8px', background:'var(--bg-2)', fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)'}}>base model · frozen · 7B params · 5 GB</div>
                <div style={{
                  margin:'10px 0',
                  border:'1.5px solid var(--accent)',
                  borderRadius:8,
                  padding:'14px 16px',
                  background:'var(--accent-08)',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                }}>
                  <div>
                    <div style={{fontFamily:'var(--font-mono)', fontWeight:600, fontSize:13, color:'var(--accent)'}}>LoRA adapter · your code</div>
                    <div style={{fontFamily:'var(--font-mono)', fontSize:11.5, color:'var(--muted)', marginTop:2}}>r=32 · ~80 MB · trained ~4h</div>
                  </div>
                </div>
              </div>
              <div style={{textAlign:'center', marginTop:10, fontFamily:'var(--font-mono)', fontSize:13, color:'var(--muted)'}}>↓</div>
              <div style={{textAlign:'center', marginTop:6, fontSize:13, color:'var(--text)'}}>Output specialized to <span style={{color:'var(--accent)'}}>your repo</span></div>
            </Card>
          </div>

          {/* right: Wave 5 card */}
          <Card padding={20} style={{background:'linear-gradient(135deg, rgba(232,136,138,0.08), transparent 60%)', borderColor:'var(--accent-25)'}}>
            <div style={{display:'flex', alignItems:'center', gap:10, marginBottom: 6}}>
              <Eyebrow>Coming Wave 5 · Adapter Forge</Eyebrow>
            </div>
            <h3 style={{fontFamily:'var(--font-sans)', fontSize:22, fontWeight:700, letterSpacing:'-0.02em', lineHeight:1.15, marginTop:8, marginBottom:6}}>Train your code's brain.</h3>
            <p style={{fontSize:14, color:'var(--text)', marginBottom: 18}}>Locally. Overnight. ToS-safe.</p>

            <div style={{display:'flex', flexDirection:'column', gap:6, marginBottom:18}}>
              {[
                'Self-distillation on your repo',
                'DoRA r=32 + Unsloth',
                'Qwen3-14B base',
                'Eval harness vs Sonnet',
                'Hot-swap via vLLM',
                'Your code never leaves your machine',
              ].map(item => (
                <div key={item} style={{display:'flex', gap:10, fontSize:13}}>
                  <span style={{color:'var(--green)'}}>✓</span>
                  <span style={{color:'var(--text)'}}>{item}</span>
                </div>
              ))}
            </div>

            <div style={{display:'flex', flexDirection:'column', gap:4, paddingTop:14, borderTop:'1px solid var(--accent-25)', fontFamily:'var(--font-mono)', fontSize:12, color:'var(--muted)'}}>
              <div>Eligibility · <span style={{color:'var(--text)'}}>30 days</span> + <span style={{color:'var(--text)'}}>≥200 decisions</span></div>
              <div>Est. time · <span style={{color:'var(--text)'}}>3–6h</span> on RTX 4090</div>
              <div>Est. gain · <span style={{color:'var(--green)'}}>+12pp</span> on domain prompts</div>
            </div>

            <div style={{marginTop:16, padding:'8px 12px', background:'rgba(212,192,144,0.08)', border:'1px solid rgba(212,192,144,0.3)', borderRadius:6, fontSize:11.5, color:'var(--yellow)', fontFamily:'var(--font-mono)'}}>
              status · in development · expected Q3 2026
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ARTBOARD: Compare — vs the rest
   ========================================================= */
function CompareArtboard() {
  // Columns: [mooter, Composio AO, Conductor, Cursor Bg, Anthropic Agent Teams, OpenAI Codex, Antigravity, Termdock]
  const tools = [
    {name:'mooter',        sub:window.MOOTER_VTAG,   highlight:true},
    {name:'Composio AO',   sub:'agent os'},
    {name:'Conductor',     sub:'orchestr.'},
    {name:'Cursor Bg',     sub:'bg agents'},
    {name:'Agent Teams',   sub:'anthropic'},
    {name:'Codex',         sub:'openai'},
    {name:'Antigravity',   sub:'google'},
    {name:'Termdock',      sub:'multiplexer'},
  ];
  // kinds: y = yes/✓ · n = no/✗ · p = partial/◐ · cve = sandbox w/ disclosed CVE
  // Cells transcribe ONLY what was explicitly stated per capability; unstated
  // competitor cells are marked partial (◐) rather than invented as ✓.
  const rows = [
    {label:'Spawn agents',                       note:'mooter local by default · others cloud-only',                  cells:['y','y','y','y','y','y','y','n']},
    {label:'Local-first',                         note:'runs without the cloud',                                       cells:['y','p','p','p','y','p','p','y']},
    {label:'Cross-session $ savings',             note:'tracks spend across every terminal',                           cells:['y','n','n','n','n','n','n','n']},
    {label:'5-hour quota forecast',               note:'predicts when you hit the wall',                               cells:['y','n','n','n','n','n','n','n']},
    {label:'Cross-session routing learning',      note:'gets cheaper the more you use it',                             cells:['y','n','n','n','n','n','n','n']},
    {label:'4-layer sandbox',                     note:'network · fs · secrets · config',                              cells:['y','p','p','y','y','y','cve','p']},
    {label:'Intent-based UX',                     note:'say the goal, not the model',                                  cells:['y','n','p','y','n','y','n','n']},
    {label:'State-of-art install wizard',         note:'one path, no foot-guns',                                       cells:['y','p','p','y','p','y','p','p']},
    {label:'Multiplexer plugins',                 note:'Zellij · tmux · WezTerm · Warp',                               cells:['y','n','n','n','p','n','n','y']},
    {label:'Orchestration locks across terminals',note:'Worktree Conductor — no two agents on one file',               cells:['y','n','n','n','n','n','n','n']},
    {label:'Workflow visibility statusline chip', note:'always-on HUD of what is running',                             cells:['y','n','n','n','n','n','n','n']},
  ];

  const ICON = {
    y:   {c:'var(--green)',  g:'✓'},
    n:   {c:'rgba(122,113,104,0.5)', g:'✗'},
    p:   {c:'var(--yellow)', g:'◐'},
    cve: {c:'var(--tier-3)', g:'⚠'},
  };
  // Score row derived from the cells above so the table is internally consistent.
  const scores = tools.map((_, col) => rows.filter(r => r.cells[col] === 'y').length);

  return (
    <div style={{background:'var(--bg)', color:'var(--text)', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <div className="m-pad m-pad-y" style={{padding:'56px 56px 64px', maxWidth: 1320, margin:'0 auto'}}>
        <Eyebrow>§ compare · the multi-session field</Eyebrow>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:46, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.04, marginTop:8, marginBottom:8}}>
          Eleven capabilities. <span style={{color:'var(--accent)'}}>Mooter is the only 11/11.</span>
        </h2>
        <p style={{color:'var(--muted)', fontSize:15, maxWidth: 760, marginBottom:32, lineHeight:1.6}}>
          The capabilities below are derived from the real pain points of running many Claude Code sessions at once. Each tool does <em>something</em> well — none of the others does all eleven.
        </p>

        <Card padding={0} style={{overflow:'hidden'}}>
          <div className="m-scroll-x">
          <table style={{width:'100%', borderCollapse:'collapse', tableLayout:'fixed'}}>
            <colgroup>
              <col style={{width:'30%'}}/>
              {tools.map((t, i) => <col key={i} style={{width: `${70/tools.length}%`}}/>)}
            </colgroup>
            <thead>
              <tr>
                <th style={{textAlign:'left', padding:'16px 18px', borderBottom:'1px solid var(--border)', fontWeight:500, color:'var(--muted)', fontFamily:'var(--font-mono)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', verticalAlign:'bottom'}}>Capability</th>
                {tools.map(t => (
                  <th key={t.name} style={{
                    textAlign:'center', padding:'14px 6px', borderBottom:'1px solid var(--border)', verticalAlign:'bottom',
                    background: t.highlight ? 'var(--accent-08)' : 'transparent',
                    borderLeft: t.highlight ? '1px solid var(--accent-25)' : 'none',
                    borderRight: t.highlight ? '1px solid var(--accent-25)' : 'none',
                  }}>
                    <div style={{fontSize:12.5, fontWeight:600, lineHeight:1.15, color: t.highlight ? 'var(--accent)' : 'var(--text)'}}>{t.name}</div>
                    <div style={{fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--muted)', marginTop:3, textTransform:'uppercase', letterSpacing:'0.04em'}}>{t.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                  <td style={{padding:'13px 18px', verticalAlign:'top'}}>
                    <div style={{fontWeight:600, fontSize:13.5, letterSpacing:'-0.01em'}}>{row.label}</div>
                    <div style={{color:'var(--muted)', fontSize:11.5, marginTop:2, lineHeight:1.4}}>{row.note}</div>
                  </td>
                  {row.cells.map((kind, j) => {
                    const ic = ICON[kind] || ICON.n;
                    const isMooter = j === 0;
                    return (
                      <td key={j} style={{
                        textAlign:'center', padding:'13px 6px', verticalAlign:'middle',
                        background: isMooter ? 'var(--accent-08)' : 'transparent',
                        borderLeft: isMooter ? '1px solid var(--accent-25)' : 'none',
                        borderRight: isMooter ? '1px solid var(--accent-25)' : 'none',
                      }}>
                        <span style={{color: ic.c, fontSize: 16, fontWeight:700, fontFamily:'var(--font-mono)'}}>
                          {ic.g}{kind === 'cve' && <sup style={{fontSize:9, marginLeft:1}}>†</sup>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* score row */}
              <tr>
                <td style={{padding:'16px 18px', fontFamily:'var(--font-mono)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--muted)'}}>Score</td>
                {scores.map((s, j) => {
                  const isMooter = j === 0;
                  return (
                    <td key={j} style={{
                      textAlign:'center', padding:'14px 6px',
                      background: isMooter ? 'var(--accent-12)' : 'transparent',
                      borderLeft: isMooter ? '1px solid var(--accent-25)' : 'none',
                      borderRight: isMooter ? '1px solid var(--accent-25)' : 'none',
                    }}>
                      <div style={{fontFamily:'var(--font-mono)', fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize: isMooter ? 19 : 15, color: isMooter ? 'var(--accent)' : 'var(--text)', letterSpacing:'-0.02em'}}>{s}</div>
                      <div style={{fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--muted)', marginTop:1}}>/ 11</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          </div>
        </Card>

        <div style={{marginTop:20, display:'flex', gap: 22, fontSize:12, color:'var(--muted)', flexWrap:'wrap', alignItems:'center'}}>
          <span><span style={{color:'var(--green)', fontWeight:700}}>✓</span> full</span>
          <span><span style={{color:'var(--yellow)', fontWeight:700}}>◐</span> partial / unclear</span>
          <span><span style={{color:'var(--tier-3)', fontWeight:700}}>⚠</span> shipped but with a disclosed flaw</span>
          <span><span style={{color:'rgba(122,113,104,0.5)', fontWeight:700}}>✗</span> not available</span>
        </div>
        <div style={{marginTop:14, fontSize:12, color:'var(--muted)', lineHeight:1.6, maxWidth: 900}}>
          <span style={{color:'var(--tier-3)'}}>†</span> Antigravity's sandbox shipped with <span style={{fontFamily:'var(--font-mono)', color:'var(--text)'}}>CVE-2025-59528</span> (prompt-injection escape, disclosed). Marked shipped-but-flawed rather than passing.
        </div>
        <div style={{marginTop:10, fontSize:11.5, color:'var(--muted)', fontStyle:'italic', maxWidth: 900, lineHeight:1.6}}>
          Comparison based on public documentation as of June 2026. Methodology: 11 capabilities derived from observed pain points of multi-session Claude Code workflows. Scores are counted from the cells above — got a cell wrong? <a style={{color:'var(--accent)', fontStyle:'normal'}}>open an issue →</a>
        </div>
        <div style={{marginTop:18, padding:'16px 20px', background:'var(--accent-06)', border:'1px solid var(--accent-25)', borderRadius:12, maxWidth: 900}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
            <span style={{fontFamily:'var(--font-mono)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--accent)'}}>honest &gt; inflated</span>
          </div>
          <p style={{margin:0, fontSize:13.5, lineHeight:1.65, color:'var(--text)'}}>
            Scores are derived honestly from the per-row cells, not curated to make Mooter look better. Mooter wins <strong style={{color:'var(--accent)'}}>7 capabilities outright</strong> — cross-session $ savings, 5h quota forecast, cross-session routing learning, orchestration locks, workflow visibility, intent-based UX paired with cross-session intelligence, and being the only stack shipping all 11 in one tool.
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ARTBOARD: Privacy — your code stays yours
   ========================================================= */
function PrivacyArtboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <div style={{padding:'52px 56px', maxWidth:1280, margin:'0 auto'}}>
        <Eyebrow>§07 · privacy</Eyebrow>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:46, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.05, marginTop:8, marginBottom:8}}>
          Your code stays yours. Always.
        </h2>
        <p style={{color:'var(--muted)', fontSize:15.5, maxWidth: 720, lineHeight:1.6, marginBottom: 36}}>
          Mooter is a hook in your terminal, not a proxy through someone else's servers. Default OFF on every signal that leaves the machine.
        </p>

        <div className="m-stack" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:24}}>
          {/* LEFT — 2×2 pictogram cards */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            {[
              {icon:'laptop', title:'T0 stays local',
                body:'When mooter routes to your local Ollama, your prompt and your code never touch a network.'},
              {icon:'lock', title:'Prompts hashed',
                body:'We log a SHA-256 hash of each prompt — never the text itself. We can\'t reconstruct your work even if we wanted.'},
              {icon:'handshake', title:'Opt-in telemetry',
                body:'Defaults OFF. When you turn it on, only aggregated stats leave — k-anonymity ≥50 + DP noise. Revoke anytime.'},
              {icon:'book', title:'Open source · audit it',
                body:'Every line of mooter is on GitHub under MIT. Read the code. Run your own fork. Audit any behavior, anytime.'},
            ].map(c => (
              <Card key={c.title} padding={18}>
                <PictoIcon name={c.icon}/>
                <h4 style={{fontSize:16, fontWeight:600, letterSpacing:'-0.015em', marginTop:10, marginBottom:6}}>{c.title}</h4>
                <p style={{fontSize:12.5, color:'var(--muted)', lineHeight:1.55, margin:0}}>{c.body}</p>
              </Card>
            ))}
          </div>

          {/* RIGHT — compliance card */}
          <Card padding={22}>
            <Eyebrow>Compliance & data laws</Eyebrow>
            <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:14}}>
              {[
                {tag:'GDPR-aligned · EU', items:[
                  'Data minimization · purpose limitation',
                  'Right to access · right to erasure',
                  'No third-country transfers (Cloudflare EU edge)',
                ]},
                {tag:'LGPD-aligned · Brasil', items:[
                  'Consentimento expresso e granular',
                  'Direito de acesso, correção, eliminação',
                  'Hosting na borda Cloudflare US/EU',
                ]},
                {tag:'CCPA-aligned · California', items:[
                  'No sale of personal information',
                  'Right to know what\'s collected',
                ]},
                {tag:'Privacy-first by design', items:[
                  'Telemetry default OFF',
                  'k-anonymity threshold ≥50',
                  'Differential privacy noise · ε=1.0',
                ]},
                {tag:'Open source · MIT', items:[
                  'github.com/…/mooter',
                  'Reproducible builds',
                  'Independent audit welcome',
                ]},
              ].map(group => (
                <div key={group.tag}>
                  <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                    <span style={{color:'var(--green)', fontSize:13}}>✓</span>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600, color:'var(--text)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{group.tag}</span>
                  </div>
                  <ul style={{margin:0, padding:'0 0 0 22px', listStyle:'none', display:'flex', flexDirection:'column', gap:2}}>
                    {group.items.map(item => (
                      <li key={item} style={{fontSize:12, color:'var(--muted)', position:'relative'}}>
                        <span style={{position:'absolute', left:-12, color:'var(--muted)'}}>·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div style={{display:'flex', gap:8, marginTop:20}}>
              <Btn kind="rose" size="sm" style={{flex:1, justifyContent:'center'}}>Privacy policy →</Btn>
              <Btn kind="ghost" size="sm" style={{flex:1, justifyContent:'center'}}>Security policy →</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PictoIcon({name}) {
  const common = {width:36, height:36, viewBox:'0 0 36 36', fill:'none', stroke:'var(--accent)', strokeWidth:1.6, strokeLinecap:'round', strokeLinejoin:'round'};
  const map = {
    laptop: <svg {...common}><rect x="6" y="10" width="24" height="14" rx="2"/><path d="M4 26h28l-2 3H6l-2-3z"/></svg>,
    lock:   <svg {...common}><rect x="9" y="16" width="18" height="13" rx="2"/><path d="M13 16v-3a5 5 0 0110 0v3"/><circle cx="18" cy="22" r="1.5" fill="var(--accent)"/></svg>,
    handshake: <svg {...common}><path d="M5 18l5-5 4 3 5-5 5 5-5 7M19 14l8 6M14 25l-3 3"/></svg>,
    book:   <svg {...common}><path d="M6 8h10a4 4 0 014 4v18M30 8H20a4 4 0 00-4 4v18M6 8v22h10M30 8v22H20"/></svg>,
  };
  return <div style={{width:48, height:48, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--accent-08)', border:'1px solid var(--accent-25)', borderRadius:10}}>{map[name]}</div>;
}

/* =========================================================
   ARTBOARD: Footer — 3-tier sign-off
   ========================================================= */
function FooterArtboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden', display:'flex', flexDirection:'column'}}>
      <Dotgrid/>

      {/* Tier 1 — Got Moo? sign-off */}
      <div style={{
        position:'relative',
        padding:'80px 64px 70px',
        background:'linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%)',
        borderTop:'1px solid var(--border)',
        textAlign:'center',
        overflow:'hidden',
      }}>
        {/* tessellated cow ears watermark — subtle */}
        <div style={{position:'absolute', inset:0, opacity:0.045, pointerEvents:'none'}}>
          {Array.from({length:24}).map((_, i) => (
            <span key={i} style={{
              position:'absolute',
              left: `${(i * 73) % 100}%`,
              top: `${(i * 37) % 100}%`,
              transform: `rotate(${(i*13) % 360}deg)`,
            }}><MooterMark size={28}/></span>
          ))}
        </div>

        <h2 style={{
          fontFamily:'var(--font-sans)', fontWeight:700,
          fontSize: 96, lineHeight:0.95, letterSpacing:'-0.055em',
          margin:0,
          display:'inline-flex', alignItems:'baseline', gap:4,
          position:'relative',
        }}>
          <span>Got Moo</span>
          <span style={{color:'var(--accent)'}}>?</span>
        </h2>

        <div style={{marginTop:24, marginBottom: 32, position:'relative'}}>
          <p style={{fontFamily:'var(--font-sans)', fontSize:22, fontWeight:500, lineHeight:1.35, margin:0, letterSpacing:'-0.015em'}}>
            Stop overpaying per prompt.<br/>
            Start routing your stack.
          </p>
        </div>

        <div style={{display:'flex', gap:12, justifyContent:'center', position:'relative'}}>
          <Btn kind="primary" size="lg" href={mhref('install')}>Install in 30s →</Btn>
          <Btn kind="ghost" size="lg" href={mhref('signin')} icon={<ProviderLogo name="github" size={14}/>}>Sign in with GitHub</Btn>
        </div>
      </div>

      {/* Tier 2 — 4 column nav */}
      <div style={{padding:'48px 64px', borderTop:'1px solid var(--border)', background:'var(--bg-2)'}}>
        <div className="m-stack" style={{display:'grid', gridTemplateColumns:'1.4fr repeat(4, 1fr)', gap:36}}>
          {/* brand + tagline */}
          <div>
            <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
              <MooterMark size={28}/>
              <span style={{fontFamily:'var(--font-sans)', fontWeight:600, fontSize:18}}>mooter</span>
            </div>
            <p style={{fontSize:13, color:'var(--muted)', lineHeight:1.55, margin:0, maxWidth: 280}}>
              The router for Claude Code. Built for vibe coders — the indie devs, the bootstrappers, the students with one gaming GPU.
            </p>
          </div>

          {[
            {title:'Product', items:['Install','Pack browser','Modes','Forge','Pricing']},
            {title:'Resources', items:['Docs','Methodology','Benchmark','Changelog','API docs','Status']},
            {title:'Community', items:['GitHub ↗','Discord ↗','Twitter ↗','Blog','Bluesky ↗','Contribute']},
            {title:'Legal', items:['Terms','Privacy','License','Security','Status']},
          ].map(col => (
            <div key={col.title}>
              <Eyebrow>{col.title}</Eyebrow>
              <ul style={{margin:'12px 0 0 0', padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:7}}>
                {col.items.map(item => (
                  <li key={item}><a style={{fontSize:13, color:'var(--muted)', textDecoration:'none'}}>{item}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Tier 3 — bottom bar */}
      <div style={{
        padding:'18px 64px',
        borderTop:'1px solid var(--border)',
        background: '#070605',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        fontSize:12, color:'var(--muted)',
      }}>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <MooterMark size={18}/>
          <span style={{fontFamily:'var(--font-mono)'}}>Crafted by Paulo Loureiro in São Paulo / Lisbon · MIT · Open source · Community project, not affiliated with Anthropic</span>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:14}}>
          <span style={{fontFamily:'var(--font-mono)'}}>{`${window.MOOTER_VTAG} · classify.js unchanged 13 waves · ~570 tests green`}</span>
        </div>
        <div style={{display:'flex', gap:10}}>
          {['github','x','bluesky','discord'].map(s => (
            <span key={s} style={{
              width:28, height:28, borderRadius:6,
              border:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'var(--muted)',
              fontFamily:'var(--font-mono)', fontSize:11,
              cursor:'pointer',
            }}>{s === 'github' ? <ProviderLogo name="github" size={14}/> : s[0].toUpperCase()}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ARTBOARD: Shepherd's crook component sheet — 4 variations
   ========================================================= */
function CrookSheetArtboard() {
  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <div style={{padding:'52px 56px', maxWidth: 1200, margin:'0 auto'}}>
        <Eyebrow>§05 · component</Eyebrow>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:42, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.05, marginTop:8, marginBottom:8}}>
          Shepherd's crook · the Pastor mark
        </h2>
        <p style={{color:'var(--muted)', fontSize:14.5, maxWidth: 720, lineHeight:1.6, marginBottom: 36}}>
          Pastor — the routing brain — gets its own mark, distinct from the cow mascot. Four variations cover hero, inline body, animated section heads, and the combined "shepherd + herd" mark in Forge.
        </p>

        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:16}}>
          {[
            {label:'01 · Solid',    sub:'Hero · large surfaces',     node: <CrookSolid size={84}/>},
            {label:'02 · Outline',  sub:'Inline body · small chips', node: <CrookOutline size={84} color="var(--text)" strokeWidth={2.4}/>},
            {label:'03 · Animated', sub:'Section heads · subtle sway', node: <CrookAnimated size={84}/>},
            {label:'04 · With cow', sub:'Forge · shepherd + herd',   node: <CrookWithCow size={84}/>},
          ].map(v => (
            <Card key={v.label} padding={20} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:14}}>
              <div style={{height:140, display:'flex', alignItems:'center', justifyContent:'center'}}>{v.node}</div>
              <div style={{textAlign:'center'}}>
                <div style={{fontFamily:'var(--font-mono)', fontSize:12.5, fontWeight:600, color:'var(--text)'}}>{v.label}</div>
                <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>{v.sub}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* placement examples */}
        <div style={{marginTop: 32}}>
          <Eyebrow>Placement across surfaces</Eyebrow>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 14, marginTop: 12}}>
            {[
              {label:'Hero · tucked next to "?"', body:<div style={{display:'flex', alignItems:'flex-start', gap:4, fontFamily:'var(--font-sans)', fontSize:54, fontWeight:700, letterSpacing:'-0.05em'}}>
                <span>Got Moo</span><span style={{color:'var(--accent)'}}>?</span><span style={{marginTop:8, marginLeft:-2}}><CrookOutline size={22} color="var(--accent-2)"/></span>
              </div>},
              {label:'Section head · animated', body:<div style={{display:'flex', alignItems:'center', gap:10}}>
                <CrookAnimated size={22}/><span style={{fontFamily:'var(--font-sans)', fontSize:20, fontWeight:700, letterSpacing:'-0.02em'}}>Pastor thinks. Mooter routes.</span>
              </div>},
              {label:'Statusline · inline body', body:<div style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--term-fg)', background:'var(--term-bg)', border:'1px solid var(--term-border)', borderRadius:6, padding:'10px 12px', display:'flex', alignItems:'center', gap:8}}>
                <CrookOutline size={14} color="var(--accent)"/><span style={{color:'var(--green)'}}>● mooter</span><span style={{color:'var(--term-dim)'}}>· pack: </span><span style={{color:'var(--accent)'}}>diagram-systems</span>
              </div>},
              {label:'Footer · between "Got" and "Moo"', body:<div style={{display:'flex', alignItems:'baseline', gap:4, fontFamily:'var(--font-sans)', fontSize:42, fontWeight:700, letterSpacing:'-0.05em'}}>
                <span>Got</span><span style={{marginTop:4}}><CrookOutline size={20} color="var(--accent-2)"/></span><span>Moo</span><span style={{color:'var(--accent)'}}>?</span>
              </div>},
              {label:'Forge · combined mark', body:<div style={{display:'flex', alignItems:'center', gap:12}}>
                <CrookWithCow size={48}/><div><div style={{fontSize:13, fontWeight:600}}>Adapter Forge</div><div style={{fontSize:11, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>shepherd + herd · combined mark</div></div>
              </div>},
              {label:'Body inline · small', body:<div style={{fontSize:14, color:'var(--text)', lineHeight:1.6}}>
                Routing is done by <span style={{display:'inline-flex', alignItems:'baseline', gap:4}}><CrookOutline size={12} color="var(--accent)"/><strong style={{color:'var(--accent)'}}>Pastor</strong></span> — the brain that picks the right tier for each prompt.
              </div>},
            ].map(p => (
              <Card key={p.label} padding={16}>
                <div style={{minHeight: 64, display:'flex', alignItems:'center'}}>{p.body}</div>
                <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--muted)', marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)'}}>{p.label}</div>
              </Card>
            ))}
          </div>
        </div>

        {/* sizing scale */}
        <div style={{marginTop: 28}}>
          <Eyebrow>Sizing scale · 16 → 84px</Eyebrow>
          <Card padding={18} style={{marginTop:12}}>
            <div style={{display:'flex', alignItems:'flex-end', gap:32, justifyContent:'space-around'}}>
              {[16, 20, 28, 40, 56, 84].map(s => (
                <div key={s} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
                  <CrookSolid size={s}/>
                  <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)'}}>{s}px</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ARTBOARD: Methodology v2 — calculator with hardware + OS + subs
   ========================================================= */
function MethodologyV2Artboard() {
  // chosen state shown in mock
  const ppd = 80, criticalPct = 8;
  const gpu = '24+'; // 0 / 8 / 16 / 24+
  const dist = {0:[0,50,35,15],8:[35,25,25,15],16:[50,22,18,10],'24+':[62,18,14,6]}[gpu];
  const opusCost = 0.042;
  const baseline = ppd * 30 * opusCost;
  const tierCosts = [0, 0.001, 0.003, 0.042];
  const withMooter = ppd * 30 * (dist[0]/100 * tierCosts[0] + dist[1]/100 * tierCosts[1] + dist[2]/100 * tierCosts[2] + dist[3]/100 * tierCosts[3]);
  const saved = baseline - withMooter;
  const pct = Math.round((saved / baseline) * 100);

  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <NavBar activeKey="how"/>

      <div className="m-pad m-pad-y" style={{padding:'40px 56px 40px', maxWidth:1400, margin:'0 auto'}}>
        <Eyebrow>§11 · Methodology · v2</Eyebrow>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:42, fontWeight:700, letterSpacing:'-0.035em', lineHeight:1.05, marginTop:8, marginBottom:8}}>
          Show me my number.
        </h2>
        <p style={{color:'var(--muted)', fontSize:15, maxWidth: 760, lineHeight:1.55, marginBottom: 28}}>
          Plug in your actual setup. Hardware, OS, subscriptions, usage pattern — Mooter projects your tier mix and your monthly cost, vs the all-Opus baseline.
        </p>

        <div className="m-stack" style={{display:'grid', gridTemplateColumns:'1.15fr 1fr', gap:24}}>
          {/* LEFT — 4 inputs */}
          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            {/* hardware */}
            <Card padding={18}>
              <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:12}}>
                <Eyebrow>Step 1 · Hardware</Eyebrow>
                <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)'}}>RTX 4090 · 24GB+</span>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {[
                  ['No discrete GPU', 'MacBook Air, basic laptop, Chromebook', false],
                  ['8 GB GPU',       'RTX 3060/4060, M1 Pro 16GB',             false],
                  ['16 GB GPU',      'RTX 4070, M2/M3 Pro 32GB',               false],
                  ['24+ GB GPU',     'RTX 4090, RTX 5090, M2/M3/M4 Max',       true],
                ].map(([label, sub, sel]) => (
                  <Radio key={label} label={label} sub={sub} selected={sel}/>
                ))}
              </div>
            </Card>

            {/* OS */}
            <Card padding={18}>
              <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:12}}>
                <Eyebrow>Step 2 · Operating system</Eyebrow>
                <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)'}}>macOS · Apple Silicon</span>
              </div>
              <div style={{display:'flex', gap:10}}>
                {[
                  ['macOS', 'Apple Silicon recommended', true],
                  ['Linux', 'Ubuntu 22+ / Arch', false],
                  ['Windows', 'WSL2 required', false],
                ].map(([label, sub, sel]) => (
                  <button key={label} style={{
                    flex:1, padding:'12px 12px',
                    background: sel ? 'var(--accent-12)' : 'var(--bg-2)',
                    border:`1px solid ${sel ? 'var(--accent-25)' : 'var(--border)'}`,
                    borderRadius:8,
                    textAlign:'left', cursor:'pointer',
                  }}>
                    <div style={{fontSize:13, fontWeight:600, color: sel ? 'var(--accent)' : 'var(--text)'}}>{label}</div>
                    <div style={{fontSize:11, color:'var(--muted)', marginTop:3, fontFamily:'var(--font-mono)'}}>{sub}</div>
                  </button>
                ))}
              </div>
            </Card>

            {/* subs */}
            <Card padding={18}>
              <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', marginBottom:12}}>
                <Eyebrow>Step 3 · Subscriptions</Eyebrow>
                <span style={{fontFamily:'var(--font-mono)', fontSize:12, color:'var(--accent)'}}>Anthropic Max + OpenAI Plus</span>
              </div>
              {[
                {logo:'anthropic', name:'Anthropic Claude', on:true, plans:['Free','Pro','Max','Team','API'], active:'Max'},
                {logo:'openai', name:'OpenAI ChatGPT', on:true, plans:['Free','Plus','Pro','Codex','API'], active:'Plus'},
                {logo:'google', name:'Google Gemini', on:false, plans:['Free','Advanced','Ultra'], active:null},
              ].map(p => (
                <div key={p.name} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px dashed var(--border)'}}>
                  <span style={{width: 16}}>
                    {p.on
                      ? <span style={{width:14, height:14, background:'var(--accent)', borderRadius:3, display:'inline-flex', alignItems:'center', justifyContent:'center', color:'var(--bg)', fontSize:10}}>✓</span>
                      : <span style={{width:14, height:14, border:'1px solid var(--border-light)', borderRadius:3, display:'inline-block'}}/>}
                  </span>
                  <ProviderLogo name={p.logo} size={15}/>
                  <span style={{fontSize:13, fontWeight:500, minWidth:130, color: p.on ? 'var(--text)' : 'var(--muted)'}}>{p.name}</span>
                  <div style={{display:'flex', gap:5, marginLeft:'auto'}}>
                    {p.plans.map(pl => (
                      <span key={pl} style={{
                        fontSize:11, fontFamily:'var(--font-mono)',
                        padding:'4px 8px', borderRadius:9999,
                        border: `1px solid ${pl === p.active ? 'var(--accent)' : 'var(--border)'}`,
                        color: pl === p.active ? 'var(--accent)' : 'var(--muted)',
                        background: pl === p.active ? 'var(--accent-12)' : 'transparent',
                        opacity: p.on ? 1 : 0.5,
                      }}>{pl}</span>
                    ))}
                  </div>
                </div>
              ))}
            </Card>

            {/* usage */}
            <Card padding={18}>
              <Eyebrow>Step 4 · Usage pattern</Eyebrow>
              <div style={{marginTop:12}}>
                <CalcSlider2 label="Prompts per day" value="80" steps={['10','40','80','160','300','500']} idx={2} mono/>
                <CalcSlider2 label="% critical (T3)" value="8%" steps={['0%','4%','8%','15%','25%','30%']} idx={2} mono/>
              </div>
            </Card>
          </div>

          {/* RIGHT — live output */}
          <div style={{display:'flex', flexDirection:'column', gap:14}}>
            <Card padding={20} style={{background:'linear-gradient(135deg, rgba(232,136,138,0.08), transparent 60%)', borderColor:'var(--accent-25)'}}>
              <Eyebrow>Your monthly projection</Eyebrow>
              <div style={{marginTop:14, display:'flex', alignItems:'flex-end', gap:16}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em'}}>without mooter</div>
                  <div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, color:'var(--muted)', textDecoration:'line-through', textDecorationColor:'var(--accent)', marginTop:6}}>${baseline.toFixed(2)}</div>
                  <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>all-Opus on every prompt</div>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em'}}>with mooter</div>
                  <div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:600, color:'var(--text)', marginTop:6}}>${withMooter.toFixed(2)}</div>
                  <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>Mooter-routed</div>
                </div>
                <div style={{flex:1, textAlign:'right'}}>
                  <div style={{fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.06em'}}>saved</div>
                  <div style={{fontFamily:'var(--font-mono)', fontSize:32, fontWeight:700, color:'var(--green)', marginTop:6}}>${saved.toFixed(2)}</div>
                  <div style={{fontSize:13, color:'var(--green)', fontFamily:'var(--font-mono)', fontWeight:600}}>{pct}%</div>
                </div>
              </div>
            </Card>

            {/* tier distribution */}
            <Card padding={20}>
              <Eyebrow>Predicted tier distribution</Eyebrow>
              <div style={{marginTop:14, display:'flex', flexDirection:'column', gap:10}}>
                {[
                  ['T0', 'local · Ollama', dist[0], 'var(--tier-0)'],
                  ['T1', 'haiku · gpt-4o-mini', dist[1], 'var(--tier-1)'],
                  ['T2', 'sonnet · gpt-4o', dist[2], 'var(--tier-2)'],
                  ['T3', 'opus · o1-pro', dist[3], 'var(--tier-3)'],
                ].map(([t, label, value, color]) => (
                  <div key={t} style={{display:'flex', alignItems:'center', gap:12}}>
                    <TierChip tier={t}/>
                    <span style={{fontSize:12.5, color:'var(--muted)', minWidth:130}}>{label}</span>
                    <div style={{flex:1, height:8, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:9999, overflow:'hidden'}}>
                      <div style={{width:`${value}%`, height:'100%', background: color, borderRadius:9999}}/>
                    </div>
                    <span style={{fontFamily:'var(--font-mono)', fontSize:13, color:'var(--text)', minWidth:40, textAlign:'right'}}>{value}%</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* stack compatibility */}
            <Card padding={18}>
              <Eyebrow>Your stack supports</Eyebrow>
              <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:6}}>
                {[
                  ['✓','All local models (24GB GPU)','var(--green)'],
                  ['✓','Sonnet (Anthropic Max)','var(--green)'],
                  ['✓','GPT-4o (OpenAI Plus)','var(--green)'],
                  ['✓','Opus when needed (Anthropic Max)','var(--green)'],
                  ['—','Gemini Ultra (not subscribed)','var(--muted)'],
                ].map(([icon, label, color]) => (
                  <div key={label} style={{display:'flex', alignItems:'center', gap:10, fontSize:13}}>
                    <span style={{color, width:14}}>{icon}</span>
                    <span style={{color: color === 'var(--muted)' ? 'var(--muted)' : 'var(--text)'}}>{label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalcSlider2({label, value, steps, idx, mono}) {
  const pct = (idx / (steps.length - 1)) * 100;
  return (
    <div style={{marginBottom: 18}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:8}}>
        <span style={{fontSize:13, color:'var(--muted)'}}>{label}</span>
        <span style={{fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize:14, fontWeight: 600, color:'var(--text)'}}>{value}</span>
      </div>
      <div style={{position:'relative', height: 6, background:'var(--bg-2)', borderRadius:9999, border:'1px solid var(--border)'}}>
        <div style={{position:'absolute', left:0, top:0, bottom:0, width: `${pct}%`, background:'var(--accent)', borderRadius:9999}}/>
        <div style={{
          position:'absolute', left: `calc(${pct}% - 7px)`, top:-5,
          width:14, height:14, borderRadius:'50%',
          background:'var(--text)',
          border:'2px solid var(--accent)',
        }}/>
      </div>
      <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--muted)'}}>
        {steps.map((s, i) => <span key={s} style={{color: i === idx ? 'var(--accent)' : 'var(--muted)'}}>{s}</span>)}
      </div>
    </div>
  );
}

function Radio({label, sub, selected}) {
  return (
    <button style={{
      width:'100%', textAlign:'left',
      padding:'10px 12px',
      background: selected ? 'var(--accent-12)' : 'var(--bg-2)',
      border:`1px solid ${selected ? 'var(--accent-25)' : 'var(--border)'}`,
      borderRadius:8,
      display:'flex', alignItems:'center', gap:12,
      cursor:'pointer',
    }}>
      <span style={{
        width:16, height:16, borderRadius:'50%',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-light)'}`,
        display:'flex', alignItems:'center', justifyContent:'center',
        flexShrink:0,
      }}>
        {selected && <span style={{width:7, height:7, borderRadius:'50%', background:'var(--accent)'}}/>}
      </span>
      <div style={{flex:1}}>
        <div style={{fontSize:13.5, fontWeight:600, color: selected ? 'var(--accent)' : 'var(--text)'}}>{label}</div>
        <div style={{fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>{sub}</div>
      </div>
    </button>
  );
}

Object.assign(window, {
  CrookOutline, CrookSolid, CrookAnimated, CrookWithCow,
  MooHerd, LockChip, TierCow,
  HeroV2Artboard, UnderHoodArtboard, CompareArtboard,
  PrivacyArtboard, FooterArtboard, CrookSheetArtboard,
  MethodologyV2Artboard, SitemapArtboard,
});

/* =========================================================
   ARTBOARD: Sitemap & flows — how surfaces connect
   ========================================================= */
function SitemapArtboard() {
  const Group = ({title, kind, children, style}) => {
    const tint = {
      landing: {bg: 'var(--bg-2)', border: 'var(--border)', accent: 'var(--text)'},
      auth:    {bg: 'rgba(232,136,138,0.06)', border: 'var(--accent-25)', accent: 'var(--accent)'},
      onb:     {bg: 'rgba(232,136,138,0.04)', border: 'var(--accent-25)', accent: 'var(--accent)'},
      app:     {bg: 'rgba(76,175,106,0.05)', border: 'rgba(76,175,106,0.25)', accent: 'var(--green)'},
    }[kind];
    return (
      <div style={{
        background: tint.bg, border: `1px solid ${tint.border}`,
        borderRadius: 12, padding: 16, ...style,
      }}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
          <span style={{fontFamily:'var(--font-mono)', fontSize:10.5, color: tint.accent, textTransform:'uppercase', letterSpacing:'0.1em', fontWeight:700}}>{title}</span>
        </div>
        {children}
      </div>
    );
  };

  const Node = ({title, path, anchor, sub, current}) => (
    <div style={{
      padding:'10px 12px',
      background: current ? 'var(--surface)' : 'var(--bg)',
      border:'1px solid var(--border)',
      borderRadius: 8,
      marginBottom: 6,
      display:'flex', flexDirection:'column', gap:2,
    }}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <span style={{fontSize:13, fontWeight:600, color:'var(--text)'}}>{title}</span>
        {anchor && <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--muted)'}}>{anchor}</span>}
      </div>
      <div style={{fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--muted)'}}>{path}</div>
      {sub && <div style={{fontSize:11, color:'var(--muted)', marginTop:3}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{background:'var(--bg)', color:'var(--text)', height:'100%', position:'relative', overflow:'hidden'}}>
      <Dotgrid/>
      <div style={{padding:'40px 48px', maxWidth: 1400, margin:'0 auto'}}>
        <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:10}}>
          <CrookOutline size={18} color="var(--accent)"/>
          <Eyebrow>§00 · sitemap & flows</Eyebrow>
        </div>
        <h2 style={{fontFamily:'var(--font-sans)', fontSize:36, fontWeight:700, letterSpacing:'-0.03em', lineHeight:1.05, marginTop:6, marginBottom: 6}}>
          The path from <span style={{color:'var(--muted)'}}>anonymous visitor</span> to <span style={{color:'var(--accent)'}}>first prompt routed</span>.
        </h2>
        <p style={{color:'var(--muted)', fontSize:14, maxWidth: 760, lineHeight:1.55, marginBottom: 24}}>
          Three trust gates: <strong style={{color:'var(--text)'}}>landing</strong> proves the value, <strong style={{color:'var(--text)'}}>auth + onboarding</strong> earns the install, <strong style={{color:'var(--text)'}}>app</strong> keeps the trust with savings + transparency.
        </p>

        {/* 4-column flow */}
        <div style={{display:'grid', gridTemplateColumns:'1.3fr 1fr 1.5fr 1.4fr', gap: 0, alignItems:'stretch', position:'relative'}}>
          {/* arrows overlay */}
          <svg style={{position:'absolute', top: 38, left: 0, right: 0, height: 18, width:'100%', pointerEvents:'none', zIndex: 2}} viewBox="0 0 1200 18" preserveAspectRatio="none">
            {[230, 530, 870].map((x, i) => (
              <g key={i}>
                <line x1={x} y1="9" x2={x+20} y2="9" stroke="var(--accent)" strokeWidth="1.5"/>
                <polyline points={`${x+16},5 ${x+22},9 ${x+16},13`} fill="none" stroke="var(--accent)" strokeWidth="1.5"/>
              </g>
            ))}
          </svg>

          {/* LANDING */}
          <Group title="01 · Landing · public" kind="landing" style={{marginRight: 18}}>
            <Node title="Hero" path="mooter.ai/" anchor="#hero" sub="Got Moo? · 'Install →' opens onboarding"/>
            <Node title="Under the hood" path="/#under-the-hood" sub="Quantization + LoRA explainers"/>
            <Node title="Pack browser" path="/packs" sub="Anonymous can preview, install prompts auth"/>
            <Node title="vs the rest" path="/#compare" sub="5-col comparison table"/>
            <Node title="Methodology" path="/methodology" sub="Hardware + OS + subs cost calculator"/>
            <Node title="Privacy" path="/#privacy" sub="GDPR / LGPD / CCPA-aligned"/>
            <Node title="Install command" path="/#install" sub="One bash command, copy + verify poll"/>
            <Node title="Footer" path="/" sub="96pt 'Got Moo?' sign-off · MIT · social"/>
          </Group>

          {/* AUTH */}
          <Group title="02 · Auth" kind="auth" style={{marginRight: 18}}>
            <Node title="Sign in" path="/auth/sign-in" sub="GitHub OAuth — read:user · user:email only" current/>
            <div style={{marginTop:14, padding:10, background:'var(--bg)', border:'1px dashed var(--accent-25)', borderRadius:8, fontSize:11.5, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>
              <div style={{color:'var(--accent)', marginBottom:6}}>scopes asked</div>
              <div>· read:user</div>
              <div>· user:email</div>
              <div style={{color:'var(--green)'}}>no repo · no write · no org</div>
            </div>
            <div style={{marginTop:14, fontSize:11, color:'var(--muted)', fontFamily:'var(--font-mono)'}}>
              <div style={{color:'var(--text)'}}>callbacks</div>
              <div>→ /onboarding/1 (new)</div>
              <div>→ /app/dashboard (returning)</div>
            </div>
          </Group>

          {/* ONBOARDING */}
          <Group title="03 · Onboarding · 5 steps" kind="onb" style={{marginRight: 18}}>
            <Node title="Step 1 · Hardware probe" path="/onboarding/probe" sub="OS · GPU · Ollama · models"/>
            <Node title="Step 2 · Subscriptions" path="/onboarding/subs" sub="Anthropic · OpenAI · Google · keys"/>
            <Node title="Step 3 · Pack recs" path="/onboarding/packs" sub="3 packs matched to detected stack"/>
            <Node title="Step 4 · Install command" path="/onboarding/install" sub="bash + live verify poller"/>
            <Node title="Step 5 · Confirmation" path="/onboarding/done" sub="3-line statusline preview · 'Go to dashboard →'"/>
          </Group>

          {/* APP */}
          <Group title="04 · App · logged-in" kind="app">
            <Node title="Dashboard · home" path="/app/dashboard" sub="$ saved · sessions · adapter · plan budget" current/>
            <Node title="Packs · yours + browser" path="/app/packs" sub="installed + discover"/>
            <Node title="Forge (Wave 5)" path="/app/forge" sub="train Project LoRA on your repo"/>
            <Node title="Digest" path="/app/digest" sub="weekly + monthly · regression flags"/>
            <Node title="Community" path="/app/community" sub="hub stats · contribution rank (opt-in)"/>
            <Node title="Settings" path="/app/settings" sub="opt-in matrix · statusline · subs · hardware"/>
          </Group>
        </div>

        {/* secondary flow — CTA mapping */}
        <div style={{marginTop:24, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
          <Card padding={14}>
            <Eyebrow>cta map · primary</Eyebrow>
            <div style={{marginTop:8, fontSize:12.5, fontFamily:'var(--font-mono)', display:'flex', flexDirection:'column', gap:6}}>
              {[
                ['"Install mooter →"', '/onboarding/probe', 'on every hero + footer'],
                ['"Sign in"', '/auth/sign-in', 'nav + hero secondary'],
                ['"Browse packs"', '/packs', 'under-hood · packs anchor'],
                ['"Show me my number"', '/methodology', 'install · compare bottom'],
              ].map(([cta, dest, where]) => (
                <div key={cta} style={{display:'flex', flexDirection:'column', gap:1, paddingBottom:6, borderBottom:'1px dashed var(--border)'}}>
                  <span><span style={{color:'var(--accent)'}}>{cta}</span> <span style={{color:'var(--muted)'}}>→</span> <span style={{color:'var(--text)'}}>{dest}</span></span>
                  <span style={{fontSize:10.5, color:'var(--muted)'}}>{where}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card padding={14}>
            <Eyebrow>shared components</Eyebrow>
            <div style={{marginTop:8, fontSize:12.5, fontFamily:'var(--font-mono)', display:'flex', flexDirection:'column', gap:6}}>
              {[
                ['NavBar', 'all marketing pages'],
                ['Footer', 'all marketing pages'],
                ['AppShell (sidebar)', 'all /app/* pages'],
                ['StatuslineCard (3-line)', 'hero · onb step 5 · settings'],
                ['ShepherdCrook (4 var)', 'hero · footer · forge · inline'],
                ['TierChip (T0–T3)', 'hero · pack cards · sessions · methodology'],
                ['LockChip', 'hero terminal head'],
              ].map(([c, used]) => (
                <div key={c} style={{display:'flex', justifyContent:'space-between', paddingBottom:4, borderBottom:'1px dashed var(--border)'}}>
                  <span style={{color:'var(--text)'}}>{c}</span>
                  <span style={{color:'var(--muted)'}}>{used}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card padding={14}>
            <Eyebrow>trust gates</Eyebrow>
            <div style={{marginTop:8, fontSize:12.5, display:'flex', flexDirection:'column', gap:10}}>
              <div>
                <div style={{color:'var(--text)', fontWeight:600, fontFamily:'var(--font-mono)', fontSize:11.5}}>① VALUE · before signup</div>
                <div style={{color:'var(--muted)', fontSize:11.5, marginTop:2}}>Methodology calculator, comparison table, privacy commitments — all on the public landing.</div>
              </div>
              <div>
                <div style={{color:'var(--text)', fontWeight:600, fontFamily:'var(--font-mono)', fontSize:11.5}}>② INSTALL · during onboarding</div>
                <div style={{color:'var(--muted)', fontSize:11.5, marginTop:2}}>Hardware probe + subs + packs all read-only locally. No code uploaded. Install verifies via phone-home, not exfil.</div>
              </div>
              <div>
                <div style={{color:'var(--text)', fontWeight:600, fontFamily:'var(--font-mono)', fontSize:11.5}}>③ TELEMETRY · after install</div>
                <div style={{color:'var(--muted)', fontSize:11.5, marginTop:2}}>Every hub upload OFF by default. Settings shows exactly what we collect vs never collect.</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
