import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';

export const metadata: Metadata = {
  title: 'Spawn agents — local-first, sandboxed, by default | Mooter',
  description:
    'Mooter spawns coding agents on your machine, each isolated in a git worktree inside a 4-layer sandbox. No --no-sandbox. Verified against the CVE-2025-59528 escape scenario.',
};

// Wave 33.5 Block G.1 — info page. Estava em scaffold cru desde entao: um
// `<main className="prose">` com um h1, um paragrafo, uma lista e outro
// paragrafo. Nao tinha gramatica nenhuma — nem a antiga (Dotgrid + Card +
// Eyebrow) nem a nova.
//
// 2026-08-28 · entra na gramatica do Papel Milimetrico (direccao fixada a
// 2026-08-27): grelha de 8px visivel, cartucho a identificar a folha, coluna de
// margem para a anotacao, hairlines a separar em vez de caixas. Sai tambem um
// defeito estrutural que o scaffold trazia: `(marketing)/layout.tsx` ja embrulha
// tudo num `<main>`, e esta folha abria outro dentro dele — dois `<main>` na
// mesma pagina, que e HTML invalido e confunde um leitor de ecra.
//
// O CONTEUDO nao muda. O titulo, o paragrafo de abertura, as quatro camadas com
// as suas bandeiras, a recusa e o comando de verificacao estao palavra por
// palavra como estavam. O que muda e onde vivem.

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

/* As quatro camadas, verbatim do scaffold — eram quatro `<li>` de uma `<ul>`
   com `<strong>` a fazer de titulo. Os titulos e os corpos sao os mesmos; o que
   passa a existir e a separacao entre um e outro, para o mecanismo (a bandeira,
   o ficheiro) poder ser lido sozinho. */
const camadas: { titulo: string; corpo: ReactNode }[] = [
  {
    titulo: 'Network egress',
    corpo: (
      <>
        <code>--unshare-net</code> for pure-compute spawns.
      </>
    ),
  },
  {
    titulo: 'Filesystem',
    corpo: <>read-only root; the worktree is the single writable mount; secret dirs masked.</>,
  },
  {
    titulo: 'Secrets',
    corpo: (
      <>
        cleared env + whitelist; <code>ANTHROPIC_API_KEY</code> never reaches a local spawn.
      </>
    ),
  },
  {
    titulo: 'Config',
    corpo: (
      <>
        <code>settings.json</code> read-only.
      </>
    ),
  },
];

export default function SpawnPage() {
  return (
    <div style={SECTION_BG}>
      {/* A grelha de 8px, faint. E o chao da folha: um desenho tecnico assenta
          numa grelha, e a grelha e o que torna visivel que ha uma. */}
      <div className="moo-mm" aria-hidden="true" />
      <div
        className="m-pad m-pad-y"
        style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}
      >
        {/* O cartucho identifica a folha antes de qualquer conteudo. A revisao
            vem de version.json, escrito pelo version-sync a partir da tag —
            nunca a mao. */}
        <Cartucho o_que="O SPAWN" desenho="018" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* O UNICO momento extremo da folha (regra 10). Um: o titulo, e o
            comando por baixo dele. Nao ha aqui numero gigante a pedir — o «4»
            das camadas ja e o momento da folha 013 (A SEGURANCA), e repeti-lo
            aqui em corpo enorme seria decoracao: o argumento desta folha nao e
            quantas camadas ha, e que um comando de uma linha as monta todas
            sem se lhe pedir nada. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 980 }}>
            Spawn agents — local-first, by default
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '16px 0 0' }}>
            <code>mooter spawn &quot;fix bug in Hero.tsx&quot;</code> classifies the task with the same{' '}
            <code>classify.js</code> doctrine that routes everything else, cuts an isolated git worktree,
            wraps the process in a 4-layer sandbox, and streams the output to a log you can tail.
          </p>
        </div>

        {/* As quatro camadas. Eram quatro marcas de lista com `<strong>` — o
            unico sinal de hierarquia era o negrito. Passam a quatro grupos
            separados por hairline, com o numero de ordem em mono, e o mecanismo
            numa linha propria. Zero caixas, zero fundos: o que separa e a
            linha. A margem conta os grupos desta seccao — quatro, e sao os
            quatro que a `<ul>` ja tinha. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            layers
            <b>4 mandatory</b>
            none can be switched off by a flag
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
            {camadas.map((c, i) => (
              <li key={c.titulo} style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="moo-label" style={{ color: 'var(--moo-faint)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.015em' }}>{c.titulo}</span>
                </div>
                <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.55, margin: '8px 0 0' }}>
                  {c.corpo}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/* A recusa e a verificacao. Era o paragrafo final, corrido, com a frase
            mais forte da folha («There is no --no-sandbox») a meio de uma linha
            de texto. Passa a grupo proprio: a recusa em cima, com peso, e o
            comando que a testa por baixo. A margem conta os comandos NOMEADOS
            nesta seccao — um. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            verify
            <b>1 command</b>
            on real bubblewrap, every release
          </div>
          <div style={{ maxWidth: 640, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
            <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>
              No opt-out
            </div>
            <p style={{ fontSize: 16, lineHeight: 1.55, margin: '10px 0 0', letterSpacing: '-0.015em' }}>
              There is no <code>--no-sandbox</code>.
            </p>
            <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7, margin: '8px 0 0' }}>
              Run <code>mooter security spawn-test</code> to verify the sandbox blocks the escape — on real
              bubblewrap, every release.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
