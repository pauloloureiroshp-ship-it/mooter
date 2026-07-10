/* mooter-v1-showcase.jsx — Conductor + Workflow showcase sections.
   Same craft standard as UnderHoodArtboard: Dotgrid, 46px headline,
   mono detail density. Exposed: ConductorArtboard, WorkflowArtboard */

const {
  Eyebrow: ShEyebrow, Card: ShCard, MonoNum: ShMonoNum, TierChip: ShTierChip,
  TrafficLights: ShTrafficLights, Dotgrid: ShDotgrid, ProgressBar: ShProgressBar,
  CrookOutline: ShCrook,
} = window;

/* ---- small terminal shell used by both sections ---- */
function MiniTerm({ branch, status, statusColor, active, children }) {
  return (
    <div style={{
      background: 'var(--term-bg)',
      border: `1px solid ${active ? 'var(--accent-25)' : 'var(--term-border)'}`,
      borderRadius: 10, overflow: 'hidden', fontFamily: 'var(--font-mono)',
      opacity: active ? 1 : 0.62,
      boxShadow: active ? '0 0 0 1px var(--accent-08)' : 'none',
      transition: 'opacity .3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', background: 'var(--term-header)', borderBottom: '1px solid var(--term-border)', fontSize: 11.5 }}>
        <ShTrafficLights />
        <span style={{ color: 'var(--term-fg)' }}>~/repo</span>
        <span style={{ color: 'var(--term-dim)' }}>·</span>
        <span style={{ color: active ? 'var(--accent)' : 'var(--term-dim)' }}>{branch}</span>
        <span style={{ marginLeft: 'auto', color: statusColor, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, animation: active ? 'mpulse 1.8s ease-in-out infinite' : 'none' }} />{status}
        </span>
      </div>
      <div style={{ padding: '12px 14px', fontSize: 12.5, lineHeight: 1.7, color: 'var(--term-fg)' }}>{children}</div>
    </div>
  );
}

/* =========================================================
   CONDUCTOR — multi-session git safety
   ========================================================= */
function ConductorArtboard() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', position: 'relative', overflow: 'hidden' }}>
      <ShDotgrid />
      <div className="m-pad m-pad-y" style={{ padding: '64px 64px 72px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <ShEyebrow>§ conductor · multi-session safety</ShEyebrow>
        </div>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 46, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.06, marginTop: 6, marginBottom: 14, maxWidth: 940 }}>
          Multiple Claude sessions? Mooter coordinates them so you don't break git.
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 15.5, maxWidth: 720, lineHeight: 1.65, marginBottom: 40 }}>
          Filesystem locks. Heartbeats every 5 seconds. Stale recovery only with your confirm. No race conditions. No deleted commits.
        </p>

        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 40, alignItems: 'start' }}>
          {/* LEFT — three sessions */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MiniTerm branch="wave33-ultimate" status="holds lock" statusColor="var(--green)" active>
              <div style={{ color: 'var(--term-dim)' }}>$ git commit -m <span style={{ color: 'var(--accent)' }}>"wave33: final pass"</span></div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }} data-lock-line>
                <span style={{ color: 'var(--green)' }}>🔒</span>
                <span style={{ color: 'var(--green)' }}>holds .git/index.lock</span>
                <span style={{ color: 'var(--term-dim)' }}>· heartbeat</span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', animation: 'mheart 2.2s ease-in-out infinite' }} />
                <span style={{ color: 'var(--term-dim)' }}>5s</span>
              </div>
            </MiniTerm>

            <MiniTerm branch="wave34-exp" status="queued #1" statusColor="var(--yellow)">
              <div style={{ color: 'var(--term-dim)' }}>$ git rebase main</div>
              <div style={{ marginTop: 6, color: 'var(--yellow)' }}>○ waiting for lock · position 1 in queue</div>
            </MiniTerm>

            <MiniTerm branch="hotfix/billing" status="queued #2" statusColor="var(--yellow)">
              <div style={{ color: 'var(--term-dim)' }}>$ git commit -m <span style={{ color: 'var(--term-dim)' }}>"hotfix: null guard"</span></div>
              <div style={{ marginTop: 6, color: 'var(--yellow)' }}>○ waiting for lock · position 2 in queue</div>
            </MiniTerm>

            {/* handwritten annotation pointing up at the lock line */}
            <div style={{ position: 'relative', marginTop: 4, height: 78 }}>
              <svg width="240" height="78" viewBox="0 0 240 78" style={{ position: 'absolute', left: 8, top: 0, overflow: 'visible' }} aria-hidden="true">
                <path d="M30 70 C 20 40, 30 18, 70 10" fill="none" stroke="var(--accent-2)" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M70 10 l -12 1 M70 10 l -4 -10" fill="none" stroke="var(--accent-2)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', left: 46, top: 40, fontFamily: "'Caveat', cursive", fontSize: 21, color: 'var(--accent-2)', lineHeight: 1.1, maxWidth: 320, transform: 'rotate(-2deg)' }}>
                this is what stops 2 sessions<br />from pushing simultaneously
              </div>
            </div>
          </div>

          {/* RIGHT — conductor state */}
          <ShCard padding={22} style={{ background: 'var(--bg-2)' }}>
            <ShEyebrow>worktree conductor · lock state</ShEyebrow>
            <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--term-dim)' }}>.git/index.lock</span>
                <span style={{ color: 'var(--green)' }}>● held</span>
              </div>
              <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>holder</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--accent)' }}>wave33-ultimate</span>
                  <span style={{ color: 'var(--term-dim)' }}>· pid 48213</span>
                </div>
              </div>
              <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>queue</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[['1', 'wave34-exp'], ['2', 'hotfix/billing']].map(([n, b]) => (
                    <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--yellow)' }}>
                      <span style={{ color: 'var(--term-dim)' }}>{n}.</span>{b}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ paddingTop: 12 }}>
                <div style={{ color: 'var(--term-dim)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>heartbeat</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', animation: `mheart 2.2s ease-in-out ${i * 0.12}s infinite` }} />
                  ))}
                  <span style={{ color: 'var(--term-dim)', marginLeft: 8 }}>every 5s · alive</span>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              Stale lock detected? Conductor never force-breaks it. Recovery happens <span style={{ color: 'var(--text)' }}>only with your confirm</span>.
            </div>
          </ShCard>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   WORKFLOW — live visibility, local & free
   ========================================================= */
