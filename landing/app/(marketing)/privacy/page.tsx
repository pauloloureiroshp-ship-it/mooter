import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';

export const metadata: Metadata = {
  title: 'Privacy — your code stays yours',
  description: 'Mooter is a hook in your terminal, not a proxy. T0 stays local, the routing log keeps a hash of each prompt, telemetry is opt-in.',
};

/* 2026-08-28 · a folha 014 entra na gramática Papel Milimétrico.
 *
 * O que saiu, e porquê:
 *
 *  · Os cinco `<Card>` — as seis garantias, a caixa de conformidade (essa com
 *    `accent`, isto é, um gradiente rosa), o par «vs cloud routers», a ressalva
 *    de routing/execução e o bloco do data-policy. A direcção fixada a
 *    2026-08-27 não tem caixas: o que separa é a hairline, e o rótulo é mono em
 *    caixa-alta.
 *  · Os seis pictogramas. Eram SVG traçados a `var(--color-accent)` dentro de um
 *    azulejo `--color-accent-08` com bordo `--color-accent-25`. Duas violações
 *    numa só peça: rosa fora dos três sítios que a direcção lhe reserva (o `?`
 *    do wordmark, as linhas de cota, o CTA) e um fundo próprio a fazer de caixa.
 *    Eram decorativos (`aria-hidden`), e no lugar deles fica o que um desenho
 *    técnico usa para o mesmo fim: o índice mono `01`…`06`.
 *  · O `<Eyebrow>` e o `<Dotgrid>`. O primeiro é agora `.moo-marg`; o segundo é
 *    a grelha de 8px (`.moo-mm`) — um desenho técnico assenta numa grelha, não
 *    num campo de pontos.
 *  · Os vistos verdes da conformidade. Ornamento; a hairline já separa.
 *
 * O CONTEÚDO não mudou: as seis garantias, as cinco linhas de conformidade, a
 * comparação com os routers-na-nuvem, a ressalva de routing/execução e o link
 * para o `data-policy.md` estão à letra como estavam. Em particular ficam
 * intactas as duas decisões de 2026-08-27 registadas mais abaixo (a privacidade
 * diferencial que saiu por não existir, o k-anonymity que ficou por existir).
 */

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

/**
 * Um grupo do desenho — o mesmo da folha 008. Hairline em cima, rótulo mono em
 * caixa-alta, conteúdo por baixo. Substitui o `<Card>`: sem fundo, sem raio,
 * sem gradiente.
 */
function Grupo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
      <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>{rotulo}</div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</div>
    </div>
  );
}

const cards: { title: string; body: string }[] = [
  { title: 'T0 runs on Ollama, locally', body: 'When mooter executes on your local Ollama, that call never touches a network. Two caveats: with an API key set, some T0-classified tasks run on cloud Haiku for quality, and an unsure classification can be checked by Haiku first — see “Routing vs execution” below.' },
  { title: 'Routing log is hashed', body: 'The routing log keeps a SHA-256 hash of each prompt, not its text. The other records mooter keeps on your machine are listed under “Local records” below.' },
  { title: 'Opt-in telemetry', body: 'Defaults OFF. When you turn it on, only aggregated stats leave.' },
  { title: 'Opt out anytime', body: 'Turn telemetry fully off with `mooter quiet --telemetry-off`. Telemetry never carries prompt text — only hashes and counts.' },
  { title: 'The herd stays on your machine', body: 'The 🐄×N counter and the “Moos that worked” digest keep only agent names, tiers, models and timings — never prompt text — in a per-session file in your system temp folder, and none of it is sent anywhere. Tune it with `mooter quiet --verbose|--herd-quiet|--herd-off`.' },
  { title: 'Open source · audit it', body: 'Every line of mooter is on GitHub under MIT. Read the code yourself.' },
];

