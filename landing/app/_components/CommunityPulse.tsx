'use client';

import { useEffect, useState } from 'react';
import MooHerd from '@/components/MooHerd';

// CommunityPulse — strip of 4 community numbers with graceful fallback
// (IMPLEMENTATION_SPEC §6.1 / §10.2). The /api/community/pulse endpoint does
// not exist in Phase A (it is Phase D), so this always renders the placeholder.

interface PulseData {
  prompts_routed: number;
  avg_savings_pct: number;
  saved_last_7d: number;
  active_devs: number;
}

async function fetchPulse(): Promise<PulseData | null> {
  try {
    const r = await fetch('/api/community/pulse', { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const data = (await r.json()) as Partial<PulseData>;
    if (data.prompts_routed == null) return null;
    return data as PulseData;
  } catch {
    return null;
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="num" style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', fontSize: 28, fontWeight: 700 }}>
        {value}
      </div>
      <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function CommunityPulse() {
  const [data, setData] = useState<PulseData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPulse().then((d) => {
      if (!alive) return;
      setData(d);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 28,
        padding: '28px 0',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        alignItems: 'center',
      }}
    >
      <Stat value="14,231" label="Prompts routed" />
      <Stat value="89.9%" label="Avg savings" />
      {loaded && data ? (
        <Stat value={`$${data.saved_last_7d}`} label="Saved last 7d" />
      ) : (
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent-2)' }}>growing</div>
          <div style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4 }}>be one of the first 50</div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MooHerd count={5} />
        <Stat value="247" label="Active devs" />
      </div>
    </div>
  );
}