function WorkflowChip({ cloud = false }) {
  const TOTAL = 7;
  const [active, setActive] = React.useState(3);
  const [tk, setTk] = React.useState(4.2);
  React.useEffect(() => {
    const id = setInterval(() => {
      setActive((a) => (a >= TOTAL ? 3 : a + 1));
      setTk((t) => +(t + 0.3 > 9.9 ? 4.2 : t + 0.3).toFixed(1));
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--term-fg)',
      background: '#0a0c10', border: '1px solid var(--term-border)', borderRadius: 8, padding: '12px 16px',
    }}>
      <span style={{ display: 'inline-block', animation: 'mspin 1.1s linear infinite', color: cloud ? 'var(--tier-2)' : 'var(--accent)' }}>⟳</span>
      <span style={{ color: 'var(--term-dim)' }}>wf-abc</span>
      <span><span style={{ color: cloud ? 'var(--tier-2)' : 'var(--accent)' }}>{active}</span>/{TOTAL} agents</span>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span key={i} style={{ color: i < active ? (cloud ? 'var(--tier-2)' : 'var(--green)') : 'var(--term-border)' }}>{i < active ? '●' : '○'}</span>
        ))}
      </span>
      <span style={{ color: 'var(--term-dim)' }}>·</span>
      <span style={{ color: 'var(--term-dim)' }}>{tk}k tk</span>
    </div>
  );
}

function WorkflowArtboard() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', position: 'relative', overflow: 'hidden' }}>
      <ShDotgrid />
      <div className="m-pad m-pad-y" style={{ padding: '64px 64px 72px', maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <ShEyebrow>§ workflow · live visibility</ShEyebrow>
        </div>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 46, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.06, marginTop: 6, marginBottom: 14, maxWidth: 900 }}>
          Watch your workflow live. Same idea as Claude Code's dynamic workflows. <span style={{ color: 'var(--accent)' }}>Local. Free.</span>
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 15.5, maxWidth: 720, lineHeight: 1.65, marginBottom: 36 }}>
          A persistent chip in your statusline shows every agent in the run, the progress, and the token spend — updating live as the workflow advances.
        </p>

        {/* the live chip, hero of the section */}
        <div style={{ marginBottom: 36, maxWidth: 560 }}>
          <WorkflowChip />
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>↑ live · dots advance every 500ms as agents complete</div>
        </div>

        {/* same shape, two bills */}
        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'stretch' }}>
          <ShCard padding={22} style={{ display: 'flex', flexDirection: 'column' }}>
            <ShEyebrow>Claude Code · dynamic workflows</ShEyebrow>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 6, marginBottom: 16 }}>cloud-run · billed per token</div>
            <WorkflowChip cloud />
            <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--term-dim)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>est. run cost</span>
              <span style={{ color: 'var(--tier-3)', fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>$0.45</span>
            </div>
          </ShCard>

          <ShCard padding={22} style={{ display: 'flex', flexDirection: 'column', borderColor: 'var(--accent-25)', background: 'linear-gradient(150deg, var(--accent-06), transparent 55%)' }}>
            <ShEyebrow>Mooter Workflow Engine · Wave 28</ShEyebrow>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 6, marginBottom: 16 }}>local-run · shipped 2026-06-07</div>
            <WorkflowChip />
            <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--term-dim)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>measured run cost</span>
              <span style={{ color: 'var(--green)', fontSize: 26, fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>$0.0028</span>
            </div>
          </ShCard>
        </div>

        <div style={{ marginTop: 18, fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.6 }}>
          <span>Same shape, different bill. Demo run measured <ShMonoNum color="var(--green)">$0.0028</ShMonoNum> locally vs an estimated <ShMonoNum color="var(--tier-3)">$0.45</ShMonoNum> in the cloud — a <ShMonoNum color="var(--text)">160×</ShMonoNum> gap on this run.</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ConductorArtboard, WorkflowArtboard });
