/* mooter-v1-commands.jsx — the /mooter slash-command reference.
   Commands are transcribed verbatim from the shipped set (no invented ones).
   Exposed: CommandsArtboard */

const {
  Eyebrow: CmdEyebrow, Card: CmdCard, TierChip: CmdTierChip,
  TrafficLights: CmdTrafficLights, Dotgrid: CmdDotgrid, CrookOutline: CmdCrook,
} = window;

const CMD_GROUPS = [
  {
    name: 'core', tint: 'var(--accent)',
    cmds: [
      ['/mooter init',     '',                  'Hook into Claude Code — writes the config, verifies the connection.'],
      ['/mooter why',      '',                  'Explain the routing call for the last prompt: tier, model, and the reason.'],
      ['/mooter status',   '',                  'Print the live statusline — savings, tier, budgets, adapter.'],
      ['/mooter rate',     '',                  'Rate the last answer. Feeds the routing quality signal.'],
      ['/mooter override', '<tier|model>',      'Force the next prompt onto a specific tier or model.'],
      ['/mooter digest',   '',                  'Your savings digest — what routing saved you, by pack and tier.'],
    ],
  },
  {
    name: 'packs', tint: 'var(--tier-2)',
    cmds: [
      ['/mooter pack list',          '',        'List the packs installed on this machine.'],
      ['/mooter pack show',          '<id>',    'Show a pack: skills, MCPs, agents, trust score.'],
      ['/mooter pack search',        '<query>', 'Search the registry by domain or keyword.'],
      ['/mooter pack install',       '<id>',    'Install a pack and map it into routing.'],
      ['/mooter pack publish',       '',        'Publish your own pack to the registry.'],
    ],
  },
  {
    name: 'forge · local adapters', tint: 'var(--tier-1)', badge: 'Wave 5',
    cmds: [
      ['/mooter forge status', '',  'Adapter training state — idle, training, or active.'],
      ['/mooter forge train',  '',  'Train a local DoRA r=32 adapter on your codebase. ToS-safe, overnight.'],
      ['/mooter forge eval',   '',  'Evaluate a trained adapter against the blind judge set.'],
    ],
  },
  {
    name: 'adapter', tint: 'var(--tier-0)',
    cmds: [
      ['/mooter adapter use', '<id>', 'Activate a trained adapter for routing.'],
      ['/mooter adapter off', '',     'Deactivate the current adapter.'],
    ],
  },
  {
    name: 'privacy', tint: 'var(--green)',
    cmds: [
      ['/mooter share', '', 'Toggle opt-in telemetry. Default OFF. Prompts are hashed, never sent in plaintext.'],
    ],
  },
];

function CmdRow({ cmd, args, desc, tint }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--border)', alignItems: 'baseline' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, whiteSpace: 'nowrap' }}>
        <span style={{ color: tint, fontWeight: 600 }}>{cmd}</span>
        {args && <span style={{ color: 'var(--muted)' }}> {args}</span>}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

function CommandsArtboard() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', position: 'relative', overflow: 'hidden' }}>
      <CmdDotgrid />
      <div className="m-pad m-pad-y" style={{ padding: '64px 64px 72px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <CmdEyebrow>§ commands · the /mooter namespace</CmdEyebrow>
        </div>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 46, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.06, marginTop: 6, marginBottom: 14, maxWidth: 880 }}>
          Every command is a real Claude Code slash command.
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: 15.5, maxWidth: 720, lineHeight: 1.65, marginBottom: 40 }}>
          Mooter registers under the <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>/mooter</span> namespace — typed right in your Claude Code session, tab-completed, never clashing with the built-ins. No new CLI to learn.
        </p>

        {/* featured example — /mooter why */}
        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 48 }}>
          <div style={{ background: 'var(--term-bg)', border: '1px solid var(--term-border)', borderRadius: 10, overflow: 'hidden', fontFamily: 'var(--font-mono)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', background: 'var(--term-header)', borderBottom: '1px solid var(--term-border)', fontSize: 11.5 }}>
              <CmdTrafficLights /><span style={{ color: 'var(--term-dim)' }}>claude · in-session</span>
            </div>
            <div style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.85 }}>
              <div><span style={{ color: 'var(--term-dim)' }}>&gt; </span><span style={{ color: 'var(--accent)' }}>/mooter why</span></div>
              <div style={{ color: 'var(--term-dim)', marginTop: 8 }}>last prompt → <span style={{ color: 'var(--tier-2)' }}>T2 sonnet</span></div>
              <div style={{ color: 'var(--term-dim)' }}>  ├─ intent <span style={{ color: 'var(--term-fg)' }}>arch</span> · complexity <span style={{ color: 'var(--tier-2)' }}>med</span></div>
              <div style={{ color: 'var(--term-dim)' }}>  ├─ pack <span style={{ color: 'var(--accent)' }}>diagram-systems</span> <span style={{ opacity: 0.6 }}>(trust 98)</span></div>
              <div style={{ color: 'var(--term-dim)' }}>  └─ over opus → <span style={{ color: 'var(--green)' }}>saved $0.31</span></div>
            </div>
          </div>
          <div style={{ background: 'var(--term-bg)', border: '1px solid var(--term-border)', borderRadius: 10, overflow: 'hidden', fontFamily: 'var(--font-mono)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', background: 'var(--term-header)', borderBottom: '1px solid var(--term-border)', fontSize: 11.5 }}>
              <CmdTrafficLights /><span style={{ color: 'var(--term-dim)' }}>claude · in-session</span>
            </div>
            <div style={{ padding: '14px 16px', fontSize: 13, lineHeight: 1.85 }}>
              <div><span style={{ color: 'var(--term-dim)' }}>&gt; </span><span style={{ color: 'var(--accent)' }}>/mooter override</span> <span style={{ color: 'var(--term-fg)' }}>T3</span></div>
              <div style={{ color: 'var(--term-dim)', marginTop: 8 }}>next prompt pinned → <span style={{ color: 'var(--tier-3)' }}>T3 opus</span></div>
              <div style={{ color: 'var(--term-dim)' }}>  └─ routing paused for <span style={{ color: 'var(--term-fg)' }}>1 turn</span> <span style={{ opacity: 0.6 }}>· you're the boss</span></div>
            </div>
          </div>
        </div>

        {/* full reference */}
        <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {CMD_GROUPS.map((g) => (
            <CmdCard key={g.name} padding={22} style={{ alignSelf: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.tint }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>{g.name}</span>
                {g.badge && <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: g.tint, border: `1px solid ${g.tint}`, borderRadius: 5, padding: '1px 7px' }}>{g.badge}</span>}
              </div>
              {g.cmds.map((c, i) => (
                <CmdRow key={i} cmd={c[0]} args={c[1]} desc={c[2]} tint={g.tint} />
              ))}
            </CmdCard>
          ))}
        </div>

        <div style={{ marginTop: 26, fontSize: 12.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.6 }}>
          <span>Sub-commands shown flat for reference; in-session, <span style={{ color: 'var(--text)' }}>/mooter</span> tab-completes the whole tree.</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CommandsArtboard });
