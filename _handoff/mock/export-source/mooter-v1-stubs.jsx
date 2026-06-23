/* mooter-v1-stubs.jsx — honest "coming soon" pages.
   Header + short description + Wave callout. References only real waves.
   Exposed: SessionsArtboard, SecurityArtboard, ChangelogArtboard */

const {
  Eyebrow: StEyebrow, Card: StCard, Dotgrid: StDotgrid,
  CrookOutline: StCrook, Btn: StBtn, mhref: stHref,
} = window;

function StubArtboard({ eyebrow, title, body, bullets, comingWith = 'Wave 33.5 · June 2026' }) {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', position: 'relative', overflow: 'hidden', minHeight: '78vh' }}>
      <StDotgrid />
      <div style={{ padding: '96px 64px', maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <StEyebrow>{eyebrow}</StEyebrow>
        </div>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 54, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.02, marginTop: 6, marginBottom: 18 }}>
          {title}
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.6, maxWidth: 640, marginBottom: 32 }}>
          {body}
        </p>

        {bullets && (
          <ul style={{ margin: '0 0 36px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 600 }}>
            {bullets.map((b, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', fontSize: 14.5, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ color: 'var(--text)' }}>{b}</span>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)', animation: 'mpulse 1.8s ease-in-out infinite' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--muted)' }}>
            in progress · coming with <span style={{ color: 'var(--text)' }}>{comingWith}</span>
          </span>
        </div>

        <div style={{ marginTop: 40, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <StBtn kind="ghost" size="md" href={stHref('home')}>← Back home</StBtn>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>track it on GitHub · open source, MIT</span>
        </div>
      </div>
    </div>
  );
}

function SessionsArtboard() {
  return (
    <StubArtboard
      eyebrow="§ sessions · coming soon"
      title="Every session, replayable."
      body="A timeline of every routed Claude Code session — the tier mix, the cost, the savings — with any routing decision replayable so you can see exactly why each prompt went where it went."
      bullets={[
        'Per-session tier breakdown and cost vs the all-Opus baseline.',
        'Replay any decision: the classifier output, the pack, the model.',
        'Filter by project, branch, or Worktree Conductor lock holder.',
      ]}
    />
  );
}

function SecurityArtboard() {
  return (
    <StubArtboard
      eyebrow="§ security · coming soon"
      title="The 4-layer sandbox, in the open."
      body="Every spawned agent runs inside four isolation layers — network, filesystem, secrets, and config. This page will document each layer, our disclosure policy, and the audit log of what an agent touched."
      bullets={[
        'Network · filesystem · secrets · config — what each layer blocks.',
        'Coordinated-disclosure policy and a public security contact.',
        'Per-spawn audit log: every file read, every command run.',
      ]}
    />
  );
}

function ChangelogArtboard() {
  return (
    <StubArtboard
      eyebrow="§ changelog · coming soon"
      title="Every wave, shipped in the open."
      body="The full history lands here — classify.js has been unchanged for 13 waves, with ~570 tests green. Until the page ships, the milestones below are the ones that matter."
      bullets={[
        'Wave 5 — Adapter Forge: local DoRA r=32 training, ToS-safe.',
        'Wave 28 — Workflow Engine: live local workflows (shipped 2026-06-07).',
        'Worktree Conductor — filesystem locks across parallel sessions.',
        window.MOOTER_VTAG + ' — current release.',
      ]}
    />
  );
}

Object.assign(window, { SessionsArtboard, SecurityArtboard, ChangelogArtboard });
