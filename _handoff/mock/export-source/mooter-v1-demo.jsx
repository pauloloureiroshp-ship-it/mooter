/* mooter-v1-demo.jsx — the 2-terminal showpiece.
   Same prompt stream typed into both terminals: vanilla Claude Code
   (everything → Opus) vs Claude Code + mooter (routed across T0–T3).
   The cumulative math is internally consistent and lands on the real 47%.
   Exposed on window: TwoTerminalDemo */

const { Eyebrow: DemoEyebrow, MonoNum: DemoMonoNum, TrafficLights: DemoTrafficLights } = window;

/* Honest routing trace. Hard prompts (the schema migration) still go to
   Opus on BOTH sides — mooter only routes down when quality holds. */
const DEMO_PROMPTS = [
  { p: 'fix the typo in the README',                van: 0.04, tier: 'T0', tcolor: 'var(--tier-0)', model: 'qwen2.5-coder · local', cost: 0.00, note: 'trivial → local' },
  { p: 'rename `userId` across the repo',           van: 0.06, tier: 'T0', tcolor: 'var(--tier-0)', model: 'qwen2.5-coder · local', cost: 0.00, note: 'mechanical → local' },
  { p: 'explain why this test is flaky',            van: 0.12, tier: 'T1', tcolor: 'var(--tier-1)', model: 'claude-haiku',           cost: 0.02, note: 'light reasoning → haiku' },
  { p: 'draft the system map for the auth refactor',van: 0.40, tier: 'T2', tcolor: 'var(--tier-2)', model: 'claude-sonnet',          cost: 0.08, note: 'arch · medium → sonnet' },
  { p: 'design the billing schema migration plan',  van: 0.52, tier: 'T3', tcolor: 'var(--tier-3)', model: 'claude-opus',            cost: 0.52, note: 'hard → kept on opus' },
  { p: 'write the commit message',                  van: 0.03, tier: 'T0', tcolor: 'var(--tier-0)', model: 'qwen2.5-coder · local', cost: 0.00, note: 'trivial → local' },
];

const fmt = (n) => '$' + n.toFixed(2);

