import type { Metadata } from 'next';
import Cartucho from '@/components/Cartucho';
import TerminalCard from '@/components/TerminalCard';
import Btn from '@/components/Btn';
import { TIER_COLORS_WEB } from '@/lib/mooter-event';
import versionInfo from '@/app/version.json';
import CommandCopy from './CommandCopy';

export const metadata: Metadata = {
  title: 'Commands — the /mooter namespace',
  description: 'Every mooter command is a real Claude Code slash command under /mooter — typed in-session, tab-completed, never clashing with the built-ins.',
};

const ACCENT = 'var(--color-accent)';

type Cmd = [cmd: string, args: string, desc: string];
interface Group {
  name: string;
  badge?: string;
  cmds: Cmd[];
}

// Commands attested across the shipped runtime, skills and docs. The forge/adapter
// group is honestly tagged "Wave 5 · in development" (see /under-the-hood) — the
// namespace exists; the subcommands describe planned behaviour, not a shipped CLI.
//
// O `tint` por grupo saiu: era uma cor de TIER (T0/T1/T2) emprestada a coisas que
// não são tiers — decoração a fingir-se de dado — e para o grupo `core` era rosa,
// que a direcção de 2026-08-27 reserva ao `?` do wordmark, às cotas e ao CTA.
// O que separa os grupos passa a ser a hairline e o rótulo mono.
const CMD_GROUPS: Group[] = [
  {
    name: 'core',
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
    badge: 'Wave 5 · in development',
    cmds: [
      ['/mooter forge status', '', 'Adapter training state — idle, training, or active.'],
      ['/mooter forge train', '', 'Roadmap — local adapter training is not implemented yet. Today: forge install + forge benchmark.'],
      ['/mooter forge eval', '', 'Evaluate a trained adapter against the blind judge set.'],
    ],
  },
  {
    name: 'adapter',
    badge: 'Wave 5 · in development',
    cmds: [
      ['/mooter adapter use', '<id>', 'Activate a trained adapter for routing.'],
      ['/mooter adapter off', '', 'Deactivate the current adapter.'],
    ],
  },
  {
    name: 'privacy',
    cmds: [
      ['/mooter share', '', 'Toggle opt-in telemetry. Default OFF. Prompts are hashed, never sent in plaintext.'],
    ],
  },
];

// Os números que vão para a margem são CONTADOS da tabela acima, nunca escritos
// à mão. Um número na margem que se possa dessincronizar do conteúdo da folha é
// a mesma doença que a percentagem de poupança retirada da landing por decisão
// de 2026-08-24: um literal que nenhum script regenerava. Aqui, acrescentar um
// comando muda a cota sozinho.
const TOTAL = CMD_GROUPS.reduce((n, g) => n + g.cmds.length, 0);
const GRUPOS = CMD_GROUPS.length;
const POR_IMPLEMENTAR = CMD_GROUPS.filter((g) => g.badge).reduce((n, g) => n + g.cmds.length, 0);

function CmdRow({ cmd, args, desc }: { cmd: string; args: string; desc: string }) {
  return (
    <div
      className="cmd-row"
      style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--color-border)', alignItems: 'baseline' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <CommandCopy command={cmd} tint="var(--color-text)" />
        {args ? <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)' }}>{args}</span> : null}
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--color-text)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

/**
 * Um grupo do desenho. Era um `<Card>` — fundo próprio e raio 14, ou seja uma
 * CAIXA, que é exactamente o que a direcção de 2026-08-27 tirou da linguagem.
 * O que separa passa a ser a hairline; o rótulo é mono em caixa-alta, e ao lado
 * a contagem do próprio grupo — uma cota, não um enfeite.
 */
function Grupo({ g }: { g: Group }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, alignSelf: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <span className="moo-label" style={{ color: 'var(--moo-faint)' }}>{g.name}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--moo-faint)', fontVariantNumeric: 'tabular-nums' }}>
          {g.cmds.length}
        </span>
        {g.badge ? (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--color-muted)' }}>{g.badge}</span>
        ) : null}
      </div>
      {g.cmds.map((c) => (
        <CmdRow key={c[0]} cmd={c[0]} args={c[1]} desc={c[2]} />
      ))}
    </div>
  );
}

export default function CommandsPage() {
  return (
    <section className="m-pad m-pad-y" style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '72px 40px' }}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      {/* O cartucho identifica a folha antes de qualquer conteúdo — e substitui
          o `<Eyebrow>` rosa que dizia a mesma coisa por baixo. A revisão vem de
          version.json, escrito pelo version-sync a partir da tag. */}
      <Cartucho o_que="OS COMANDOS" desenho="005" revisao={`v${versionInfo.version}`} data="2026-08-27" />

      {/* O ÚNICO momento extremo da folha (regra 10). Um. */}
      <div style={{ position: 'relative', padding: '48px 0 0' }}>
        <h1 className="moo-h1" style={{ margin: '0 0 12px', maxWidth: 880 }}>
          Every command is a real Claude Code slash command.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.65, margin: 0 }}>
          Mooter registers under the <code style={{ fontFamily: 'var(--mono)', color: 'var(--color-text)' }}>/mooter</code> namespace —
          typed right in your Claude Code session, tab-completed, never clashing with the built-ins. No new CLI to learn.
          Click any command below to copy it.
        </p>
      </div>

      {/* Featured example — /mooter why + /mooter override. A margem é
          telegráfica: o que a secção É, o número que a governa, a ressalva. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          example
          <b>2 of {TOTAL}</b>
          why · override
        </div>
        <div className="cmd-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
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
      </div>

      {/* Full reference. Eram cinco `<Card>`; passam a cinco grupos separados por
          hairline — zero caixas. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          reference
          <b>{TOTAL} commands</b>
          {GRUPOS} groups · {POR_IMPLEMENTAR} not implemented yet
        </div>
        <div>
          <div className="cmd-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
            {CMD_GROUPS.map((g) => (
              <Grupo key={g.name} g={g} />
            ))}
          </div>

          <p style={{ marginTop: 26, fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
            Sub-commands shown flat for reference; in-session, <span style={{ color: 'var(--color-text)' }}>/mooter</span> tab-completes the whole tree.
            Forge and adapter commands ship with Wave 5 (in development) — the rest are live today.
          </p>
        </div>
      </div>

      {/* Install */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          install
          <b>/mooter</b>
          one namespace · zero new CLI
        </div>
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn href="/install" size="lg">Install mooter →</Btn>
            <Btn href="/under-the-hood" variant="secondary">How forge works</Btn>
          </div>
          <p style={{ marginTop: 24, fontSize: 12, color: 'var(--color-muted)' }}>
            Community project · not affiliated with Anthropic.
          </p>
        </div>
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
