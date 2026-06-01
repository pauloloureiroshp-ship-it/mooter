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
}

// Preserved from the original page.tsx HERO_SCENES (IMPLEMENTATION_SPEC §4.1 "sacred").
const HERO_SCENES: Scene[] = [
  { tier: 'T0', tierLabel: 'local · free', prompt: '"make this button rounded"', classify: '8ms', level: 'TRIVIAL', route: '→ qwen2.5-coder:7b (local)', routeColor: '#E8888A', cost: '$0.000', costColor: 'var(--color-green)' },
  { tier: 'T1', tierLabel: 'haiku · fast', prompt: '"explain this TypeError"', classify: '11ms', level: 'EXPLAIN', route: '→ claude-haiku', routeColor: '#A0B8D8', cost: '$0.001', costColor: 'var(--color-green)' },
  { tier: 'T2', tierLabel: 'sonnet · reason', prompt: '"why does submit crash on iOS?"', classify: '12ms', level: 'INVESTIGATE', route: '→ claude-sonnet', routeColor: '#A88BD4', cost: '$0.003', costColor: 'var(--color-green)' },
  { tier: 'T3', tierLabel: 'opus · critical', prompt: '"design payment infra w/ stripe"', classify: '19ms', level: 'ARCHITECTURE', route: '→ claude-opus', routeColor: '#D46A5A', cost: '$0.042', costColor: 'var(--color-yellow)' },
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
        <div style={{ minHeight: 132, transition: 'opacity 0.25s ease', opacity: visible ? 1 : 0 }}>
          <div style={{ color: 'var(--color-term-dim)' }}>$ claude <span style={{ color: 'var(--color-term-fg)' }}>{s.prompt}</span></div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--color-term-dim)' }}>classify </span>
            <span className="num">{s.classify}</span>
            <span style={{ color: 'var(--color-term-dim)' }}> · {s.level} · route </span>
            <span style={{ color: s.routeColor }}>{s.route}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            <span style={{ color: 'var(--color-term-dim)' }}>cost </span>
            <span className="num" style={{ color: s.costColor }}>{s.cost}</span>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-term-border)' }}>
          <StatuslineCard data={{ tier: s.tier, model: s.tierLabel.split(' ')[0] }} />
        </div>
      </TerminalCard>
    </div>
  );
}