function TwoTerminalDemo() {
  const [runId, setRunId] = React.useState(0);
  const [st, setSt] = React.useState({ idx: 0, typed: 0, phase: 'typing', completed: 0 });
  const [started, setStarted] = React.useState(false);
  const rootRef = React.useRef(null);
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Only start once scrolled into view (and not at all under reduced-motion).
  React.useEffect(() => {
    if (reduceMotion) { setSt({ idx: DEMO_PROMPTS.length - 1, typed: 0, phase: 'finished', completed: DEMO_PROMPTS.length }); return; }
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setStarted(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setStarted(true); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduceMotion]);

  React.useEffect(() => {
    if (!started || reduceMotion) return;
    let cancelled = false;
    const timers = [];
    const wait = (ms) => new Promise((r) => timers.push(setTimeout(r, ms)));
    (async () => {
      setSt({ idx: 0, typed: 0, phase: 'typing', completed: 0 });
      await wait(500);
      for (let i = 0; i < DEMO_PROMPTS.length; i++) {
        if (cancelled) return;
        const text = DEMO_PROMPTS[i].p;
        for (let c = 1; c <= text.length; c++) {
          if (cancelled) return;
          setSt({ idx: i, typed: c, phase: 'typing', completed: i });
          await wait(16);
        }
        await wait(230);
        if (cancelled) return;
        setSt({ idx: i, typed: text.length, phase: 'routing', completed: i });
        await wait(520);
        if (cancelled) return;
        setSt({ idx: i, typed: text.length, phase: 'counted', completed: i + 1 });
        await wait(560);
      }
      if (!cancelled) setSt((s) => ({ ...s, phase: 'finished' }));
    })();
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [runId, started, reduceMotion]);

  const done = DEMO_PROMPTS.slice(0, st.completed);
  const vanillaTotal = done.reduce((a, b) => a + b.van, 0);
  const mooterTotal = done.reduce((a, b) => a + b.cost, 0);
  const finished = st.phase === 'finished';
  const allVan = DEMO_PROMPTS.reduce((a, b) => a + b.van, 0);
  const allMoo = DEMO_PROMPTS.reduce((a, b) => a + b.cost, 0);
  const pctSaved = Math.round((1 - allMoo / allVan) * 100);

  const showCurrent = st.phase !== 'finished';
  const cur = DEMO_PROMPTS[st.idx];
  const curTyped = cur ? cur.p.slice(0, st.typed) : '';
  const ROWS = DEMO_PROMPTS.length;
  const bodyMinH = ROWS * 46 + 16;

  const promptCell = (text, active) => (
    <div style={{
      color: 'var(--term-fg)', fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden',
      textOverflow: 'ellipsis', maxWidth: '100%',
    }}>
      <span style={{ color: 'var(--term-dim)' }}>$ </span>
      <span style={{ color: active ? 'var(--accent)' : 'var(--term-fg)' }}>{text}</span>
      {active && st.phase === 'typing' && (
        <span style={{ display: 'inline-block', width: 7, height: 14, marginLeft: 1, marginBottom: -2, background: 'var(--accent)', animation: 'mblink 1s step-end infinite' }} />
      )}
    </div>
  );

  return (
    <div ref={rootRef} className="m-pad" style={{ background: 'var(--bg)', color: 'var(--text)', position: 'relative' }}>
      <div className="m-pad m-pad-y" style={{ padding: '56px 64px 64px', maxWidth: 1280, margin: '0 auto' }}>
        <DemoEyebrow>§ live · same prompts, two bills</DemoEyebrow>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, marginTop: 8, marginBottom: 8 }}>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 46, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.04, margin: 0, maxWidth: 760 }}>
            Same prompts. Same results.<br />One bill is <span style={{ color: 'var(--accent)' }}>{pctSaved}% smaller</span>.
          </h2>
          <button
            onClick={() => setRunId((r) => r + 1)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text)', cursor: 'pointer',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '9px 16px', whiteSpace: 'nowrap', flexShrink: 0, transition: 'border-color .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          >↻ {finished ? 'replay trace' : 'running…'}</button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.6, maxWidth: 680, marginTop: 4, marginBottom: 32 }}>
          The exact same six prompts, streamed into both at once. The hard one — the schema migration — stays on Opus on <em>both</em> sides. Mooter only routes down when quality holds.
        </p>

        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          {/* ── VANILLA ── */}
          <div style={{ background: 'var(--term-bg)', border: '1px solid var(--term-border)', borderRadius: 10, overflow: 'hidden', fontFamily: 'var(--font-mono)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--term-header)', borderBottom: '1px solid var(--term-border)', fontSize: 11.5 }}>
              <DemoTrafficLights />
              <span style={{ color: 'var(--term-dim)' }}>claude · vanilla</span>
              <span style={{ marginLeft: 'auto', color: 'var(--tier-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--tier-3)' }} />everything → opus
              </span>
            </div>
            <div style={{ padding: '14px 16px', minHeight: bodyMinH, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {done.map((d, i) => (
                <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 4, marginBottom: 4 }}>
                  {promptCell(d.p, false)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 2 }}>
                    <span style={{ color: 'var(--tier-3)' }}>└─ → claude-opus</span>
                    <span style={{ color: 'var(--tier-3)' }}>{fmt(d.van)}</span>
                  </div>
                </div>
              ))}
              {showCurrent && cur && (
                <div style={{ paddingBottom: 4 }}>
                  {promptCell(curTyped, true)}
                  {st.phase === 'routing' && (
                    <div style={{ fontSize: 11.5, marginTop: 2, color: 'var(--tier-3)' }}>└─ → claude-opus <span style={{ color: 'var(--term-dim)' }}>(no routing)</span></div>
                  )}
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--term-border)', padding: '12px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--term-dim)', fontSize: 11.5 }}>running cost</span>
              <span style={{ color: 'var(--tier-3)', fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{fmt(vanillaTotal)}</span>
            </div>
          </div>

          {/* ── MOOTER ── */}
          <div style={{ background: 'var(--term-bg)', border: '1px solid var(--accent-25)', borderRadius: 10, overflow: 'hidden', fontFamily: 'var(--font-mono)', boxShadow: '0 0 0 1px var(--accent-08), 0 20px 60px -30px rgba(232,136,138,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--term-header)', borderBottom: '1px solid var(--term-border)', fontSize: 11.5 }}>
              <DemoTrafficLights />
              <span style={{ color: 'var(--term-dim)' }}>claude <span style={{ color: 'var(--accent)' }}>+ mooter</span></span>
              <span style={{ marginLeft: 'auto', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'mpulse 1.6s ease-in-out infinite' }} />routed
              </span>
            </div>
            <div style={{ padding: '14px 16px', minHeight: bodyMinH, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {done.map((d, i) => (
                <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 4, marginBottom: 4 }}>
                  {promptCell(d.p, false)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginTop: 2 }}>
                    <span style={{ color: 'var(--term-dim)' }}>
                      └─ <span style={{ color: d.tcolor, fontWeight: 600 }}>{d.tier}</span> {d.model}
                    </span>
                    <span style={{ color: d.cost === 0 ? 'var(--green)' : 'var(--term-fg)' }}>{d.cost === 0 ? 'free' : fmt(d.cost)}</span>
                  </div>
                </div>
              ))}
              {showCurrent && cur && (
                <div style={{ paddingBottom: 4 }}>
                  {promptCell(curTyped, true)}
                  {st.phase === 'routing' && (
                    <div style={{ fontSize: 11.5, marginTop: 2, color: 'var(--term-dim)' }}>
                      └─ classify <span style={{ color: 'var(--green)' }}>14ms</span> → <span style={{ color: cur.tcolor, fontWeight: 600 }}>{cur.tier}</span> <span style={{ color: 'var(--term-dim)' }}>{cur.note}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--term-border)', padding: '12px 16px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--term-dim)', fontSize: 11.5 }}>running cost</span>
              <span style={{ color: 'var(--green)', fontSize: 26, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{fmt(mooterTotal)}</span>
            </div>
          </div>
        </div>

        {/* reveal bar */}
        <div style={{
          marginTop: 24, border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 14,
          padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap',
          opacity: finished ? 1 : 0.5, transition: 'opacity .4s',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--accent)' }}>{pctSaved}%</span>
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>cheaper on this trace</span>
          </div>
          <div style={{ width: 1, height: 36, background: 'var(--border)' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--term-dim)' }}>
            <span style={{ color: 'var(--tier-3)' }}>{fmt(allVan)}</span> vanilla → <span style={{ color: 'var(--green)' }}>{fmt(allMoo)}</span> routed
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--muted)', maxWidth: 360, lineHeight: 1.5 }}>
            Illustrative trace. The headline <DemoMonoNum color="var(--text)">{pctSaved}%</DemoMonoNum> is measured across the author's real <DemoMonoNum color="var(--text)">658</DemoMonoNum> routed calls — not this six-prompt demo.
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TwoTerminalDemo });
