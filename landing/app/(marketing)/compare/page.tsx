import type { Metadata } from 'next';
import Link from 'next/link';
import { LATENCIA } from '@/app/lib/canonical-metrics';
import { FACTS_READ } from '@/app/lib/site-pages';
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
// As cotas da margem são CONTADAS deste ficheiro (`ROWS.length`, `COLS.length`).
// Nenhum número foi escrito à mão aqui.
//
// 2026-10-14 · UMA data só. A folha tinha três a competir: a do cartucho
// (2026-08-27), o «as of June 2026» da tabela multi-sessão, e o `Last updated
// {unknown}` desta errata — que lia `docs/compare-snapshot.md`, ficheiro que não
// existe na raiz do landing, por isso em produção dizia «unknown». A data passa a
// ser `FACTS_READ` (lib/site-pages.ts), e a frase diz o que foi relido nesse dia
// e o que NÃO foi.

export const metadata: Metadata = {
  title: 'How mooter compares',
  description: 'We are not the only LLM router. We are the one built for Claude Code.',
};

const COLS = ['', 'mooter', 'Claude Code default', 'Claude Code Router', 'LiteLLM proxy', 'Continue.dev', 'OpenRouter'];

const CCR_README = 'https://github.com/musistudio/claude-code-router';
const OPENROUTER_FAQ = 'https://openrouter.ai/docs/faq';
const OPENROUTER_AUTO = 'https://openrouter.ai/docs/guides/routing/routers/auto-router';
const LITELLM_DOCS = 'https://docs.litellm.ai/docs/simple_proxy';

// 2026-10-14 · a coluna do Claude Code Router. Só entra o que o README diz
// (lido a FACTS_READ, link abaixo da tabela); o resto é `n/d` — «não dito na
// fonte», nunca um ✗ por palpite. As chaves são os rótulos das linhas: se um
// rótulo mudar, o guarda mais abaixo falha o build em vez de a célula ficar
// em silêncio no sítio errado.
const CCR_CELLS: Record<string, string> = {
  'Architecture': 'Local gateway (requests go through it)',
  'Cost tracking per-prompt': '⚠️ estimated cost (README)',
  'Local models (Ollama)': 'n/d (README does not mention Ollama)',
  'Auto-routing by complexity': '⚠️ rule-based (headers, bodies)',
  'Code/prompts leave machine': '✓ to the chosen provider',
  'Open source': '✓ MIT',
  'Free': '✓ (MIT license)',
  'Setup time': 'npm install -g, then ccr ui',
};

const BASE_ROWS: string[][] = [
  ['Architecture', 'Hook (local)', 'Direct API call', 'HTTP proxy', 'IDE plugin', 'API gateway'],
  ['Local models (Ollama)', '✓ T0 native', '✗', '✓ (configurable)', '✓', '✗'],
  ['Auto-routing by complexity', '✓ T0–T3 axis', '✗ Opus on all', '⚠️ rule-based', '⚠️ manual', '⚠️ Auto Router: by task type and cost tier'],
  ['Domain routing (packs)', '✓ 7+ Moo Packs', '✗', '✗', '✗', '✗'],
  // 2026-08-27 · dizia '✓ 14ms p50'. O 14 aparecia como literal em três ficheiros
  // e nenhum o ligava a uma medição — apesar de o medidor existir no repo
  // (`tools/router/bench-hook.js`). Corrido: p50 177,1 ms de hook completo,
  // 0,001 ms de classify. A linha passa a comparar a mesma grandeza para todos:
  // o custo por prompt, e o que este esconde (um spawn de processo Node).
  //
  // 2026-09-29 · as três células dos concorrentes diziam '~80–200ms', '~120ms' e
  // '~200ms cloud' sem fonte nenhuma, numa linha que se chama «(measured)». Não
  // medimos nenhuma delas: passam a `n/d`.
  [`Pre-prompt overhead (measured)`, `✓ classify ${LATENCIA.classifyP50Ms} ms · hook ${LATENCIA.hookP50Ms} ms p50`, 'n/a', 'n/d', 'n/d', 'n/d'],
  ['Code/prompts leave machine', '⚠️ T0 routes local; cloud Haiku if key set', '✓ all to Anthropic', '✓ through proxy', '✓ to cloud', '✓ via gateway'],
  ['Pack-based specialization', '✓ Moo Packs', '✗', '✗', '⚠️ commands', '✗'],
  ['Adapter Forge (local LoRA)', '⚠️ Wave 26 (training)', '✗', '✗', '✗', '✗'],
  ['Subscription-aware', '✓ tier-detect', '✗', '⚠️ via env', '✗', 'n/a'],
  ['Live statusline HUD', '✓ 3-line', '✗', '✗', '⚠️ side panel', '✗'],
  ['Per-bash tool badge', '✓ per-call tier', '✗', '✗', '✗', '✗'],
  ['Sparkline (last-10 tier mix)', '✓ inline', '✗', '✗', '✗', '✗'],
  ['End-of-session digest', '✓ mooter digest', '✗', '✗', '✗', '✗'],
  ['Live local subagent visibility', '✓ 🐄×N live', '✗', '✗', '✗', '✗'],
  // 2026-09-29 · dizia '✓ real-time'. O mooter não regista tokens, logo não há
  // custo por prompt medido; a célula passa a dizer o mesmo que a linha dos $
  // da MultiSessionTable (#521).
  ['Cost tracking per-prompt', 'Not measured (no token logging)', '✗', '✓ in logs', '⚠️ session', '✓ dashboard'],
  ['Open source', '✓ MIT', 'n/a (closed)', '✓ MIT (docs footer)', '✓ Apache 2', '✗ (gateway hosted)'],
  // 2026-09-29 · '✓ forever' era uma promessa sem fonte; o que é verificável é a
  // licença. '⚠️ markup on API' do OpenRouter contradizia a FAQ deles («without
  // any markup on inference pricing»); a taxa existe, mas na compra de créditos.
  ['Free', '✓ (MIT license)', 'depends on sub', 'self-host or paid', '✓', '⚠️ fee on credit purchases, no inference markup (openrouter.ai/docs/faq)'],
  ['Setup time', '1 command', 'n/a', '≈5 min quickstart (per its docs)', 'install plugin', 'sign up + key'],
  ['Works without internet', '✓ T0 local', '✗', '✗', '✗', '✗'],
];

