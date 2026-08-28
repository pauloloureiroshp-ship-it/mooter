import type { Metadata } from 'next';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';
import { REPO, FALLBACK, toEntries, type Entry } from './_lib';

export const metadata: Metadata = {
  title: 'Changelog | Mooter',
  description: 'What shipped, wave by wave — pulled live from GitHub releases.',
};

// ISR: revalidate hourly so the page self-updates as releases ship (Wave 42.B).
// Wave 60 redesign: presentation only — the live-GitHub data layer is unchanged.
export const revalidate = 3600;

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

/**
 * `ao_vivo` é a única adição ao carregamento, e existe por causa da margem.
 *
 * A folha passa a anunciar de onde vieram as entradas, e essa afirmação tem de
 * ser verdade nas duas pontas: `true` quando a resposta do GitHub chegou e foi
 * aproveitada, `false` quando o que está no ecrã é a lista de reserva de
 * `_lib.ts`. Sem este sinal a margem teria de escolher uma das duas e mentir
 * metade das vezes — que é exactamente o defeito que esta gramática existe para
 * não ter. Os dados em si não mudam: mesma chamada, mesmo filtro, mesmo corte.
 */
async function loadEntries(): Promise<{ entries: Entry[]; ao_vivo: boolean }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate },
    });
    if (!res.ok) return { entries: FALLBACK, ao_vivo: false };
    const entries = toEntries(await res.json());
    return entries.length ? { entries, ao_vivo: true } : { entries: FALLBACK, ao_vivo: false };
  } catch {
    return { entries: FALLBACK, ao_vivo: false };
  }
}

export default async function ChangelogPage() {
  const { entries, ao_vivo } = await loadEntries();
  // Contado aqui, sobre o que é de facto desenhado a seguir — nunca estimado.
  // `linhas` é a soma real dos bullets de todas as entradas na página.
  const linhas = entries.reduce((n, e) => n + e.items.length, 0);

  return (
    <section style={SECTION_BG}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      <div
        className="m-pad m-pad-y"
        style={{ position: 'relative', maxWidth: 1280, margin: '0 auto', padding: '64px 40px 72px' }}
      >
        {/* O cartucho identifica a folha antes de qualquer conteúdo. A revisão
            vem de version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="O CHANGELOG" desenho="017" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* O ÚNICO momento extremo da folha (regra 10). Um.
            Havia dois candidatos: este título e a pílula «current release» com
            o ponto rosa a pulsar. A pílula era uma CAIXA (fundo próprio, raio
            999, borda) e o rosa nela não é nenhum dos três sítios permitidos —
            por isso é ela que cede. O que dela sobrevive vive na secção da
            fonte, sem caixa e sem rosa. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 980 }}>
            Every wave, shipped in the open.
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '16px 0 0' }}>
            The full history, pulled live from{' '}
            <a
              href={`https://github.com/${REPO}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              GitHub releases
            </a>
            .
          </p>
        </div>

        {/* A fonte. A margem diz o estado REAL do carregamento — `ao vivo` só
            quando a resposta do GitHub chegou e foi usada; `reserva` quando o
            que está no ecrã é a lista curada de `_lib.ts`. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            the source
            <b>{ao_vivo ? 'live' : 'fallback'}</b>
            {ao_vivo
              ? 'api.github.com · revalidates every 3600 s'
              : 'GitHub unreachable — curated list from _lib.ts'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Verde só para sinal positivo genuíno: a resposta chegou mesmo.
                  Em reserva não pulsa e não é verde — o estado degradado
                  mostra-se, não se disfarça. `moo-pulso` é opacidade pura e traz
                  a guarda de movimento reduzido no ficheiro gerado. */}
              <span
                className={ao_vivo ? 'moo-pulso' : undefined}
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: ao_vivo ? 'var(--color-green)' : 'var(--color-muted)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-muted)' }}>
                current release · <span style={{ color: 'var(--color-text)' }}>v{versionInfo.version}</span>
              </span>
            </div>
            <p style={{ marginTop: 14, fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--mono)', lineHeight: 1.6, maxWidth: 720 }}>
              {ao_vivo
                ? 'Read from the GitHub API — published v1.x.y tags only, drafts and pre-1.0 excluded. Nothing below is typed by hand.'
                : 'The GitHub API did not answer. What follows is the curated fallback list — shorter than the real history, shown so the page degrades instead of going blank.'}
            </p>
          </div>
        </div>

        {/* O histórico. As duas cotas da margem são contadas do próprio array
            que é desenhado a seguir: `entries.length` e a soma dos bullets. O
            tecto de 20 é o de `toEntries` em `_lib.ts`, não uma estimativa. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            history
            <b>{entries.length} entries</b>
            {linhas} lines · capped at 20 per page
          </div>
          <div>
            {entries.map((e, i) => (
              /* Era um `<Card>`: fundo próprio, raio 14 e uma pilha com 16 de
                 espaço entre caixas. O que separa passa a ser a hairline. */
              <article
                key={e.version}
                style={{ borderTop: '1px solid var(--color-border)', padding: '18px 0 22px' }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  {/* O número da peça no conjunto — posição real na lista, do
                      mais recente para o mais antigo. */}
                  <span
                    aria-hidden="true"
                    style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--moo-faint)', flexShrink: 0 }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', margin: 0 }}>
                    {e.url ? (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-text)', textDecoration: 'none' }}
                      >
                        {e.version}
                      </a>
                    ) : (
                      e.version
                    )}
                  </h2>
                  {e.date && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-muted)' }}>
                      · {e.date}
                    </span>
                  )}
                </div>
                {e.headline && (
                  <p style={{ color: 'var(--color-text)', fontSize: 14, margin: '8px 0 0' }}>
                    <strong>{e.headline}</strong>
                  </p>
                )}
                {e.items.length > 0 && (
                  <ul
                    style={{
                      margin: '10px 0 0',
                      padding: 0,
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {e.items.map((it, j) => (
                      <li
                        key={j}
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'baseline',
                          fontSize: 13.5,
                          lineHeight: 1.55,
                          color: 'var(--color-muted)',
                        }}
                      >
                        {/* Era rosa. O rosa fica para o `?` do wordmark, para as
                            cotas e para o CTA — um contador de bullets não é
                            nenhum dos três. */}
                        <span style={{ color: 'var(--moo-faint)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                          {String(j + 1).padStart(2, '0')}
                        </span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
