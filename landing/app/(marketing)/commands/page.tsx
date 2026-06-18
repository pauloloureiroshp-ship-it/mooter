import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import TerminalCard from '@/components/TerminalCard';
import Btn from '@/components/Btn';
import Dotgrid from '@/components/Dotgrid';
import { TIER_COLORS_WEB } from '@/lib/mooter-event';
import CommandCopy from './CommandCopy';

export const metadata: Metadata = {
  title: 'Commands — the /mooter namespace',
  description: 'Every mooter command is a real Claude Code slash command under /mooter — typed in-session, tab-completed, never clashing with the built-ins.',
};

const ACCENT = 'var(--color-accent)';

type Cmd = [cmd: string, args: string, desc: string];
interface Group {
  name: string;
  tint: string;
  badge?: string;
  cmds: Cmd[];
}

// Commands attested across the shipped runtime, skills and docs. The forge/adapter
// group is honestly tagged "Wave 5 · in development" (see /under-the-hood) — the
// namespace exists; the subcommands describe planned behaviour, not a shipped CLI.
const CMD_GROUPS: Group[] = [
  {
    name: 'core',
    tint: ACCENT,
    cmds: [
      ['/mooter init', '', 'Hook into Claude Code — writes the config and verifies the connection.'],
      ['/mooter why', '', 'Explain the routing call for the last prompt: tier, model, and the reason.'],
      ['/mooter status', '', 'Print the live statusline — savings, tier, budgets, adapter.'],
      ['/mooter rate', '', 'Rate the last answer. Feeds the routing quality signal.'],
      ['/mooter override', '<tier|model>', 'Force the next prompt onto a specific tier or model.'],
      ['/mooter digest', '', 'Your savings digest — what routing saved you, by pack and tier.'],
    ],
  },
  {
    name: 'packs',
    tint: TIER_COLORS_WEB.T2,
    cmds: [
      ['/mooter pack list', '', 'List the packs installed on this machine.'],
      ['/mooter pack show', '<id>', 'Show a pack: skills, MCPs, agents, trust score.'],
      ['/mooter pack search', '<query>', 'Search the registry by domain or keyword.'],
      ['/mooter pack install', '<id>', 'Install a pack and map it into routing.'],
      ['/mooter pack publish', '', 'Publish your own pack to the registry.'],
    ],
  },
  {
    name: 'forge · local adapters',
    tint: TIER_COLORS_WEB.T1,
    badge: 'Wave 5 · in development',
    cmds: [
      ['/mooter forge status', '', 'Adapter training state — idle, training, or active.'],
      ['/mooter forge train', '', 'Train a local DoRA r=32 adapter on your codebase. ToS-safe, overnight.'],
      ['/mooter forge eval', '', 'Evaluate a trained adapter against the blind judge set.'],
    ],
  },
  {
    name: 'adapter',
    tint: TIER_COLORS_WEB.T0,
    badge: 'Wave 5 · in development',
    cmds: [
      ['/mooter adapter use', '<id>', 'Activate a trained adapter for routing.'],
      ['/mooter adapter off', '', 'Deactivate the current adapter.'],
    ],
  },
  {
    name: 'privacy',
    tint: 'var(--color-green)',
    cmds: [
      ['/mooter share', '', 'Toggle opt-in telemetry. Default OFF. Prompts are hashed, never sent in plaintext.'],
    ],
  },
];

