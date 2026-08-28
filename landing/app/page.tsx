import NavBar from '@/components/NavBar';
import versionInfo from './version.json';
import Footer from '@/components/Footer';
import { CrookOutline } from '@/components/PastorCrook';
import Cartucho from '@/components/Cartucho';
import HeroTerminal from './_components/HeroTerminal';
import TwoTerminalDemo from './_components/TwoTerminalDemo';
import PulseStrip from './_components/PulseStrip';
import CommunityPulse from './_components/CommunityPulse';
import WhyLocalCards from './_components/WhyLocalCards';
import HandoffStory from './_components/HandoffStory';
import AuthErrorBanner from './_components/AuthErrorBanner';
import { JANELA, M, LATENCIA } from './lib/canonical-metrics';

// 2026-08-27 · o terceiro selo dizia "<50ms overhead". Nunca foi medido, e
// misturava duas grandezas: o `classify()` (0,001 ms p50, 5.000 chamadas) e o
// hook inteiro, que é o que o utilizador de facto espera (177,1 ms p50, 200
// corridas por `tools/router/bench-hook.js`). Nenhuma delas é 50. Agora sai de
// `canonical-metrics.ts` → LATENCIA, e diz o que mede.
const trust = ['Hook, not a proxy', 'Runs locally', `classify ${LATENCIA.classifyP50Ms} ms p50`];

// Inline above-the-fold pulse strip.
//
// Já mostrou "saved vs Opus $22.95" e "avg savings 47%". Ambos vinham de três
// literais que nenhum script regenerava — ver canonical-metrics.ts para a
// auditoria inteira. Nenhum ficheiro de telemetria deste projecto regista
// tokens, portanto nunca houve um custo medido de que derivar uma poupança.
//
// O que fica é mais fraco e é verdade: o que o router RECOMENDA (medido) ao lado
// do que de facto CORREU (medido). A distância entre os dois é o trabalho por
// fazer, e escondê-la seria a mesma coisa que publicar os 47%.
const heroStats: [string, string, string][] = [
  ['routed to cheap', M.recomendadoBaratoPct, `${M.recomendadoBarato} classified prompts`],
  ['ran locally', M.execucoesLocal, `of ${M.execucoes} executions`],
  ['cost measured', 'none', 'no tokens are logged — so no $ is claimed'],
  ['packs installed', '3', 'data · diagram · voice'],
];

