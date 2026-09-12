import type { Metadata } from 'next';
import { LATENCIA } from '@/app/lib/canonical-metrics';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Cartucho from '@/components/Cartucho';
import MultiSessionTable from './MultiSessionTable';
import versionInfo from '../../version.json';

// DES. 004 — a comparação, na gramática de papel milimétrico fixada a
// 2026-08-27. Era um Dotgrid com um eyebrow rosa e a tabela dentro de um
// contentor com raio 12; a anotação vai agora para a MARGEM, telegráfica, e o
// que separa é a hairline. O rosa deixa de tingir a coluna do mooter — a
// ênfase passa a ser hairline + peso do texto, que é o que um desenho técnico
// faz para destacar uma peça.
//
// As cotas da margem são CONTADAS deste ficheiro (`ROWS.length`, `COLS.length`)
// e a data vem do `docs/compare-snapshot.md` real, com `n/d` quando não se lê.
// Nenhum número foi escrito à mão aqui.

export const metadata: Metadata = {
  title: 'How mooter compares',
  description: 'We are not the only LLM router. We are the one built for Claude Code.',
};

const COLS = ['', 'mooter', 'Claude Code default', 'LiteLLM proxy', 'Continue.dev', 'OpenRouter'];

const ROWS: string[][] = [
  ['Architecture', 'Hook (local)', 'Direct API call', 'HTTP proxy', 'IDE plugin', 'API gateway'],
  ['Local models (Ollama)', '✓ T0 native', '✗', '✓ (configurable)', '✓', '✗'],
  ['Auto-routing by complexity', '✓ T0–T3 axis', '✗ Opus on all', '⚠️ rule-based', '⚠️ manual', '⚠️ tags'],
  ['Domain routing (packs)', '✓ 7+ Moo Packs', '✗', '✗', '✗', '✗'],
  // 2026-08-27 · dizia '✓ 14ms p50'. O 14 aparecia como literal em três ficheiros
  // e nenhum o ligava a uma medição — apesar de o medidor existir no repo
  // (`tools/router/bench-hook.js`). Corrido: p50 177,1 ms de hook completo,
  // 0,001 ms de classify. A linha passa a comparar a mesma grandeza para todos:
  // o custo por prompt, e o que este esconde (um spawn de processo Node).
  [`Pre-prompt overhead (measured)`, `✓ classify ${LATENCIA.classifyP50Ms} ms · hook ${LATENCIA.hookP50Ms} ms p50`, 'n/a', '~80–200ms', '~120ms', '~200ms cloud'],
  ['Code/prompts leave machine', '⚠️ T0 routes local; cloud Haiku if key set', '✓ all to Anthropic', '✓ through proxy', '✓ to cloud', '✓ via gateway'],
  ['Pack-based specialization', '✓ Moo Packs', '✗', '✗', '⚠️ commands', '✗'],
  ['Adapter Forge (local LoRA)', '⚠️ Wave 26 (training)', '✗', '✗', '✗', '✗'],
  ['Subscription-aware', '✓ tier-detect', '✗', '⚠️ via env', '✗', 'n/a'],
  ['Live statusline HUD', '✓ 3-line', '✗', '✗', '⚠️ side panel', '✗'],
  ['Per-bash tool badge', '✓ per-call tier', '✗', '✗', '✗', '✗'],
  ['Sparkline (last-10 tier mix)', '✓ inline', '✗', '✗', '✗', '✗'],
  ['End-of-session digest', '✓ mooter digest', '✗', '✗', '✗', '✗'],
  ['Live local subagent visibility', '✓ 🐄×N live', '✗', '✗', '✗', '✗'],
  ['Cost tracking per-prompt', '✓ real-time', '✗', '✓ in logs', '⚠️ session', '✓ dashboard'],
  ['Open source', '✓ MIT', 'n/a (closed)', '✓ Apache 2', '✓ Apache 2', '✗ (gateway hosted)'],
  ['Free', '✓ forever', 'depends on sub', 'self-host or paid', '✓', '⚠️ markup on API'],
  ['Setup time', '1 command', 'n/a', '30+ min (config)', 'install plugin', 'sign up + key'],
  ['Works without internet', '✓ T0 local', '✗', '✗', '✗', '✗'],
];

function cellColor(v: string): string | undefined {
  if (v.startsWith('✓')) return 'var(--color-green)';
  if (v.startsWith('✗')) return 'var(--color-muted)';
  if (v.startsWith('⚠️')) return 'var(--color-yellow)';
  return undefined;
}

