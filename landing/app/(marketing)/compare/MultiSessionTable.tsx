import MonoNum from '@/components/MonoNum';
import versionInfo from '../../version.json';
import RevealOnView from './RevealOnView';

// MultiSessionTable — the "multi-session field" comparison (Wave 33.9, carried
// from landing-v12-deploy/mooter-v1-iter1.jsx CompareArtboard). 11 capabilities
// derived from the real pain points of running many Claude Code sessions at once,
// scored against 8 agent/orchestration tools. Scores are COUNTED from the cells
// (not hardcoded) so the table is internally consistent and cannot drift.
//
// 2026-08-28 · roupa nova, conteúdo intacto. Este componente vive DENTRO da
// folha /compare (DES. 004), que já fala papel milimétrico, e era o último sítio
// dela com vocabulário antigo: um `<Card>` (fundo próprio + raio 14) à volta da
// tabela, a coluna do mooter tingida a rosa em três tons (accent-08/-12 nas
// células, accent-25 nas bordas) e, no fim, um painel com fundo accent-06 e raio
// 12 — um raio que nem sequer existe na escala de `moo-tokens.json`
// ({6,10,14,16,999}). O que separa passa a ser a hairline; o que destaca a
// coluna do mooter passa a ser hairline lateral + peso + cor de texto, que é
// exactamente o que a tabela irmã (a dos routers, em `page.tsx`) já faz na mesma
// folha. Nenhum número, rótulo ou célula mudou.

type Kind = 'y' | 'n' | 'p' | 'cve';

const TOOLS: { name: string; sub: string; highlight?: boolean }[] = [
  { name: 'mooter', sub: `v${versionInfo.version}`, highlight: true },
  { name: 'Composio AO', sub: 'agent os' },
  { name: 'Conductor', sub: 'orchestr.' },
  { name: 'Cursor Bg', sub: 'bg agents' },
  { name: 'Agent Teams', sub: 'anthropic' },
  { name: 'Codex', sub: 'openai' },
  { name: 'Antigravity', sub: 'google' },
  { name: 'Termdock', sub: 'multiplexer' },
];