function CmdRow({ cmd, args, desc, tint }: { cmd: string; args: string; desc: string; tint: string }) {
  return (
    <div
      className="cmd-row"
      style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--color-border)', alignItems: 'baseline' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <CommandCopy command={cmd} tint={tint} />
        {args ? <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)' }}>{args}</span> : null}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--color-text)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

export default function CommandsPage() {
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <Dotgrid />
      <div style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '72px 40px' }}>
        <Eyebrow>Commands · the /mooter namespace</Eyebrow>
        <h1 style={{ fontSize: 'clamp(34px, 5.5vw, 52px)', fontWeight: 700, margin: '0 0 14px', letterSpacing: '-0.03em', lineHeight: 1.06, maxWidth: 880 }}>
          Every command is a real Claude Code slash command.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.65, marginBottom: 40 }}>
          Mooter registers under the <code style={{ fontFamily: 'var(--mono)', color: 'var(--color-text)' }}>/mooter</code> namespace —
          typed right in your Claude Code session, tab-completed, never clashing with the built-ins. No new CLI to learn.
          Click any command below to copy it.
        </p>

        {/* featured example — /mooter why + /mooter override */}
        <div className="cmd-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 48 }}>
          <TerminalCard title="claude · in-session">
            <div style={{ fontSize: 13, lineHeight: 1.85 }}>
              <div><span style={{ color: 'var(--color-term-dim)' }}>&gt; </span><span style={{ color: ACCENT }}>/mooter why</span></div>
              <div style={{ color: 'var(--color-term-dim)', marginTop: 8 }}>last prompt → <span style={{ color: TIER_COLORS_WEB.T2 }}>T2 sonnet</span></div>
              <div style={{ color: 'var(--color-term-dim)' }}>  ├─ intent <span style={{ color: 'var(--color-term-fg)' }}>arch</span> · complexity <span style={{ color: TIER_COLORS_WEB.T2 }}>med</span></div>
              <div style={{ color: 'var(--color-term-dim)' }}>  ├─ pack <span style={{ color: ACCENT }}>diagram-systems</span> <span style={{ opacity: 0.6 }}>(trust 98)</span></div>
              <div style={{ color: 'var(--color-term-dim)' }}>  └─ over opus → <span style={{ color: 'var(--color-green)' }}>saved this call</span></div>
            </div>
          </TerminalCard>
          <TerminalCard title="claude · in-session">
            <div style={{ fontSize: 13, lineHeight: 1.85 }}>
              <div><span style={{ color: 'var(--color-term-dim)' }}>&gt; </span><span style={{ color: ACCENT }}>/mooter override</span> <span style={{ color: 'var(--color-term-fg)' }}>T3</span></div>
              <div style={{ color: 'var(--color-term-dim)', marginTop: 8 }}>next prompt pinned → <span style={{ color: TIER_COLORS_WEB.T3 }}>T3 opus</span></div>
              <div style={{ color: 'var(--color-term-dim)' }}>  └─ routing paused for <span style={{ color: 'var(--color-term-fg)' }}>1 turn</span> <span style={{ opacity: 0.6 }}>· you&apos;re the boss</span></div>
            </div>
          </TerminalCard>
        </div>

        {/* full reference */}
        <div className="cmd-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {CMD_GROUPS.map((g) => (
            <Card key={g.name} padding={22} style={{ alignSelf: 'start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: g.tint, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)' }}>{g.name}</span>
                {g.badge ? (
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: g.tint, border: `1px solid ${g.tint}`, borderRadius: 5, padding: '1px 7px', whiteSpace: 'nowrap' }}>{g.badge}</span>
                ) : null}
              </div>
              {g.cmds.map((c) => (
                <CmdRow key={c[0]} cmd={c[0]} args={c[1]} desc={c[2]} tint={g.tint} />
              ))}
            </Card>
          ))}
        </div>

        <p style={{ marginTop: 26, fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
          Sub-commands shown flat for reference; in-session, <span style={{ color: 'var(--color-text)' }}>/mooter</span> tab-completes the whole tree.
          Forge and adapter commands ship with Wave 5 (in development) — the rest are live today.
        </p>

        <div style={{ marginTop: 28, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Btn href="/install" size="lg">Install mooter →</Btn>
          <Btn href="/under-the-hood" variant="secondary">How forge works</Btn>
        </div>

        <p style={{ marginTop: 36, fontSize: 12, color: 'var(--color-muted)' }}>
          Community project · not affiliated with Anthropic.
        </p>
      </div>
      <style>{`
        @media (max-width: 768px){
          .cmd-2col{ grid-template-columns: 1fr !important; }
          .cmd-row{ grid-template-columns: 1fr !important; gap: 4px !important; }
        }
      `}</style>
    </section>
  );
}