// D4 — how mooter differs from cloud routers/proxies on privacy.
const vsCloud: { head: string; items: string[] }[] = [
  { head: 'mooter (hook, local-first)', items: ['T0 on your local Ollama runs on your machine', 'T1–T3 go direct to your own provider key', 'Your prompt never goes to a mooter server'] },
  { head: 'Cloud routers / proxies (e.g. LiteLLM-as-a-service, OpenRouter)', items: ['Every prompt transits a third-party server', 'That hop can log, cache or train on your text', 'You trust an extra party with your code'] },
];

// 2026-09-23 · what the installed code writes locally (see the section that renders it).
const localRecords: { head: string; body: string }[] = [
  { head: 'Routing log', body: '~/.claude/tools/router/decisions.log: a SHA-256 hash of each prompt, its length, fixed-vocabulary flags and the routing decision — no prompt text. Installs from before 2026-09-23 13:03 UTC keep writing the first 80 characters of each prompt here until they are updated; update, then delete the file (or run tools/router/migrate-prompt-preview.js) to drop those lines.' },
  { head: 'Turn journal (on by default)', body: '~/.claude/tools/router/handoff/: up to 1,200 characters of each prompt and 400 of the reply, plus the paths of files written, with API keys and tokens removed. It lets a new session resume where the last one stopped.' },
  { head: 'Context Bridge (opt-in, off by default)', body: 'with MOOTER_CONTEXT_BRIDGE=1 (or context_bridge: true in ~/.mooter/preferences.json), up to 4,000 characters per turn of the conversation, secrets removed, are kept for 7 days in ~/.claude/tools/router/.session-context/ and given to your local Ollama model as context.' },
  { head: 'Contributors only', body: 'when you work inside the mooter repository itself, the first line of each session (up to 160 characters), with API keys and tokens removed, is recorded in its _handoff/agent-sync/ folder.' },
];

const compliance: { head: string; items: string[] }[] = [
  { head: 'GDPR-aligned · EU', items: ['Data minimization · purpose limitation', 'Right to access · right to erasure'] },
  { head: 'LGPD-aligned · Brasil', items: ['Consentimento expresso e granular', 'Direito de acesso, correção, eliminação'] },
  { head: 'CCPA-aligned · California', items: ['No sale of personal information', 'Right to know what is collected'] },
  // 2026-08-27 · a terceira linha desta caixa dizia «Differential privacy noise
  // (ε=1.0)», com visto verde, numa página sobre tratamento de dados. Não existe
  // implementação nenhuma: procurados `epsilon`, `laplace`, `differential privacy`
  // em hub/, packages/, tools/ e landing/, o único resultado a sério é
  // `packages/cli/src/commands/quality.ts:32` — «hub upload (DP + k-anonymity≥50)
  // **lands in Wave 31**», ou seja um plano. (O «Laplace» de
  // `packages/fleet-commander/src/scheduler.mjs:23` é um prior Beta(1,1) de
  // Thompson sampling, sem relação com DP.) Afirmar uma garantia de privacidade
  // que não existe é pior do que afirmar uma poupança que não existe.
  //
  // O k-anonymity FICA porque é verdade e está provado: `hub/routes/federated.js`
  // exporta `K_ANONYMITY_MIN = 50` e `applyKAnonymity()` devolve
  // `{ suppressed: true, aggregate: null }` abaixo desse valor — com testes que
  // plantam 49 e 60 (`hub/routes/__tests__/federated.test.js:43-51`). Por isso
  // passa a dizer ONDE, para que a afirmação se possa verificar em vez de se
  // ter de acreditar nela.
  { head: 'Privacy-first by design', items: ['Telemetry default OFF', 'k-anonymity ≥50 on every public aggregate — enforced in hub/routes/federated.js, suppressed below it'] },
  { head: 'Open source · MIT', items: ['Reproducible builds', 'Independent audit welcome'] },
];

