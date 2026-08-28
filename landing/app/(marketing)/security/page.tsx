import type { Metadata } from 'next';
import Link from 'next/link';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';

export const metadata: Metadata = {
  title: 'Sandbox security — 4 layers | Mooter',
  description:
    'Mooter spawns run inside a 4-layer sandbox (network, filesystem, secrets, config). Mandatory — no --no-sandbox. Verified against the CVE-2025-59528 escape scenario on real bubblewrap.',
};

// 2026-08-28 · a folha passa para a gramatica do Papel Milimetrico (direccao
// fixada a 2026-08-27). Saiu o <Dotgrid> (campo de pontos) para a grelha de 8px;
// saiu o <Eyebrow> rosa; sairam os quatro <Card> das camadas e o <Card accent>
// da verificacao — o que separa passa a ser a hairline, e a anotacao passa a
// viver na margem. O CONTEUDO nao muda: a recusa, a cobertura por plataforma, as
// quatro camadas e os dois comandos estao palavra por palavra como estavam.

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

const layers: { title: string; body: string }[] = [
  {
    title: 'Network egress',
    body: 'An empty network namespace for isolated spawns — a local agent has no route off the machine.',
  },
  {
    title: 'Filesystem boundary',
    body: 'Read-only root, exactly one writable worktree, and secret directories masked out of view.',
  },
  {
    title: 'Secrets scoping',
    body: 'Cleared env plus an explicit whitelist — provider API keys are excluded from local spawns.',
  },
  {
    title: 'Config protection',
    body: 'Your settings stay read-only. A spawned agent cannot rewrite the rules it runs under.',
  },
];

export default function SecurityPage() {
  return (
    <div style={SECTION_BG}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direccao fixada a
          2026-08-27 e papel milimetrico, e um desenho tecnico assenta numa
          grelha, nao num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />
      <div
        className="m-pad m-pad-y"
        style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}
      >
        {/* O cartucho identifica a folha antes de qualquer conteudo. A revisao
            vem de version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="A SEGURANCA" desenho="013" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* O UNICO momento extremo da folha. Um: o titulo e a recusa por baixo
            dele. Nao ha aqui um numero gigante para pedir — o «4» das camadas
            seria decoracao, porque o argumento da folha nao e a quantidade de
            camadas, e o facto de nao existir modo sem elas. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 980 }}>
            The 4-layer sandbox, in the open.
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '16px 0 0' }}>
            CVE-2025-59528 — the Antigravity sandbox escape (CVSS 10.0) — is why Mooter ships sandboxing
            as mandatory. There is no{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>--no-sandbox</code>: when no backend can enforce
            these layers, the orchestrator <strong>refuses to spawn</strong> and tells you what to install.
          </p>
        </div>

        {/* 2026-08-27 · esta frase dizia «Every spawned agent runs inside four isolation
            layers». Não é falso, mas escondia metade: `sandbox/detect.ts` devolve
            `bubblewrap` em Linux, `seatbelt` em macOS e **`none` em Windows** — e em
            Windows não corre agente nenhum, sandboxed ou não. Escrito como estava,
            um utilizador de Windows lia «todo o agente que lanço está protegido»
            quando o que se passa é que não lança nenhum.
            A recusa é a parte mais forte da história e estava por dizer:
            `detect.ts:3-5` — «There is NO unsandboxed mode … the orchestrator refuses
            to spawn and tells the user how to install one» — e `fanout.ts:126-130`
            reporta a tarefa como «unavailable» com a razão real em vez de a correr
            à solta. É por isso que agora está escrito ao contrário: primeiro a
            recusa, depois a cobertura por plataforma na linha abaixo.
            2026-08-28 · o texto fica intacto; passa a ter margem, e a margem conta
            as plataformas nomeadas nesta mesma frase: 3 nomeadas, 2 com backend. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            coverage
            <b>2 of 3</b>
            on windows no agent is spawned at all
          </div>
          <div>
            <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.6, maxWidth: 640, margin: 0 }}>
              Backends today: <strong>Linux</strong> via bubblewrap, <strong>macOS</strong> via Seatbelt
              (<code style={{ fontFamily: 'var(--mono)' }}>sandbox-exec</code>). <strong>Windows</strong> has
              no backend yet — local spawns are reported unavailable, never run unprotected.
            </p>
          </div>
        </div>

        {/* As quatro camadas. Eram quatro <Card> num grid 1fr 1fr — caixa com
            fundo proprio e raio 14, que e o que a direccao tirou. Passam a
            quatro grupos separados por hairline, e o numero de ordem deixa de
            ser rosa: o rosa fica para as cotas e para o CTA. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            sandbox
            <b>4 layers</b>
            all mandatory — there is no mode without them
          </div>
          <ol
            className="m-stack"
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '24px 32px',
            }}
          >
            {layers.map((l, i) => (
              <li key={l.title} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="moo-label" style={{ color: 'var(--moo-faint)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.015em' }}>{l.title}</span>
                </div>
                <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.55, margin: '8px 0 0' }}>
                  {l.body}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/* Era um <Card accent> — fundo rosa a fazer o argumento em vez do
            comando. O comando faz o argumento sozinho: passa a grupo com
            hairline e rotulo mono. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            verify
            <b>2 commands</b>
            spawn-test must block 3 accesses
          </div>
          <div style={{ maxWidth: 640, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
            <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>Verify it yourself</div>
            <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7, margin: '10px 0 0' }}>
              <code style={{ fontFamily: 'var(--mono)' }}>mooter security audit</code> reports the layers
              active on your host. <code style={{ fontFamily: 'var(--mono)' }}>mooter security spawn-test</code>{' '}
              runs a real escape attempt and must block reading{' '}
              <code style={{ fontFamily: 'var(--mono)' }}>~/.ssh</code>, writing outside the worktree, and
              leaking the API key.
            </p>
          </div>
        </div>

        {/* O fecho. Sem cota: nao ha aqui numero honesto para pôr na margem, e a
            regra e rotulo so, nunca um numero inventado para encher. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            source
            <b>MIT</b>
            the sandbox is in the repository
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <Link href="/" style={{ color: 'var(--color-accent)', fontSize: 14 }}>
              ← Back home
            </Link>
            <span style={{ fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
              open source, MIT · audit the sandbox on GitHub
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
