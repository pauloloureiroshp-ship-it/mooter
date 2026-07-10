/* Mooter v1 — shared primitives used across all artboards
   Exposed on window: MooterMark, PastorCrook, Cow, TierChip, MonoNum,
   StatuslineCard, TerminalCard, NavBar, Btn, Card, Eyebrow, Dotgrid,
   ProviderLogo, TrafficLights, ProgressBar, MooEmoji */

/* ---------- single source of truth: version ----------
   In the real repo this reads from version.json so it can never drift.
   Here it's one constant referenced everywhere — never hardcode a version
   string in a page or component; use MOOTER_VERSION / MOOTER_VTAG. */
const MOOTER_VERSION = '1.38.5';
const MOOTER_VTAG = 'v' + MOOTER_VERSION;          // "v1.38.5"
const MOOTER_VSHORT = 'v' + MOOTER_VERSION.split('.').slice(0, 2).join('.'); // "v1.38"
if (typeof window !== 'undefined') { window.MOOTER_VERSION = MOOTER_VERSION; window.MOOTER_VTAG = MOOTER_VTAG; window.MOOTER_VSHORT = MOOTER_VSHORT; }

/* ---------- mascot ---------- */
// Global href resolver — set window.MOOTER_ROUTES = {key: '/path', ...}
// to make buttons/anchors navigable. Returns undefined in the canvas.
function mhref(key) { return (typeof window !== 'undefined' && window.MOOTER_ROUTES) ? window.MOOTER_ROUTES[key] : undefined; }
function MooterMark({size=28}) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-label="mooter">
      {/* ears — orange */}
      <path fill="#FF6B35" d="M1 1c-1.01.99 1 8 5 9s4-5 3-5C5 5 3.042-1 1 1z"/>
      <path fill="#FF6B35" d="M35.297 1c1.011.99-1 8-5 9s-4-5-3-5c4 0 5.959-6 8-4z"/>
      <path fill="#E85D2A" d="M4 8s-4 2-4 11c0 0 6-1 7-3 0 0 2-12.25-3-8z"/>
      <path fill="#E85D2A" d="M27.995 8.043s4 2 4 11c0 0-6-.999-7-2.999 0 0-2-12.251 3-8.001z"/>
      {/* head — cream */}
      <path fill="#F5EDD4" d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z"/>
      {/* muzzle — pale cream */}
      <path fill="#FBE6C8" d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z"/>
      <ellipse fill="#D98A5C" cx="9.5" cy="26" rx="1.5" ry="3"/>
      <ellipse fill="#D98A5C" cx="26.5" cy="26" rx="1.5" ry="3"/>
      {/* eyes — dark with catch-light */}
      <path fill="#2A2622" d="M11 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
      <path fill="#2A2622" d="M21 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
      <circle fill="#FFFFFF" cx="12.4" cy="11.6" r="0.7"/>
      <circle fill="#FFFFFF" cx="22.4" cy="11.6" r="0.7"/>
    </svg>
  );
}

/* Pastor — the routing engine. Shepherd's crook + small herd dot.
   This is the brand mark for the engine; distinct from the mascot. */
function PastorCrook({size=18, color='currentColor'}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-label="Mooter router mark">
      <path d="M9 2c2.8 0 4.5 2.2 4.5 5v0c0 2.5-2 4-2 4"/>
      <path d="M11.5 11l-3 11"/>
      <circle cx="18" cy="19" r="1.5" fill={color} stroke="none"/>
    </svg>
  );
}

/* Cow expression set — Moo / CrazyMoo / LazyMoo
   Tiny inline SVGs so they sit inline with text in chips. */
function MooEmoji({mood='moo', size=18}) {
  // simplified cow head with mood expression
  const eyes = {
    moo:   <g><circle cx="13" cy="14" r="1.4" fill="#2C2F33"/><circle cx="23" cy="14" r="1.4" fill="#2C2F33"/></g>,
    crazy: <g><path d="M11 13l4 2M11 15l4-2" stroke="#2C2F33" strokeWidth="1.4"/><path d="M21 13l4 2M21 15l4-2" stroke="#2C2F33" strokeWidth="1.4"/></g>,
    lazy:  <g><path d="M11 14h4M21 14h4" stroke="#2C2F33" strokeWidth="1.6" strokeLinecap="round"/></g>,
  }[mood];
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-label={mood}>
      <path fill="#CCD3DA" d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z"/>
      <path fill="#EDAEB0" d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z"/>
      <ellipse fill="#C16A6F" cx="9.5" cy="26" rx="1.5" ry="3"/>
      <ellipse fill="#C16A6F" cx="26.5" cy="26" rx="1.5" ry="3"/>
      {eyes}
    </svg>
  );
}

