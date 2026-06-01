export default function ProgressBar({
  pct,
  color = 'var(--color-accent)',
  height = 8,
  width = '100%',
}: {
  pct: number;
  color?: string;
  height?: number;
  width?: number | string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        width,
        height,
        background: 'var(--color-surface-2)',
        borderRadius: height,
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${clamped}%`, height: '100%', background: color, borderRadius: height }} />
    </div>
  );
}
