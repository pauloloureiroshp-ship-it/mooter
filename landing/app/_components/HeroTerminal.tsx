'use client';

import { useEffect, useRef, useState } from 'react';
import TerminalCard from '@/components/TerminalCard';
import StatuslineCard from '@/components/StatuslineCard';
import TierChip from '@/components/TierChip';
import LockChip from '@/components/LockChip';
import type { TierKey } from '@/lib/mooter-event';

interface Scene {
  tier: TierKey;
  tierLabel: string;
  prompt: string;
  classify: string;
  level: string;
  route: string;
  routeColor: string;
  cost: string;
  costColor: string;
  // Wave 60: richer routing trace (intent/complexity + profile + pack), per mock HeroV2Artboard.
  intent: string;
  complexity: string;
  complexityColor: string;
  pack: string;
  savesNote: string;
}

// Preserved from the original page.tsx HERO_SCENES (IMPLEMENTATION_SPEC §4.1 "sacred").
const HERO_SCENES: Scene[] = [
  { tier: 'T0', tierLabel: 'local · free', prompt: '"make this button rounded"', classify: '8ms', level: 'TRIVIAL', route: '→ qwen2.5-coder:7b (local)', routeColor: '#E8888A', cost: '$0.000', costColor: 'var(--color-green)', intent: 'edit', complexity: 'low', complexityColor: 'var(--color-tier-0)', pack: 'code-base', savesNote: '(over opus, saves $0.04)' },
  { tier: 'T1', tierLabel: 'haiku · fast', prompt: '"explain this TypeError"', classify: '11ms', level: 'EXPLAIN', route: '→ claude-haiku', routeColor: '#A0B8D8', cost: '$0.001', costColor: 'var(--color-green)', intent: 'explain', complexity: 'low', complexityColor: 'var(--color-tier-1)', pack: 'errors-triage', savesNote: '(over opus, saves $0.03)' },
  { tier: 'T2', tierLabel: 'sonnet · reason', prompt: '"draft the system map for the auth refactor"', classify: '122ms', level: 'ARCHITECTURE', route: '→ claude-sonnet', routeColor: '#A88BD4', cost: '$0.003', costColor: 'var(--color-green)', intent: 'arch', complexity: 'med', complexityColor: 'var(--color-tier-2)', pack: 'diagram-systems', savesNote: '(over opus, saves $0.31)' },
  { tier: 'T3', tierLabel: 'opus · critical', prompt: '"design payment infra w/ stripe"', classify: '19ms', level: 'ARCHITECTURE', route: '→ claude-opus', routeColor: '#D46A5A', cost: '$0.042', costColor: 'var(--color-yellow)', intent: 'arch', complexity: 'high', complexityColor: 'var(--color-tier-3)', pack: 'payments-infra', savesNote: '(hard → kept on opus)' },
];

export default function HeroTerminal() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const inView = useRef(true);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Pause the demo when out of viewport (perf — IMPLEMENTATION_SPEC §9).
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const ob = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; }, { threshold: 0.1 });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (!inView.current) return;
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % HERO_SCENES.length);
        setVisible(true);
      }, 250);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const s = HERO_SCENES[idx];

  return (
    <div ref={hostRef}>
      <TerminalCard
        title="mooter · live routing"
        headerRight={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <LockChip />
            <TierChip tier={s.tier} label={s.tierLabel} />
          </span>
        }
      >
        <div style={{ minHeight: 168, transition: 'opacity 0.25s ease', opacity: visible ? 1 : 0 }}>
          <div style={{ color: 'var(--color-term-dim)' }}>$ claude <span style={{ color: 'var(--color-accent)' }}>{s.prompt}</span></div>
          <div style={{ marginTop: 6, color: 'var(--color-term-dim)' }}>
            {'  ├─ '}<span style={{ color: 'var(--color-term-fg)' }}>classify</span>{'  '}
            <span className="num" style={{ color: 'var(--color-green)' }}>{s.classify}</span>
            {'  · intent='}<span style={{ color: 'var(--color-accent)' }}>{s.intent}</span>
            {' complexity='}<span style={{ color: s.complexityColor }}>{s.complexity}</span>
          </div>
          <div style={{ color: 'var(--color-term-dim)' }}>
            {'  ├─ '}<span style={{ color: 'var(--color-term-fg)' }}>profile</span>{'   GPU='}
            <span style={{ color: 'var(--color-term-fg)' }}>RTX 4090</span>{'  sub='}
            <span style={{ color: 'var(--color-term-fg)' }}>claude-max</span>
          </div>
          <div style={{ color: 'var(--color-term-dim)' }}>
            {'  ├─ '}<span style={{ color: 'var(--color-term-fg)' }}>pack</span>{'      '}
            <span style={{ color: 'var(--color-accent)' }}>{s.pack}</span>{'  (trust 98)'}
          </div>
          <div style={{ color: 'var(--color-term-dim)' }}>
            {'  └─ '}<span style={{ color: 'var(--color-term-fg)' }}>route</span>{'     '}
            <span style={{ color: s.routeColor }}>{s.route}</span>{'  '}
            <span style={{ opacity: 0.6 }}>{s.savesNote}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--color-term-dim)' }}>cost </span>
            <span className="num" style={{ color: s.costColor }}>{s.cost}</span>
            <span style={{ color: 'var(--color-term-dim)' }}> · {s.level}</span>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-term-border)' }}>
          <StatuslineCard data={{ tier: s.tier, model: s.tierLabel.split(' ')[0] }} />
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              fontStyle: 'italic',
              color: 'var(--color-term-dim)',
            }}
          >
            *illustrative — your numbers vary
          </div>
        </div>
      </TerminalCard>
    </div>
  );
}