/* ---------- tier chip ---------- */
function TierChip({tier, label, full=false}) {
  const map = {
    T0: {c: 'var(--tier-0)', t: 'T0', name: 'local'},
    T1: {c: 'var(--tier-1)', t: 'T1', name: 'haiku'},
    T2: {c: 'var(--tier-2)', t: 'T2', name: 'sonnet'},
    T3: {c: 'var(--tier-3)', t: 'T3', name: 'opus'},
  };
  const x = map[tier] || map.T2;
  return (
    <span className="tier-chip-x" style={{
      color: x.c,
      borderColor: x.c,
      background: 'transparent',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: '0.02em',
      border: '1px solid currentColor',
      padding: '2px 8px',
      borderRadius: 4,
    }}>
      <span>{x.t}</span>
      {(label || full) && <span style={{opacity: 0.78, fontWeight: 500}}>{label || x.name}</span>}
    </span>
  );
}

function MonoNum({children, color, size}) {
  return <span style={{fontFamily:'var(--font-mono)', fontVariantNumeric:'tabular-nums', color, fontSize:size}}>{children}</span>;
}

function Eyebrow({children}) {
  return <span style={{fontFamily:'var(--font-mono)', fontSize: 11, textTransform:'uppercase', letterSpacing:'0.14em', color:'var(--muted)', fontWeight: 500}}>{children}</span>;
}

/* ---------- traffic lights (signature) ---------- */
function TrafficLights() {
  return (
    <div style={{display:'flex', gap:6, alignItems:'center'}}>
      <span style={{width:11, height:11, borderRadius:'50%', background:'#ff5f56'}}/>
      <span style={{width:11, height:11, borderRadius:'50%', background:'#ffbd2e'}}/>
      <span style={{width:11, height:11, borderRadius:'50%', background:'#27c93f'}}/>
    </div>
  );
}

/* ---------- terminal card shell ---------- */
function TerminalCard({title='claude · live', subtitle, children, style}) {
  return (
    <div style={{
      background: 'var(--term-bg)',
      border: '1px solid var(--term-border)',
      borderRadius: 10,
      overflow: 'hidden',
      fontFamily: 'var(--font-mono)',
      color: 'var(--term-fg)',
      ...style,
    }}>
      <div style={{
        display:'flex', alignItems:'center', gap:14,
        padding:'10px 14px',
        background:'var(--term-header)',
        borderBottom:'1px solid var(--term-border)',
        fontSize: 11.5,
      }}>
        <TrafficLights/>
        <div style={{color:'var(--term-dim)', display:'flex', gap:8, alignItems:'center'}}>
          <span>{title}</span>
          {subtitle && <><span style={{opacity:0.5}}>·</span><span>{subtitle}</span></>}
        </div>
      </div>
      <div style={{padding: '14px 16px'}}>
        {children}
      </div>
    </div>
  );
}

/* ---------- 3-line statusline (Wave 2 spec) ---------- */
function StatuslineCard({width='100%', state='healthy', compact=false}) {
  // 3 lines:
  //   1. savings + tier + pack
  //   2. budgets (5h / 7d / reset)
  //   3. ctx + adapter + per-turn cost + alltime
  const color = state === 'healthy' ? 'var(--green)' : state === 'marginal' ? 'var(--yellow)' : 'var(--tier-3)';
  return (
    <div style={{
      background: '#0a0c10',
      border: '1px solid var(--term-border)',
      borderRadius: 8,
      padding: '12px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      lineHeight: 1.7,
      color: 'var(--term-fg)',
      width,
    }}>
      {/* line 1 */}
      <div style={{display:'flex', flexWrap:'wrap', gap:'0 14px', alignItems:'center'}}>
        <span style={{color}}>● mooter</span>
        <span><span style={{color:'var(--term-dim)'}}>saved</span> <span style={{color}}>$0.31</span> <span style={{color:'var(--term-dim)'}}>today (</span><span style={{color}}>89%</span><span style={{color:'var(--term-dim)'}}>)</span></span>
        <span style={{color:'var(--term-dim)'}}>·</span>
        <TierChip tier="T2" label="sonnet"/>
        <span style={{color:'var(--term-dim)'}}>·</span>
        <span><span style={{color:'var(--term-dim)'}}>pack:</span> <span style={{color:'var(--accent)'}}>diagram-systems</span></span>
      </div>
      {/* line 2 */}
      <div style={{display:'flex', flexWrap:'wrap', gap:'0 14px', alignItems:'center'}}>
        <ProgressBar value={42} color="var(--tier-2)" label="42% 5h"/>
        <span style={{color:'var(--term-dim)'}}>·</span>
        <ProgressBar value={18} color="var(--tier-1)" label="18% 7d"/>
        <span style={{color:'var(--term-dim)'}}>·</span>
        <span style={{color:'var(--term-dim)'}}>↺ <span style={{color:'var(--term-fg)'}}>2h14m</span></span>
      </div>
      {/* line 3 */}
      <div style={{display:'flex', flexWrap:'wrap', gap:'0 14px', alignItems:'center'}}>
        <span style={{color:'var(--term-dim)'}}>ctx <span style={{color:'var(--term-fg)'}}>23%</span></span>
        <span style={{color:'var(--term-dim)'}}>·</span>
        <span style={{color:'var(--term-dim)'}}>adapter: <span style={{color:'var(--accent)'}}>code-audit-v0.2</span> <span style={{color:'var(--term-dim)'}}>◌</span></span>
        <span style={{color:'var(--term-dim)'}}>·</span>
        <span style={{color:'var(--term-dim)'}}>$<span style={{color:'var(--term-fg)'}}>0.04</span>/turn</span>
        <span style={{color:'var(--term-dim)'}}>·</span>
        <span style={{color:'var(--term-dim)'}}>alltime <span style={{color:'var(--green)'}}>$4.21</span></span>
      </div>
    </div>
  );
}