// Cells transcribe ONLY explicitly-stated capabilities; unstated competitor cells
// are marked partial (◐) rather than invented as ✓.
const ROWS: { label: string; note: string; cells: Kind[] }[] = [
  { label: 'Spawn agents', note: 'mooter local by default · others cloud-only', cells: ['y', 'y', 'y', 'y', 'y', 'y', 'y', 'n'] },
  { label: 'Local-first', note: 'runs without the cloud', cells: ['y', 'p', 'p', 'p', 'y', 'p', 'p', 'y'] },
  { label: 'Cross-session $ savings', note: 'tracks spend across every terminal', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: '5-hour quota forecast', note: 'predicts when you hit the wall', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: 'Cross-session routing learning', note: 'gets cheaper the more you use it', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: '4-layer sandbox', note: 'network · fs · secrets · config', cells: ['y', 'p', 'p', 'y', 'y', 'y', 'cve', 'p'] },
  { label: 'Intent-based UX', note: 'say the goal, not the model', cells: ['y', 'n', 'p', 'y', 'n', 'y', 'n', 'n'] },
  { label: 'State-of-art install wizard', note: 'one path, no foot-guns', cells: ['y', 'p', 'p', 'y', 'p', 'y', 'p', 'p'] },
  { label: 'Multiplexer plugins', note: 'Zellij · tmux · WezTerm · Warp', cells: ['y', 'n', 'n', 'n', 'p', 'n', 'n', 'y'] },
  { label: 'Orchestration locks across terminals', note: 'Worktree Conductor — no two agents on one file', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
  { label: 'Workflow visibility statusline chip', note: 'always-on HUD of what is running', cells: ['y', 'n', 'n', 'n', 'n', 'n', 'n', 'n'] },
];

// As quatro cores da legenda SÃO o sinal da matriz — não são decoração, e por
// isso ficam. Só o ✗ mudou de veículo: era o literal `rgba(122,113,104,0.5)`,
// uma cor à mão que ninguém podia manter em sincronia com a legenda lá em baixo;
// passa a `--moo-faint`, o token que já diz "presente mas apagado".
const ICON: Record<Kind, { c: string; g: string }> = {
  y: { c: 'var(--color-green)', g: '✓' },
  n: { c: 'var(--moo-faint)', g: '✗' },
  p: { c: 'var(--color-yellow)', g: '◐' },
  cve: { c: 'var(--color-tier-3)', g: '⚠' },
};

// A hairline que fecha o desenho. `--moo-line-strong` é a linha da gramática
// nova; o fallback mantém a folha legível se o CSS gerado não estiver montado.
const LINHA_FORTE = '1px solid var(--moo-line-strong, var(--color-border-light))';
// A hairline lateral que marca a coluna do mooter — o substituto da faixa rosa.
const LINHA_COLUNA = '1px solid var(--color-border-light)';

export default function MultiSessionTable() {
  // Derive each column's score from its 'y' cells — the table stays consistent.
  const scores = TOOLS.map((_, col) => ROWS.filter((r) => r.cells[col] === 'y').length);
  // Summary chips are derived from the same scores array (col 0 = mooter), so the
  // headline numbers can never drift from the matrix. No hardcoded metrics.
  const mooterScore = scores[0];
  const runnerUpScore = Math.max(...scores.slice(1));

  return (
    <div style={{ marginBottom: 56 }}>
      {/* Era um h2 de clamp(28px,4vw,46px) com metade da frase a rosa — um
          segundo momento extremo a competir com o h1 da folha, e rosa fora das
          três permissões (wordmark, cota, CTA). Passa ao mesmo corpo do h2 irmão
          («And against the routers and proxies»), e a ênfase é peso + cor de
          texto sobre corpo esbatido, que é o padrão do lede desta folha. */}
      <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 10px', color: 'var(--color-muted)' }}>
        Eleven capabilities. <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>Mooter is the only 11/11.</span>
      </h2>
      <p style={{ color: 'var(--color-muted)', fontSize: 15, maxWidth: 760, marginBottom: 28, lineHeight: 1.6 }}>
        The capabilities below are derived from the real pain points of running many Claude Code sessions at once.
        Each tool does <em>something</em> well — none of the others does all eleven.
      </p>

      <RevealOnView>
      {/* Sem `<Card>`: o contentor de scroll É a peça, fechado em cima por uma
          hairline. `overflow-x` fica aqui — o corpo da página nunca rola na
          horizontal. */}
      <div className="m-scroll-x" style={{ overflowX: 'auto', borderTop: LINHA_FORTE }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 880 }}>
            <colgroup>
              <col style={{ width: '30%' }} />
              {TOOLS.map((t, i) => (
                <col key={i} style={{ width: `${70 / TOOLS.length}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '16px 18px', borderBottom: '1px solid var(--color-border)', fontWeight: 500, color: 'var(--moo-faint)', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', verticalAlign: 'bottom' }}>
                  Capability
                </th>
                {TOOLS.map((t) => (
                  <th
                    key={t.name}
                    scope="col"
                    style={{
                      textAlign: 'center', padding: '14px 6px', borderBottom: '1px solid var(--color-border)', verticalAlign: 'bottom',
                      borderLeft: t.highlight ? LINHA_COLUNA : undefined,
                      borderRight: t.highlight ? LINHA_COLUNA : undefined,
                    }}
                  >
                    <div style={{ fontSize: 12.5, fontWeight: t.highlight ? 700 : 500, lineHeight: 1.15, color: t.highlight ? 'var(--color-text)' : 'var(--moo-faint)' }}>{t.name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--moo-faint)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                // A última linha da matriz perde a régua de baixo: a régua que a
                // separa do total é a do total, mais forte. Duas hairlines
                // encostadas leem-se como uma borda de 2px — isso era a caixa.
                <tr key={i} style={{ borderBottom: i === ROWS.length - 1 ? undefined : '1px solid var(--color-border)' }}>
                  <th scope="row" style={{ padding: '13px 18px', verticalAlign: 'top', textAlign: 'left', fontWeight: 600 }}>
                    <div style={{ fontSize: 13.5, letterSpacing: '-0.01em', color: 'var(--color-text)' }}>{row.label}</div>
                    <div style={{ color: 'var(--color-muted)', fontSize: 11.5, marginTop: 2, lineHeight: 1.4, fontWeight: 400 }}>{row.note}</div>
                  </th>
                  {row.cells.map((kind, j) => {
                    const ic = ICON[kind];
                    const isMooter = j === 0;
                    return (
                      <td
                        key={j}
                        style={{
                          textAlign: 'center', padding: '13px 6px', verticalAlign: 'middle',
                          borderLeft: isMooter ? LINHA_COLUNA : undefined,
                          borderRight: isMooter ? LINHA_COLUNA : undefined,
                        }}
                      >
                        <span aria-label={kind === 'y' ? 'yes' : kind === 'n' ? 'no' : kind === 'cve' ? 'shipped with disclosed flaw' : 'partial'} style={{ color: ic.c, fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {ic.g}
                          {kind === 'cve' && <sup style={{ fontSize: 9, marginLeft: 1 }}>†</sup>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* A linha do total. Era uma faixa rosa mais escura (accent-12) com
                  o número do mooter a rosa; passa a régua de soma + corpo maior
                  e mais pesado na coluna do mooter. */}
              <tr style={{ borderTop: LINHA_FORTE }}>
                <th scope="row" style={{ padding: '16px 18px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--moo-faint)', textAlign: 'left', fontWeight: 500 }}>
                  Score
                </th>
                {scores.map((s, j) => {
                  const isMooter = j === 0;
                  return (
                    <td
                      key={j}
                      style={{
                        textAlign: 'center', padding: '14px 6px',
                        borderLeft: isMooter ? LINHA_COLUNA : undefined,
                        borderRight: isMooter ? LINHA_COLUNA : undefined,
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: isMooter ? 19 : 15, color: isMooter ? 'var(--color-text)' : 'var(--color-muted)', letterSpacing: '-0.02em' }}>{s}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--moo-faint)', marginTop: 1 }}>/ 11</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
      </div>
      </RevealOnView>

      <div style={{ marginTop: 20, display: 'flex', gap: 22, fontSize: 12, color: 'var(--color-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span><span style={{ color: 'var(--color-green)', fontWeight: 700 }}>✓</span> full</span>
        <span><span style={{ color: 'var(--color-yellow)', fontWeight: 700 }}>◐</span> partial / unclear</span>
        <span><span style={{ color: 'var(--color-tier-3)', fontWeight: 700 }}>⚠</span> shipped but with a disclosed flaw</span>
        <span><span style={{ color: 'var(--moo-faint)', fontWeight: 700 }}>✗</span> not available</span>
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6, maxWidth: 900 }}>
        <span style={{ color: 'var(--color-tier-3)' }}>†</span> Antigravity&apos;s sandbox shipped with{' '}
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>CVE-2025-59528</span>{' '}
        (prompt-injection escape, disclosed). Marked shipped-but-flawed rather than passing.
      </div>
      <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--color-muted)', fontStyle: 'italic', maxWidth: 900, lineHeight: 1.6 }}>
        Comparison based on public documentation as of June 2026. Methodology: 11 capabilities derived from observed
        pain points of multi-session Claude Code workflows. Scores are counted from the cells above — got a cell wrong?{' '}
        {/* O mesmo link existe duas vezes nesta folha: aqui e na errata. Lá é
            esbatido com sublinhado; aqui era rosa. Passa a falar a mesma língua. */}
        <a href="https://github.com/pauloloureiroshp-ship-it/mooter/issues" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', fontStyle: 'normal', textDecoration: 'underline', textUnderlineOffset: 3 }}>open an issue →</a>
      </div>
      <RevealOnView delay={80}>
      {/* Era uma caixa: fundo accent-06, borda accent-25, raio 12 — e o raio 12
          nem consta da escala dos tokens. Passa ao padrão `Grupo` da folha 008:
          hairline em cima, rótulo mono em caixa-alta, e nada mais. */}
      <div style={{ marginTop: 32, borderTop: '1px solid var(--color-border)', paddingTop: 16, maxWidth: 900 }}>
        <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>honest &gt; inflated</div>
        <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.65, color: 'var(--color-text)' }}>
          Scores are derived honestly from the per-row cells, not curated to make Mooter look better. Mooter wins{' '}
          <strong style={{ color: 'var(--color-text)' }}>5 capabilities no other tool has</strong> — cross-session $
          savings, 5h quota forecast, cross-session routing learning, orchestration locks across terminals, and the
          workflow-visibility statusline chip — and it is the only stack that ships all 11 in one tool.
        </p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            mooter score <MonoNum color="var(--color-text)" style={{ fontWeight: 700 }}>{mooterScore}</MonoNum>
            <span style={{ color: 'var(--color-muted)' }}> / {ROWS.length}</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            next best <MonoNum color="var(--moo-faint)" style={{ fontWeight: 700 }}>{runnerUpScore}</MonoNum>
            <span style={{ color: 'var(--color-muted)' }}> / {ROWS.length}</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            counted live from the cells above, not hardcoded
          </span>
        </div>
      </div>
      </RevealOnView>
    </div>
  );
}