export default async function ComparePage() {
  let lastUpdated = 'unknown';
  try {
    const md = await readFile(join(process.cwd(), 'docs/compare-snapshot.md'), 'utf-8');
    lastUpdated = md.match(/Last updated:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? 'unknown';
  } catch {
    lastUpdated = 'unknown';
  }
  // Não medido é `n/d`, nunca um zero nem uma data inventada.
  const cota = lastUpdated === 'unknown' ? 'n/d' : lastUpdated;

  return (
    <section className="m-pad m-pad-y" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid — papel milimétrico, não
          um campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      {/* O cartucho identifica a folha antes de qualquer conteúdo. */}
      <Cartucho o_que="COMPARISON" desenho="004" revisao={`v${versionInfo.version}`} data="2026-08-27" />

      {/* O ÚNICO momento extremo da folha (regra 10). Um. */}
      <div style={{ position: 'relative', padding: '48px 0 0' }}>
        <h1 className="moo-h1" style={{ margin: '0 0 12px' }}>How mooter compares</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
          We&apos;re not the only LLM router. We are the one built for Claude Code. Every score below is{' '}
          <strong style={{ color: 'var(--color-text)' }}>counted from the cells</strong>, not asserted. On routine tasks
          mooter aims for <em>comparable quality</em> at a fraction of the cost — not identical output. Where a
          competitor&apos;s capability is undocumented we mark it partial, never invent a win.
        </p>
      </div>

      {/* Primary: the multi-session field (agents & orchestrators) — Wave 33.9.
          Sem cota na margem: as 11 capacidades e os 8 concorrentes vivem em
          MultiSessionTable.tsx, e repeti-los aqui criaria uma segunda verdade
          que dessincroniza no dia em que lá se acrescentar uma linha. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          the field
          <b>multi-session</b>
          counted from the cells, not asserted
        </div>
        <div>
          <MultiSessionTable />
        </div>
      </div>

      {/* Secondary: vs other LLM routers / proxies. A cota é contada das
          constantes acima — 19 linhas × 5 concorrentes — e move-se sozinha se
          alguém acrescentar uma linha à tabela. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          vs routers
          <b>{ROWS.length} × {COLS.length - 1}</b>
          public docs · not inferred
        </div>
        <div>
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 18px' }}>
            And against the routers and proxies
          </h2>

          {/* Era um contentor com border + raio 12 à volta da tabela. Fica a
              hairline de topo e o scroll horizontal; a coluna do mooter deixa
              de ser tingida a rosa e passa a distinguir-se por hairline
              lateral e peso do texto. */}
          <div className="m-scroll-x" style={{ overflowX: 'auto', borderTop: '1px solid var(--moo-line-strong, var(--color-border-light))' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 880 }}>
              <thead>
                <tr>
                  {COLS.map((c, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign: i === 0 ? 'left' : 'center',
                        padding: '14px 12px',
                        fontFamily: 'var(--mono)',
                        fontSize: 11,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        fontWeight: i === 1 ? 600 : 500,
                        color: i === 1 ? 'var(--color-text)' : 'var(--moo-faint)',
                        borderBottom: '1px solid var(--color-border-light)',
                        borderLeft: i === 1 ? '1px solid var(--color-border-light)' : undefined,
                        borderRight: i === 1 ? '1px solid var(--color-border-light)' : undefined,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => (
                  <tr key={ri} style={{ borderTop: '1px solid var(--color-border)' }}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        style={{
                          padding: '12px',
                          textAlign: ci === 0 ? 'left' : 'center',
                          color: ci === 0 ? 'var(--color-text)' : cellColor(cell) ?? 'var(--color-muted)',
                          fontWeight: ci === 0 ? 600 : 500,
                          borderLeft: ci === 1 ? '1px solid var(--color-border-light)' : undefined,
                          borderRight: ci === 1 ? '1px solid var(--color-border-light)' : undefined,
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Erratas. A cota é a data real do snapshot — `n/d` quando o ficheiro
          não se lê, nunca uma data de recurso. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          errata
          <b>{cota}</b>
          open to correction
        </div>
        <div style={{ maxWidth: 760 }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 13.5, margin: 0, lineHeight: 1.65 }}>
            Last updated {lastUpdated}. Snapshot of public functionality at the time. We checked the docs. If we got
            something wrong, <a href="https://github.com/pauloloureiroshp-ship-it/mooter/issues" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>open an issue</a> and we&apos;ll fix it.
          </p>
          <p style={{ color: 'var(--color-muted)', fontSize: 12.5, marginTop: 12, lineHeight: 1.65 }}>
            Cursor / Copilot / Cody — and the open-source agents <strong>Cline</strong>, <strong>Aider</strong> and{' '}
            <strong>Roo Code</strong> — are AI coding assistants/agents, not LLM routers. They decide <em>what to do</em>;
            mooter decides <em>which model runs each step</em>. It complements them (run mooter under Claude Code while you
            use any of them elsewhere) rather than replacing them — so this table compares routers, not agents.
          </p>
          <p style={{ color: 'var(--moo-faint)', fontSize: 11.5, marginTop: 16, fontFamily: 'var(--mono)', letterSpacing: '.06em' }}>
            Snapshot reflects mooter v{versionInfo.version}. Capabilities and scores are derived, sourced, and open to correction.
          </p>
        </div>
      </div>
    </section>
  );
}