function ProgressBar({value=42, color='var(--accent)', label, width=60, height=8, inline=true}) {
  // ASCII-bar style for terminal-feel, but actual blocks
  const blocks = 10;
  const filled = Math.round((value/100) * blocks);
  return (
    <span style={{display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--font-mono)', fontSize: inline ? 12 : 13}}>
      <span style={{letterSpacing:1}}>
        <span style={{color}}>{'▓'.repeat(filled)}</span><span style={{color:'#252220'}}>{'░'.repeat(blocks-filled)}</span>
      </span>
      {label && <span style={{color:'var(--term-dim)'}}>{label}</span>}
    </span>
  );
}

/* ---------- nav bar ---------- */
function NavBar({activeKey, theme='dark'}) {
  const items = [
    ['how-it-works','How it works','under-hood'],
    ['packs','Packs','packs'],
    ['compare','Compare','compare'],
    ['commands','Commands','commands'],
    ['install','Install','install-cta'],
  ];
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding: '14px 32px',
      borderBottom: '1px solid var(--border)',
      background: 'rgba(11,10,9,0.92)',
      backdropFilter: 'blur(16px)',
    }}>
      <a href={mhref('home') || '#'} style={{display:'flex', alignItems:'center', gap:10, textDecoration:'none', color:'inherit'}}>
        <MooterMark size={26}/>
        <span style={{fontFamily:'var(--font-sans)', fontWeight:600, fontSize:17, letterSpacing:'-0.02em'}}>mooter</span>
      </a>
      <nav style={{display:'flex', gap:28, alignItems:'center'}}>
        {items.map(([k,t,routeKey]) => (
          <a key={k} href={mhref(routeKey) || `#${k}`} style={{
            fontSize:13.5,
            color: activeKey === k ? 'var(--text)' : 'var(--muted)',
            textDecoration:'none',
            fontFamily:'var(--font-sans)',
            fontWeight: activeKey === k ? 600 : 500,
          }}>{t}</a>
        ))}
      </nav>
      <div style={{display:'flex', gap:10, alignItems:'center'}}>
        <a href={mhref('signin') || '#'} style={{fontSize:13.5, color:'var(--muted)', textDecoration:'none'}}>Sign in</a>
        <Btn href={mhref('install')}>Install in 30s →</Btn>
      </div>
    </div>
  );
}

/* ---------- button ---------- */
function Btn({children, kind='primary', size='md', style, icon, onClick, href}) {
  const palette = {
    primary:  {bg:'var(--text)', color:'var(--bg)', border:'var(--text)'},
    accent:   {bg:'var(--accent)', color:'#1A0E10', border:'var(--accent)'},
    ghost:    {bg:'transparent', color:'var(--text)', border:'var(--border-light)'},
    rose:     {bg:'rgba(232,136,138,0.10)', color:'var(--accent)', border:'rgba(232,136,138,0.35)'},
  }[kind];
  const sz = {
    sm: {padding:'7px 12px', fontSize:12.5},
    md: {padding:'10px 16px', fontSize:13.5},
    lg: {padding:'14px 22px', fontSize:15},
  }[size];
  const sx = {
    ...sz,
    background: palette.bg,
    color: palette.color,
    border: `1px solid ${palette.border}`,
    borderRadius: 8,
    fontFamily:'var(--font-sans)',
    fontWeight: 600,
    letterSpacing:'-0.01em',
    cursor:'pointer',
    display:'inline-flex', alignItems:'center', gap:8,
    textDecoration:'none',
    ...style,
  };
  if (href) {
    return <a href={href} style={sx}>{icon}{children}</a>;
  }
  return (
    <button onClick={onClick} style={sx}>
      {icon}{children}
    </button>
  );
}