for (const k of Object.keys(CCR_CELLS)) {
  if (!BASE_ROWS.some((r) => r[0] === k)) throw new Error(`compare: CCR_CELLS has no row "${k}"`);
}

// A coluna nova entra a seguir à do Claude Code (índice 3); os `n/d` são o que não está na fonte.
const ROWS: string[][] = BASE_ROWS.map(([label, ...cells]) => [
  label,
  cells[0],
  cells[1],
  CCR_CELLS[label] ?? 'n/d',
  ...cells.slice(2),
]);

function cellColor(v: string): string | undefined {
  if (v.startsWith('✓')) return 'var(--color-green)';
  if (v.startsWith('✗')) return 'var(--color-muted)';
  if (v.startsWith('⚠️')) return 'var(--color-yellow)';
  return undefined;
}

export default function ComparePage() {
  return (
    <section className="m-pad m-pad-y" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid — papel milimétrico, não
          um campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      {/* O cartucho identifica a folha antes de qualquer conteúdo. */}
      <Cartucho o_que="COMPARISON" desenho="004" revisao={`v${versionInfo.version}`} data={FACTS_READ} />

      {/* O ÚNICO momento extremo da folha (regra 10). Um. */}
      <div style={{ position: 'relative', padding: '48px 0 0' }}>
        <h1 className="moo-h1" style={{ margin: '0 0 12px' }}>How mooter compares</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
          We&apos;re not the only LLM router. We are the one built for Claude Code. Every score below is{' '}
          <strong style={{ color: 'var(--color-text)' }}>counted from the cells</strong>, not asserted. mooter classifies
          each prompt — locally, or with Haiku when an API key is set and the local rules are unsure — and routes
          it to a tier from local Ollama (T0) up to Opus (T3). Where a
          competitor&apos;s capability is undocumented we mark it partial or n/d, never invent a win.
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
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 1020 }}>
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

      {/* Erratas. A cota é a data de leitura das fontes — a única da folha. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          errata
          <b>{FACTS_READ}</b>
          open to correction
        </div>
        <div style={{ maxWidth: 760 }}>
          <p style={{ color: 'var(--color-muted)', fontSize: 13.5, margin: 0, lineHeight: 1.65 }}>
            Competitor facts as of {FACTS_READ}: the Claude Code Router column, the LiteLLM license and setup-time cells, and the
            OpenRouter cells on fees and auto-routing, were read against their public docs that day (<a href={CCR_README} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Claude Code Router README</a>,{' '}
            <a href={LITELLM_DOCS} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>LiteLLM docs</a>,{' '}
            <a href={OPENROUTER_FAQ} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>OpenRouter FAQ</a>,{' '}
            <a href={OPENROUTER_AUTO} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>OpenRouter Auto Router</a>);
            the other cells, and the multi-session table (last read June 2026), were not re-read in this update. n/d means not stated in the
            source we read. If we got something wrong, <a href="https://github.com/pauloloureiroshp-ship-it/mooter/issues" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>open an issue</a> and we&apos;ll fix it.
          </p>
          <p style={{ color: 'var(--color-muted)', fontSize: 13.5, marginTop: 12, lineHeight: 1.65 }}>
            Head-to-head pages, with sources and when <em>not</em> to use mooter:{' '}
            <Link href="/vs/claude-code-router" style={{ color: 'var(--color-text)', textDecoration: 'underline', textUnderlineOffset: 3 }}>mooter vs Claude Code Router</Link>
            {' · '}
            <Link href="/vs/litellm" style={{ color: 'var(--color-text)', textDecoration: 'underline', textUnderlineOffset: 3 }}>mooter vs LiteLLM</Link>.
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
