'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// ConductorVisual (Wave 60) — the multi-session lock dance, simulated.
// Three sessions; the lock holder rotates through the queue every few seconds so
// the page *shows* coordination instead of describing a frozen snapshot. All
// motion is transform/opacity only; it pauses off-screen (IntersectionObserver)
// and freezes entirely for prefers-reduced-motion users. Honest copy unchanged.
//
// 2026-08-28 · Papel Milimétrico. Três coisas saíram, e nenhuma era conteúdo:
//   · o `<Card>` do painel de estado → grupo separado por hairline (regra 3);
//   · o `<Eyebrow>` rosa → rótulo mono em caixa-alta (`.moo-label`);
//   · a anotação manuscrita em `--color-accent-2`, com seta curva e fonte
//     cursiva — anotação vive na margem, e o rosa está reservado às cotas e ao
//     CTA (regras 1 e 5). A frase que ela dizia fica, em mono, por baixo dos
//     terminais: perdeu-se a caligrafia, não a afirmação.
// E o rosa que marcava o DETENTOR passou a verde. Não é cosmética: verde já era
// «tem a fechadura» (`● held`, `holds .git/index.lock`, o batimento) e amarelo
// já era «em fila». A cor passa a significar o estado em vez de assinalar a
// marca — e a folha fica sem rosa nenhum, como manda a regra 5.

type Phase = 0 | 1 | 2;

interface Session {
  branch: string;
  cmd: ReactNode;
  pid: number;
}

const SESSIONS: Session[] = [
  { branch: 'wave33-ultimate', cmd: <>$ git commit -m <span style={{ color: 'var(--color-term-fg)' }}>&quot;wave33: final pass&quot;</span></>, pid: 48213 },
  { branch: 'wave34-exp', cmd: <>$ git rebase main</>, pid: 48266 },
  { branch: 'hotfix/billing', cmd: <>$ git commit -m <span style={{ color: 'var(--color-term-dim)' }}>&quot;hotfix: null guard&quot;</span></>, pid: 48291 },
];

const ADVANCE_MS = 3200;

function TrafficLights() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }} aria-hidden>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
    </div>
  );
}

