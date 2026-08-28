import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import Dotgrid from '@/components/Dotgrid';

export const metadata: Metadata = {
  title: 'Privacy — your code stays yours',
  description: 'Mooter is a hook in your terminal, not a proxy. T0 stays local, prompts are hashed, telemetry is opt-in.',
};

// Wave 60 redesign — port of mooter-v1-iter1.jsx PrivacyArtboard: eyebrow +
// headline + 2×2 pictogram cards + compliance card, then the honest
// "vs cloud routers" and "Routing vs execution" disclosures (preserved from
// PR #179). Single rose accent; inline rose SVG pictograms (no new deps).
// NOTE: the mock's second footer button is intentionally NOT ported — that
// link was broken (it pointed back at /privacy; a11y-day2 test A3 guards
// against it) and a real SECURITY.md page is still backlog.

const pictoCommon = {
  width: 28,
  height: 28,
  viewBox: '0 0 36 36',
  fill: 'none',
  stroke: 'var(--color-accent)',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PICTO: Record<string, ReactNode> = {
  laptop: (
    <svg {...pictoCommon} aria-hidden="true">
      <rect x="6" y="10" width="24" height="14" rx="2" />
      <path d="M4 26h28l-2 3H6l-2-3z" />
    </svg>
  ),
  lock: (
    <svg {...pictoCommon} aria-hidden="true">
      <rect x="9" y="16" width="18" height="13" rx="2" />
      <path d="M13 16v-3a5 5 0 0110 0v3" />
    </svg>
  ),
  handshake: (
    <svg {...pictoCommon} aria-hidden="true">
      <path d="M5 18l5-5 4 3 5-5 5 5-5 7M19 14l8 6M14 25l-3 3" />
    </svg>
  ),
  off: (
    <svg {...pictoCommon} aria-hidden="true">
      <path d="M18 6v12" />
      <path d="M11 9a9 9 0 1014 0" />
    </svg>
  ),
  herd: (
    <svg {...pictoCommon} aria-hidden="true">
      <path d="M9 14c-2 0-3 2-3 4s1 4 3 4M27 14c2 0 3 2 3 4s-1 4-3 4" />
      <ellipse cx="18" cy="20" rx="9" ry="7" />
      <circle cx="15" cy="19" r="1" fill="var(--color-accent)" />
      <circle cx="21" cy="19" r="1" fill="var(--color-accent)" />
    </svg>
  ),
  book: (
    <svg {...pictoCommon} aria-hidden="true">
      <path d="M6 8h10a4 4 0 014 4v18M30 8H20a4 4 0 00-4 4v18M6 8v22h10M30 8v22H20" />
    </svg>
  ),
};

const cards: { icon: keyof typeof PICTO; title: string; body: string }[] = [
  { icon: 'laptop', title: 'T0 runs on Ollama, locally', body: 'When mooter executes on your local Ollama, your prompt and code never touch a network. One caveat: with an API key set, some T0-classified tasks run on cloud Haiku for quality — see “Routing vs execution” below.' },
  { icon: 'lock', title: 'Prompts hashed', body: 'We log a SHA-256 hash of each prompt — never the text itself.' },
  { icon: 'handshake', title: 'Opt-in telemetry', body: 'Defaults OFF. When you turn it on, only aggregated stats leave.' },
  { icon: 'off', title: 'Opt out anytime', body: 'Turn telemetry fully off with `mooter quiet --telemetry-off`. No prompt text is ever transmitted — only hashes and counts.' },
  { icon: 'herd', title: 'The herd stays on your machine', body: 'The 🐄×N counter and the “Moos that worked” digest are in-process runtime state only — counts and latencies, never prompt text, and none of it is sent anywhere. Tune it with `mooter quiet --verbose|--herd-quiet|--herd-off`; even `verbose` logs file paths, never their contents.' },
  { icon: 'book', title: 'Open source · audit it', body: 'Every line of mooter is on GitHub under MIT. Read the code yourself.' },
];

// D4 — how mooter differs from cloud routers/proxies on privacy.
const vsCloud: { head: string; items: string[] }[] = [
  { head: 'mooter (hook, local-first)', items: ['T0 runs on your machine — prompt never leaves', 'T1–T3 go direct to your own provider key', 'mooter never sees or stores your prompt text'] },
  { head: 'Cloud routers / proxies (e.g. LiteLLM-as-a-service, OpenRouter)', items: ['Every prompt transits a third-party server', 'That hop can log, cache or train on your text', 'You trust an extra party with your code'] },
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

export default async function PrivacyPage() {
  // Build-time read — source of "what we collect" (IMPLEMENTATION_SPEC §10.4).
  let collected = '';
  try {
    collected = await readFile(join(process.cwd(), 'docs/data-policy.md'), 'utf-8');
  } catch {
    collected = '';
  }
  const hasPolicy = collected.includes('We collect');

  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <Dotgrid />
      <div className="m-pad" style={{ position: 'relative', maxWidth: 1080, margin: '0 auto', padding: '72px 40px' }}>
        <Eyebrow>Privacy</Eyebrow>
        <h1 style={{ fontSize: 'clamp(38px, 6vw, 60px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 0 10px' }}>
          Your code stays yours. Always.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 720, lineHeight: 1.6, marginBottom: 40 }}>
          Mooter is a hook in your terminal, not a proxy through someone else&apos;s servers. Default OFF on every signal that leaves the machine.
        </p>

        <div className="priv-grid m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
          <div className="m-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {cards.map((c) => (
              <Card key={c.title} padding={18}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-accent-08)',
                    border: '1px solid var(--color-accent-25)',
                    borderRadius: 10,
                  }}
                >
                  {PICTO[c.icon]}
                </div>
                <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.015em', marginTop: 10 }}>{c.title}</div>
                <p style={{ color: 'var(--color-muted)', fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{c.body}</p>
              </Card>
            ))}
          </div>

          <Card accent padding={28}>
            <Eyebrow>Compliance &amp; data laws</Eyebrow>
            <div style={{ marginTop: 14 }}>
              {compliance.map((b) => (
                <div key={b.head} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--color-green)', fontSize: 13 }} aria-hidden="true">✓</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{b.head}</span>
                  </div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 22, color: 'var(--color-muted)', fontSize: 13 }}>
                    {b.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
              {/* 2026-08-27: aqui estava `<a href="/privacy">Read the privacy policy →</a>`
                  — na própria página /privacy. Um link que devolve o leitor ao sítio
                  onde ele já está lê-se como política que existe noutro lado; não
                  existe. O que existe é a fonte, e é para lá que se aponta. */}
              <a href="https://github.com/pauloloureiroshp-ship-it/mooter/blob/main/docs/data-policy.md"
                 style={{ color: 'var(--color-accent)', fontSize: 14 }}>
                Read data-policy.md on GitHub →
              </a>
              {/* Wave 16-18 A3 / Wave 60: no "security policy" link — it pointed to /privacy.
                  A real SECURITY.md page is still backlog. */}
            </div>
          </Card>
        </div>

        {/* D4 — privacy vs cloud routers */}
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 12 }}>Why a hook beats a cloud router on privacy</h2>
          <div className="priv-grid m-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {vsCloud.map((c) => (
              <Card key={c.head} padding={22}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{c.head}</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7 }}>
                  {c.items.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </Card>
            ))}
          </div>
        </div>

        {/* Wave 24 24.C — honest "Routing vs Execution" disclosure. The classifier
            is 100% local, but the model that runs afterwards can be cloud, and a
            T0-classified task can still execute on cloud Haiku when an API key is
            present. We say so plainly rather than implying everything stays local. */}
        <div style={{ marginTop: 36 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', marginBottom: 12 }}>Routing vs execution — the honest distinction</h2>
          <Card padding={28}>
            <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.7, margin: '0 0 12px' }}>
              mooter has two separate steps, and they have different privacy properties:
            </p>
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.8 }}>
              <li><strong style={{ color: 'var(--color-text)' }}>Routing (classification)</strong> runs 100% locally. It&apos;s pure regex in <code style={{ fontFamily: 'var(--mono)' }}>classify.js</code> — no AI, no network. Nothing is sent anywhere to decide which model handles your prompt.</li>
              <li><strong style={{ color: 'var(--color-text)' }}>Execution (the model call)</strong> then runs either locally (Ollama) or in the cloud (Anthropic), using <em>your own</em> API key — the prompt goes direct to your provider, never through a mooter server.</li>
              <li><strong style={{ color: 'var(--color-text)' }}>One honest caveat:</strong> when you have an Anthropic API key configured, some tasks that classify as <code style={{ fontFamily: 'var(--mono)' }}>T0</code> (e.g. summarisation) still execute on cloud Haiku for quality, rather than local Ollama. This is a deliberate quality trade-off — and your CLI&apos;s <strong>divergence chip</strong> surfaces it in real time so you always know when local intent ran in the cloud.</li>
            </ul>
            <p style={{ color: 'var(--color-muted)', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              Bottom line: mooter never proxies or stores your prompt text. But &ldquo;routed to T0&rdquo; does not always mean &ldquo;stayed on your machine&rdquo; — the divergence chip is how we keep that transparent.
            </p>
          </Card>
        </div>

        {hasPolicy ? (
          <Card style={{ marginTop: 28 }} padding={28}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>What mooter collects (telemetry, opt-in only)</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>
              {collected}
            </pre>
          </Card>
        ) : null}
        <style>{`@media (max-width: 900px){ .priv-grid{ grid-template-columns: 1fr !important; } }`}</style>
      </div>
    </section>
  );
}