/* A margem tem de ser contada, não afirmada. Os dois números da última secção
   saem do próprio `docs/data-policy.md` que ela imprime por baixo: as linhas
   `- ` sob cada um dos dois cabeçalhos. Se o ficheiro mudar, a margem muda com
   ele — não há como ficar dessincronizada, porque não é escrita à mão. */
function contarItens(md: string, cabecalho: string): number {
  const i = md.indexOf(cabecalho);
  if (i < 0) return 0;
  const resto = md.slice(i + cabecalho.length);
  const fim = resto.indexOf('\n## ');
  return ((fim < 0 ? resto : resto.slice(0, fim)).match(/^- /gm) || []).length;
}

export default async function PrivacyPage() {
  // Build-time read — source of "what we collect" (IMPLEMENTATION_SPEC §10.4).
  let collected = '';
  try {
    collected = await readFile(join(process.cwd(), 'docs/data-policy.md'), 'utf-8');
  } catch {
    collected = '';
  }
  const hasPolicy = collected.includes('We collect');
  const nRecolhe = contarItens(collected, '## We collect');
  const nNunca = contarItens(collected, '## We never collect');

  return (
    <div style={SECTION_BG}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />
      <div className="privacy-wrap m-pad m-pad-y" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* O cartucho identifica a folha antes de qualquer conteúdo. A revisão
            vem de version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="PRIVACY" desenho="014" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* O ÚNICO momento extremo da folha. Um. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 980 }}>
            Your code stays yours. Always.
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '16px 0 0' }}>
            Mooter is a hook in your terminal, not a proxy through someone else&apos;s servers. Default OFF on every signal that leaves the machine.
          </p>
        </div>

        {/* As seis garantias. Eram seis cartões com pictograma rosa em azulejo
            tingido; passam a seis entradas numeradas, separadas por hairline. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            what stays on the machine
            <b>6 guarantees</b>
            the first one carries its own caveat
          </div>
          <div className="privacy-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px 32px', alignItems: 'start' }}>
            {cards.map((c, i) => (
              <div key={c.title} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
                <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>{String(i + 1).padStart(2, '0')}</div>
                <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.015em', marginTop: 8 }}>{c.title}</div>
                <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.65, margin: '6px 0 0' }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* D4 — privacy vs cloud routers */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            hook vs proxy
            <b>3 vs 3</b>
            the two names cited are examples, not a survey
          </div>
          <div>
            <h2 className="moo-h3" style={{ margin: '0 0 20px' }}>Why a hook beats a cloud router on privacy</h2>
            <div className="privacy-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'stretch' }}>
              {vsCloud.map((c) => (
                <Grupo key={c.head} rotulo={c.head}>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7 }}>
                    {c.items.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                </Grupo>
              ))}
            </div>
          </div>
        </div>

        {/* Conformidade. Era o único cartão com `accent` — um gradiente rosa a
            fazer o argumento em vez das linhas. Passa a cinco grupos com
            hairline, o mesmo tratamento da secção acima. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            compliance
            <b>5 blocks</b>
            only k-anonymity names the file that proves it
          </div>
          <div>
            <h2 className="moo-h3" style={{ margin: '0 0 20px' }}>Compliance &amp; data laws</h2>
            <div className="privacy-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 32px', alignItems: 'start' }}>
              {compliance.map((b) => (
                <Grupo key={b.head} rotulo={b.head}>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13, lineHeight: 1.7 }}>
                    {b.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                </Grupo>
              ))}
            </div>
            {/* 2026-08-27: aqui estava `<a href="/privacy">Read the privacy policy →</a>`
                — na própria página /privacy. Um link que devolve o leitor ao sítio
                onde ele já está lê-se como política que existe noutro lado; não
                existe. O que existe é a fonte, e é para lá que se aponta.
                O rosa fica: este é o CTA da folha, um dos três sítios onde a
                direcção o permite. */}
            <div style={{ marginTop: 28 }}>
              <a href="https://github.com/pauloloureiroshp-ship-it/mooter/blob/main/docs/data-policy.md"
                 style={{ color: 'var(--color-accent)', fontSize: 14 }}>
                Read data-policy.md on GitHub →
              </a>
              {/* Wave 16-18 A3 / Wave 60: no "security policy" link — it pointed to /privacy.
                  A real SECURITY.md page is still backlog. */}
            </div>
          </div>
        </div>

        {/* Wave 24 24.C — honest "Routing vs Execution" disclosure. The classifier
            is 100% local, but the model that runs afterwards can be cloud, and a
            T0-classified task can still execute on cloud Haiku when an API key is
            present. We say so plainly rather than implying everything stays local. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            the caveat
            <b>2 steps</b>
            classifying is local; executing may not be
          </div>
          <div style={{ maxWidth: 760 }}>
            <h2 className="moo-h3" style={{ margin: '0 0 16px' }}>Routing vs execution — the honest distinction</h2>
            <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 12px' }}>
              mooter has two separate steps, and they have different privacy properties:
            </p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.8 }}>
              <li><strong style={{ color: 'var(--color-text)' }}>Routing (classification)</strong> starts locally: regex in <code style={{ fontFamily: 'var(--mono)' }}>classify.js</code> — no AI, no network. If an Anthropic API key is set and the regex is unsure (confidence below 0.75, or an ambiguous category), mooter asks Claude Haiku to break the tie — that call sends your prompt to Anthropic with your key. Set <code style={{ fontFamily: 'var(--mono)' }}>MOOTER_ARBITER_DISABLE=1</code> to keep classification fully local.</li>
              <li><strong style={{ color: 'var(--color-text)' }}>Execution (the model call)</strong> then runs either locally (Ollama) or in the cloud (Anthropic), using <em>your own</em> API key — the prompt goes direct to your provider, never through a mooter server.</li>
              <li><strong style={{ color: 'var(--color-text)' }}>One honest caveat:</strong> when you have an Anthropic API key configured, some tasks that classify as <code style={{ fontFamily: 'var(--mono)' }}>T0</code> (e.g. summarisation) still execute on cloud Haiku for quality, rather than local Ollama. This is a deliberate quality trade-off.</li>
            </ul>
            <p style={{ color: 'var(--color-muted)', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              Bottom line: mooter never proxies your prompt through a mooter server. It does keep a few records on your machine, listed below. And &ldquo;routed to T0&rdquo; does not always mean &ldquo;stayed on your machine&rdquo;.
            </p>
          </div>
        </div>

        {/* 2026-09-23 · o que o código instalado grava localmente, dito à letra.
            Fontes (revisão que o /install clona): tools/router/prompt-traits.js,
            ledger-turn-io.js:34-35, session-context.js:45-54, agent-sync-ledger.js:174-184. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            local records
            <b>{localRecords.length} kinds</b>
            on your disk; delete them anytime
          </div>
          <div style={{ maxWidth: 760 }}>
            <h2 className="moo-h3" style={{ margin: '0 0 16px' }}>Local records — what mooter writes on your machine</h2>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.8 }}>
              {localRecords.map((r) => (
                <li key={r.head}><strong style={{ color: 'var(--color-text)' }}>{r.head}</strong> — {r.body}</li>
              ))}
            </ul>
          </div>
        </div>

        {hasPolicy ? (
          <div className="moo-secao m-stack">
            <div className="moo-marg">
              what would leave
              <b>{nRecolhe} fields · {nNunca} never</b>
              counted from the docs/data-policy.md printed alongside
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>What mooter collects (telemetry, opt-in only)</div>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>
                {collected}
              </pre>
            </div>
          </div>
        ) : null}
      </div>
      <style>{`@media (max-width: 900px){ .privacy-2col{ grid-template-columns: 1fr !important; } }
@media (max-width: 760px){ .privacy-wrap{ padding: 48px 20px 56px !important; } }`}</style>
    </div>
  );
}