export default function Page() {
  return (
    <>
      <NavBar />
      <main>
        <section className="m-pad" style={{ position: 'relative', maxWidth: 1280, margin: '0 auto', padding: '0 40px' }}>
          {/* A grelha de 8px, faint. Substitui o Dotgrid: a direcção fixada a
              2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
              grelha, não num campo de pontos. */}
          <div className="moo-mm" aria-hidden="true" />
          <AuthErrorBanner />

          {/* O cartucho identifica a folha antes de qualquer conteúdo. A revisão
              vem de version.json, escrito pelo version-sync a partir da tag. */}
          <Cartucho o_que="HOME" desenho="001" revisao={`v${versionInfo.version}`} data="2026-08-27" />

          <div className="hero-grid" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 56, alignItems: 'center', padding: '72px 0 40px' }}>
            {/* Left */}
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-green)' }} />
                Open source · MIT · v{versionInfo.version} · classify.js unchanged 19 waves
              </span>

              {/* O ÚNICO momento extremo da folha (regra 10). Dois pesos: o
                  wordmark é a palavra pesada, a pergunta é leve — e o `?` é o
                  único sítio do hero onde o rosa entra. */}
              <h1 className="hero-h1" style={{ fontSize: 'clamp(56px, 13vw, 168px)', lineHeight: 0.84, letterSpacing: '-0.06em', margin: '26px 0 0', display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 300 }}>Got</span>
                <span style={{ fontWeight: 700 }}>
                  Moo<span style={{ color: 'var(--color-accent)' }}>?</span>
                </span>
              </h1>

              <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 600, marginTop: 18, color: 'var(--color-text)' }}>
                The router for Claude Code. Local-first. Learns forever.
              </h2>
              <p style={{ fontSize: 15, fontWeight: 500, marginTop: 6, color: 'var(--color-muted)' }}>
                Spawns agents safely by default.
              </p>

              <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.65, marginTop: 18, maxWidth: 540 }}>
                Your GPU, your subscriptions, your local models — you&apos;re already paying for a powerful AI stack.
                But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full
                environment and routes every prompt to the optimal model —{' '}
                <strong style={{ color: 'var(--color-text)' }}>{M.recomendadoBarato} classified prompts went to a local or cheap tier</strong>. {M.ressalva}{' '}
                <a href="/methodology" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  See the benchmark *
                </a>
              </p>

              {/* D6 — condensed persona+$ subline (rubric C5) */}
              <p style={{ color: 'var(--color-text)', fontSize: 15, lineHeight: 1.6, marginTop: 14, maxWidth: 560, fontWeight: 500 }}>
                For a vibe coder on a Max plan: renames, commits &amp; explains run <strong>local (free)</strong>;
                debugging &amp; refactors go <strong>cloud</strong> — so the free/cloud split shifts with the work
                the day brings, not with a fixed ratio.{' '}
                <a href="/methodology" style={{ color: 'var(--color-accent)' }}>Estimate yours →</a>
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
                <a href="/install" style={{ background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, fontSize: 16, padding: '14px 24px', borderRadius: 11 }}>
                  Install in 30s →
                </a>
                <a href="/dashboard" style={{ border: '1px solid var(--color-border-light)', color: 'var(--color-text)', fontWeight: 600, fontSize: 16, padding: '14px 24px', borderRadius: 11 }}>
                  Sign in with GitHub
                </a>
              </div>

              <div style={{ display: 'flex', gap: 18, marginTop: 22, flexWrap: 'wrap' }}>
                {trust.map((t) => (
                  <span key={t} style={{ color: 'var(--color-muted)', fontSize: 13.5, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-green)' }}>✓</span> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — terminal (client island) */}
            <div style={{ minHeight: 360 }}>
              <HeroTerminal />
            </div>
          </div>

          {/* Os números da máquina do autor.
              Era um cartão: fundo próprio, `border-radius: 14`. A regra 1 das
              DIRETRIZES bane exactamente isso — a anotação vai para a MARGEM,
              não para dentro de uma caixa colorida. Passa a secção: hairline em
              cima, margem à esquerda a dizer o que a secção é e qual a ressalva
              que a governa, conteúdo à direita. Zero caixas. */}
          {/* 2026-08-27 · o `m-2col` estava AQUI, na secção. Media a 375px:
              `.moo-secao` ficava `161.667px 161.667px` — a margem e o conteúdo
              lado a lado com 161px cada — e lá dentro a grelha de 4 estatísticas
              pedia 224px. Resultado: 556px de scrollWidth num ecrã de 375.
              O `m-2col` pertence à grelha de dentro, e por uma razão mecânica: o
              `repeat(4, 1fr)` é um estilo INLINE, e só cede a um `!important` —
              que é exactamente o que `.m-2col` traz (globals.css:810). Na secção
              ele só desfazia o colapso para uma coluna que a gramática agora faz. */}
          <div className="moo-secao" style={{ position: 'relative' }}>
            <div className="moo-marg">
              measured
              <b>1 machine</b>
              1 dev (Paulo) — not a herd average
            </div>
            <div className="m-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
              {heroStats.map(([label, num, sub]) => (
                <div key={label}>
                  <div className="moo-label" style={{ color: 'var(--color-muted)' }}>{label}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontVariantNumeric: 'tabular-nums', fontWeight: 600, letterSpacing: '-0.02em', marginTop: 6 }}>{num}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 4 }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* #honest-numbers — o destino que faltava.
              `methodology/page.tsx` liga para `/#honest-numbers` na ressalva
              colada à calculadora — a frase que existe precisamente para dizer
              que os números foram retirados. Grep no repo: zero elementos com
              esse id; em runtime `document.getElementById('honest-numbers')`
              devolvia `null`. Ou seja, o único link que redime os números
              retirados não ia a sítio nenhum, e um link partido debaixo de uma
              ressalva de honestidade custa mais do que não ter ressalva.

              O conteúdo é o do `README.md` § Honest numbers. Nenhum número
              aqui é escrito à mão: todos vêm de `canonical-metrics.ts`, que é
              a única fonte do que esta landing pode afirmar. Não se repete
              aqui a tabela dos cinco números mortos — o registo dela vive no
              README e em `/methodology`; reimprimir as percentagens retiradas
              na home seria voltar a publicá-las em corpo grande. */}
          <section id="honest-numbers" className="moo-secao" style={{ scrollMarginTop: 96 }}>
            <div className="moo-marg">
              honest numbers
              <b>{M.promptsClassificados} prompts</b>
              {JANELA.de} → {JANELA.ate}
            </div>
            <div style={{ maxWidth: 720 }}>
              <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 600, margin: '0 0 14px' }}>
                Honest numbers
              </h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 15.5, lineHeight: 1.7, margin: 0 }}>
                On 2026-08-23 an audit traced every savings figure this project had published. Five were in
                circulation and they contradicted each other; none survived. The cause is structural and worth
                stating plainly: no telemetry file in this project records token counts. Without tokens there is
                no measured cost, and without a measured cost there is no measured saving — in any unit.
              </p>
              <p style={{ color: 'var(--color-text)', fontSize: 15.5, lineHeight: 1.7, marginTop: 16 }}>
                <strong>What is measured.</strong> {M.frase}
              </p>
              <p style={{ color: 'var(--color-muted)', fontSize: 15.5, lineHeight: 1.7, marginTop: 16 }}>
                That gap — what the router recommended against what actually ran — is the honest state of the
                project, and closing it is the current work. {M.ressalva} A percentage published on top of this
                would describe a product that does not exist yet.
              </p>
              <p style={{ marginTop: 18 }}>
                <a href="/methodology" style={{ color: 'var(--color-accent)', fontSize: 14.5 }}>
                  How the estimate is built, and what it is not →
                </a>
              </p>
            </div>
          </section>

          {/* Live two-terminal savings demo (client island) — below the hero (gap #1). */}
          <TwoTerminalDemo />

          {/* How it works — a explicação longa vive abaixo da dobra, fora do hero.
              A margem é telegráfica, nunca prosa: o que a secção É, o número que
              a governa, a ressalva. */}
          <section className="moo-secao">
            <div className="moo-marg">
              how it works
              <b>11 passes</b>
              regex · zero ML
            </div>
            <div style={{ maxWidth: 720 }}>
            <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.65, marginTop: 0 }}>
              Your GPU, your subscriptions, your local models — you&apos;re already paying for a powerful AI stack.
              But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full
              environment and routes every prompt to the optimal model: comparable quality on routine tasks, a
              fraction of the spend.
            </p>
            <p style={{ color: 'var(--color-text)', fontSize: 15, lineHeight: 1.6, marginTop: 14, fontWeight: 500 }}>
              For a vibe coder on a Max plan: renames, commits &amp; explains run <strong>local (free)</strong>;
              debugging &amp; refactors go <strong>cloud</strong> — so the free/cloud split shifts with the work
              the day brings, not with a fixed ratio.{' '}
              <a href="/methodology" style={{ color: 'var(--color-accent)' }}>Estimate yours →</a>
            </p>
            </div>
          </section>

          <PulseStrip />

          <WhyLocalCards />

          <HandoffStory />

          <CommunityPulse />
        </section>
      </main>
      <Footer />
      <style>{`@media (max-width: 1024px){ .hero-grid{ grid-template-columns: 1fr !important; gap: 36px !important; } } @media (max-width: 640px){ section{ padding-left:20px !important; padding-right:20px !important; } } @media (max-width: 480px){ .hero-h1{ font-size: clamp(38px, 12vw, 56px) !important; flex-wrap: wrap !important; } }`}</style>
    </>
  );
}
