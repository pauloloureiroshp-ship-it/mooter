import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';
import ConductorVisual from './ConductorVisual';

export const metadata: Metadata = {
  title: 'Conductor — multi-session git safety',
  description:
    'Running multiple Claude Code sessions? Mooter Conductor coordinates them with filesystem locks and 5-second heartbeats so two agents never break git. Stale recovery only with your confirm.',
};

// Conductor showcase (Wave 60 visual port). The lock-dance is a client component
// (ConductorVisual) — transform/opacity only, paused off-screen, frozen for
// prefers-reduced-motion. Honest copy carried verbatim from PR #179.
//
// 2026-08-28 · passada à gramática do Papel Milimétrico (direcção de 2026-08-27).
// O que saiu: o `<Dotgrid>` (campo de pontos → grelha de 8px), o `<Eyebrow>` rosa
// (→ cartucho), e os três `<Card>` dos mecanismos (→ três grupos separados por
// hairline). O conteúdo — as afirmações, os números, o copy — não mudou.

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

// How coordination actually works — three honest mechanisms, no metrics invented.
const STEPS: { k: string; title: string; body: string }[] = [
  {
    k: 'lock',
    title: 'Filesystem lock',
    body: 'One session at a time holds .git/index.lock. The others queue in order — no race, no clobbered commit.',
  },
  {
    k: 'heartbeat',
    title: 'Heartbeat every 5s',
    body: 'The holder pings every 5 seconds. A live holder keeps the lock; a missed beat is what flags a stale one.',
  },
  {
    k: 'confirm',
    title: 'Recovery on your confirm',
    body: 'Conductor never force-breaks a stale lock on its own. It surfaces the situation and waits for you to confirm.',
  },
];

/**
 * Um grupo do desenho — o mesmo das folhas 002, 005 e 008. Era um `<Card>`:
 * fundo próprio e raio 14, ou seja uma CAIXA, que é exactamente o que a
 * direcção de 2026-08-27 tirou da linguagem. O que separa passa a ser a
 * hairline; o rótulo é mono em caixa-alta (`.moo-label`) e o ordinal fica ao
 * lado, em faint — era rosa, e o rosa está reservado às cotas e ao CTA.
 */
function Grupo({ ordinal, rotulo, children }: { ordinal: string; rotulo: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14, alignSelf: 'start' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 10,
            letterSpacing: '0.14em',
            color: 'var(--moo-faint)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {ordinal}
        </span>
        <span className="moo-label" style={{ color: 'var(--moo-faint)' }}>{rotulo}</span>
      </div>
      {children}
    </div>
  );
}

export default function ConductorPage() {
  return (
    <div style={SECTION_BG}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />
      <div className="conductor-wrap m-pad m-pad-y" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* O cartucho identifica a folha antes de qualquer conteúdo — e substitui
            o `<Eyebrow>` rosa que dizia a mesma coisa por baixo. A revisão vem de
            version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="CONDUCTOR" desenho="015" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* Abertura à escala normal da folha. O momento extremo desta prancha
            NÃO é aqui: é o baile das fechaduras, mais abaixo — um momento vivo.
            Uma folha cujo assunto é coordenação a acontecer em tempo real tem de
            MOSTRAR, e por isso o H1 fica no `moo-h1` de sempre e não compete. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 940 }}>
            Multiple Claude sessions? Mooter coordinates them so you don&apos;t break git.
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '16px 0 0' }}>
            Filesystem locks. Heartbeats every 5 seconds. Stale recovery only with your confirm. No race conditions. No deleted commits.
          </p>
        </div>

        {/* O ÚNICO momento extremo da folha (regra 4): o baile das fechaduras, vivo.
            A margem é telegráfica: o que a secção É, o número que a governa, a
            ressalva. As 3 sessões são as 3 entradas de `SESSIONS` em
            ConductorVisual.tsx — contadas lá, não estimadas. A ressalva é a que
            faltava: o rodízio do detentor é um `setInterval` de 3200ms, não
            telemetria de uma corrida a sério. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            the lock
            <b>3 sessions</b>
            the hand-off is sheet animation — not a real run
          </div>
          <div>
            <ConductorVisual />
          </div>
        </div>

        {/* Como se mantém seguro. Eram três `<Card>` com o ordinal a rosa; passam
            a três grupos separados por hairline — zero caixas, zero rosa. A cota
            da margem é `STEPS.length`, lida do próprio ficheiro: acrescentar um
            mecanismo move o número sozinho. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            mechanisms
            <b>{STEPS.length} steps</b>
            none breaks the lock on its own
          </div>
          <div>
            <div className="conductor-steps m-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
              {STEPS.map((s, i) => (
                <Grupo key={s.k} ordinal={String(i + 1).padStart(2, '0')} rotulo={s.title}>
                  <span style={{ display: 'block', color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.6 }}>{s.body}</span>
                </Grupo>
              ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 880px){ .conductor-grid{ grid-template-columns: 1fr !important; gap: 28px !important; } } @media (max-width: 768px){ .conductor-steps{ grid-template-columns: 1fr !important; } .conductor-wrap{ padding: 48px 20px 56px !important; } }`}</style>
    </div>
  );
}