/* ---------- generic card ---------- */
function Card({children, style, padding=20, hover=false}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ---------- provider logos (simplified) ---------- */
function ProviderLogo({name, size=16}) {
  const map = {
    anthropic: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M14.7 3h-2.8L7 21h2.9l1.1-3.3h5.1L17.1 21H20L14.7 3zm-2.9 11.6L13.5 9l1.7 5.6h-3.4z"/></svg>
    ),
    openai: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M21.55 10.04a5.42 5.42 0 0 0-.47-4.45 5.5 5.5 0 0 0-5.92-2.62 5.5 5.5 0 0 0-9.3 1.97 5.5 5.5 0 0 0-3.66 2.65A5.5 5.5 0 0 0 2.85 14a5.5 5.5 0 0 0 .47 4.45 5.5 5.5 0 0 0 5.92 2.62 5.5 5.5 0 0 0 9.3-1.97 5.5 5.5 0 0 0 3.66-2.65 5.5 5.5 0 0 0-.65-6.41zM13.26 20.5a4.1 4.1 0 0 1-2.63-.95l.13-.07 4.36-2.52a.71.71 0 0 0 .36-.62v-6.16l1.84 1.07c.02 0 .03.03.04.05v5.1a4.13 4.13 0 0 1-4.1 4.1zM4.45 16.74a4.1 4.1 0 0 1-.49-2.74l.13.08 4.37 2.52c.22.13.5.13.72 0L14.5 13.5v2.13a.07.07 0 0 1-.03.06l-4.42 2.55a4.1 4.1 0 0 1-5.6-1.5zM3.3 7.07A4.1 4.1 0 0 1 5.46 5.27v5.2a.7.7 0 0 0 .36.62l5.32 3.07-1.84 1.06a.07.07 0 0 1-.06 0L4.81 12.66a4.1 4.1 0 0 1-1.51-5.6zm15.16 3.53l-5.32-3.08L15 6.46a.07.07 0 0 1 .06 0l4.42 2.55a4.1 4.1 0 0 1-.62 7.4v-5.2a.71.71 0 0 0-.36-.61zm1.83-2.76l-.13-.08-4.36-2.52a.7.7 0 0 0-.72 0L9.5 8.5V6.37a.07.07 0 0 1 .03-.06l4.42-2.55a4.1 4.1 0 0 1 6.1 4.25zm-9.5 3.8l-1.84-1.07a.07.07 0 0 1-.03-.05V6.42a4.1 4.1 0 0 1 6.74-3.16l-.13.07L11.17 5.85a.71.71 0 0 0-.36.62l-.01 6.15zm1 1.84L12 12.36l2.21 1.27v2.55L12 17.45l-2.2-1.27z"/></svg>
    ),
    google: (
      <svg viewBox="0 0 24 24" width={size} height={size}><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.48 12c0-.73.13-1.44.36-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07L5.84 9.9C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
    ),
    ollama: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2C8 2 5 5 5 9c0 2 .5 3.5 1.5 5C5 15.5 4 17.5 4 19.5c0 1 1 1.5 2 1.5h12c1 0 2-.5 2-1.5 0-2-1-4-2.5-5.5C18.5 12.5 19 11 19 9c0-4-3-7-7-7zm-3 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>
    ),
    github: (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor"><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.69 0 3.84-2.34 4.68-4.57 4.93.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>
    ),
  };
  return <span style={{display:'inline-flex', alignItems:'center', color:'currentColor'}}>{map[name] || null}</span>;
}

/* ---------- dot grid background ---------- */
function Dotgrid({color='rgba(255,255,255,0.025)', size=22, style}) {
  return (
    <div style={{
      position:'absolute',
      inset:0,
      pointerEvents:'none',
      backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`,
      backgroundSize: `${size}px ${size}px`,
      ...style,
    }}/>
  );
}

Object.assign(window, {
  mhref,
  MooterMark, PastorCrook, MooEmoji, TierChip, MonoNum, Eyebrow,
  TrafficLights, TerminalCard, StatuslineCard, ProgressBar,
  NavBar, Btn, Card, ProviderLogo, Dotgrid,
});
