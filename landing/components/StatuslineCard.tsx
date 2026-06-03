import { MooterMarkTiny } from './MooterMark';

// StatuslineCard — the 3-line narrative statusline (IMPLEMENTATION_SPEC §6.1 / §11.2).
// Matches STATUSLINE_FORMAT_LINES. Reusable in hero + dashboard preview.
export interface StatuslineData {
  savedToday: string;
  savedPct: string;
  tier: string;
  model: string;
  conf: string;
  pack: string;
  bar5h: string;
  pct5h: string;
  bar7d: string;
  pct7d: string;
  resetIn: string;
  ctxPct: string;
  adapterOn: boolean;
  costTurn: string;
  alltime: string;
}

const DEFAULTS: StatuslineData = {
  savedToday: '$0.31',
  savedPct: '89%',
  tier: 'T2',
  model: 'sonnet',
  conf: '0.84',
  pack: 'diagram-systems',
  bar5h: '▓▓▓▓░░░░░░',
  pct5h: '42% 5h',
  bar7d: '▓▓░░░░░░░░',
  pct7d: '18% 7d',
  resetIn: '2h14m',
  ctxPct: '23%',
  adapterOn: false,
  costTurn: '$0.04',
  alltime: '$4.21',
};

export default function StatuslineCard({ data }: { data?: Partial<StatuslineData> }) {
  const d = { ...DEFAULTS, ...data };
  const dim = 'var(--color-term-dim)';
  const fg = 'var(--color-term-fg)';
  return (
    <div
      className="num"
      style={{
        fontFamily: 'var(--mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12.5,
        lineHeight: 1.85,
        color: fg,
        whiteSpace: 'pre',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <MooterMarkTiny size={14} />
        <span>
          saved <span style={{ color: 'var(--color-green)' }}>{d.savedToday}</span> today ({d.savedPct} vs all-Opus)
          {'  ·  '}
          <span style={{ color: 'var(--color-tier-2-term)' }}>{d.tier} {d.model}</span> · conf {d.conf}{'  ·  '}
          pack: <span style={{ color: 'var(--color-accent-2)' }}>{d.pack}</span>
        </span>
      </div>
      <div style={{ color: dim }}>
        {`   ${d.bar5h} ${d.pct5h}  ·  ${d.bar7d} ${d.pct7d}  ·  ↺ ${d.resetIn}`}
      </div>
      <div style={{ color: dim }}>
        {`   ctx ${d.ctxPct}  ·  ${d.adapterOn ? 'adapter 🔧 active' : 'adapter — baseline · mooter forge install'}  ·  ${d.costTurn} turn  ·  alltime ${d.alltime}`}
      </div>
    </div>
  );
}
