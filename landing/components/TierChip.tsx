import { TIER_COLORS_WEB, type TierKey } from '@/lib/mooter-event';

export default function TierChip({ tier, label }: { tier: TierKey; label?: string }) {
  const color = TIER_COLORS_WEB[tier];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--mono)',
        color,
        background: `${color}1A`,
        border: `1px solid ${color}40`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {tier}
      {label ? <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}>{label}</span> : null}
    </span>
  );
}