function MiniTerm({
  branch, holds, queuePos, cmd,
}: { branch: string; holds: boolean; queuePos: number; cmd: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-term-bg)',
        border: `1px solid ${holds ? 'var(--color-term-fg)' : 'var(--color-term-border)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'var(--font-mono)',
        opacity: holds ? 1 : 0.62,
        transition: 'opacity 0.45s ease, border-color 0.45s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 13px', background: 'var(--color-term-header)', borderBottom: '1px solid var(--color-term-border)', fontSize: 11.5, flexWrap: 'wrap' }}>
        <TrafficLights />
        <span style={{ color: 'var(--color-term-fg)' }}>~/repo</span>
        <span style={{ color: 'var(--color-term-dim)' }}>·</span>
        <span style={{ color: holds ? 'var(--color-green)' : 'var(--color-term-dim)' }}>{branch}</span>
        <span style={{ marginLeft: 'auto', color: holds ? 'var(--color-green)' : 'var(--color-yellow)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
          <span
            className="mpulse-dot"
            style={{ width: 6, height: 6, borderRadius: '50%', background: holds ? 'var(--color-green)' : 'var(--color-yellow)', animation: holds ? 'mpulse 1.8s ease-in-out infinite' : 'none' }}
          />
          {holds ? 'holds lock' : `queued #${queuePos}`}
        </span>
      </div>
      <div style={{ padding: '12px 14px', fontSize: 12.5, lineHeight: 1.7, color: 'var(--color-term-fg)' }}>
        <div style={{ color: 'var(--color-term-dim)' }}>{cmd}</div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            opacity: holds ? 1 : 0.85,
            transition: 'opacity 0.45s ease',
          }}
        >
          {holds ? (
            <>
              <span style={{ color: 'var(--color-green)' }}>🔒</span>
              <span style={{ color: 'var(--color-green)' }}>holds .git/index.lock</span>
              <span style={{ color: 'var(--color-term-dim)' }}>· heartbeat</span>
              <span className="mheart-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-green)', animation: 'mheart 2.2s ease-in-out infinite' }} />
              <span style={{ color: 'var(--color-term-dim)' }}>5s</span>
            </>
          ) : (
            <span style={{ color: 'var(--color-yellow)' }}>○ waiting for lock · position {queuePos} in queue</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConductorVisual() {
  const [holder, setHolder] = useState(0);
  const inView = useRef(true);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const ob = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; }, { threshold: 0.1 });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => {
      if (!inView.current) return;
      setHolder((h) => (h + 1) % SESSIONS.length);
    }, ADVANCE_MS);
    return () => clearInterval(id);
  }, []);

  // queue order rotates so the next-in-line is always #1.
  const queueRank = (i: number) => ((i - holder + SESSIONS.length) % SESSIONS.length);
  const held = SESSIONS[holder];
  const queue = SESSIONS
    .map((s, i) => ({ s, rank: queueRank(i) }))
    .filter((x) => x.rank > 0)
    .sort((a, b) => a.rank - b.rank);

  return (
    <div ref={hostRef} className="conductor-grid" style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 40, alignItems: 'start' }}>
      {/* LEFT — three live sessions.
          `minWidth: 0` pela mesma razão que está escrita em `moo-ui.css` para
          `.moo-secao > *`: um filho de grid tem `min-width: auto`, e um terminal
          largo EMPURRA a coluna em vez de rolar dentro dela. Foi assim que a home
          chegou a 725px num ecrã de 375. Aqui há três terminais numa grelha. */}
      <div style={{ position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SESSIONS.map((s, i) => (
          <MiniTerm key={s.branch} branch={s.branch} cmd={s.cmd} holds={i === holder} queuePos={queueRank(i)} />
        ))}

        {/* A mesma frase da anotação manuscrita, sem a caligrafia e sem o rosa.
            Mono e muted, como a legenda do chip em /workflow. */}
        <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.6 }}>
          ↑ this is what stops 2 sessions from pushing simultaneously
        </div>
      </div>

      {/* RIGHT — conductor state (tracks the live holder) */}
      <div style={{ minWidth: 0, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
        <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>worktree conductor · lock state</div>
        <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-term-dim)' }}>.git/index.lock</span>
            <span style={{ color: 'var(--color-green)' }}>● held</span>
          </div>
          <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <div className="moo-label" style={{ color: 'var(--moo-faint)', marginBottom: 8 }}>holder</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, transition: 'opacity 0.45s ease' }}>
              <span style={{ color: 'var(--color-green)' }}>{held.branch}</span>
              <span style={{ color: 'var(--color-term-dim)' }}>· pid {held.pid}</span>
            </div>
          </div>
          <div style={{ paddingTop: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
            <div className="moo-label" style={{ color: 'var(--moo-faint)', marginBottom: 8 }}>queue</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {queue.map(({ s, rank }) => (
                <div key={s.branch} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-yellow)', transition: 'opacity 0.45s ease' }}>
                  <span style={{ color: 'var(--color-term-dim)' }}>{rank}.</span>{s.branch}
                </div>
              ))}
            </div>
          </div>
          <div style={{ paddingTop: 12 }}>
            <div className="moo-label" style={{ color: 'var(--moo-faint)', marginBottom: 8 }}>heartbeat</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="mheart-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-green)', animation: `mheart 2.2s ease-in-out ${i * 0.12}s infinite` }} />
              ))}
              <span style={{ color: 'var(--color-term-dim)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>every 5s · alive</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--color-border)', fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.6 }}>
          Stale lock detected? Conductor never force-breaks it. Recovery happens{' '}
          <span style={{ color: 'var(--color-text)' }}>only with your confirm</span>.
        </div>
      </div>
    </div>
  );
}
