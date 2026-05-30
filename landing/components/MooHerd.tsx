import { MooterMarkTiny } from './MooterMark';

// MooHerd — a little row of cow mini-icons for the community-pulse strip.
export default function MooHerd({ count = 5, size = 16 }: { count?: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} style={{ marginLeft: i === 0 ? 0 : -size * 0.35, opacity: 0.5 + (i / count) * 0.5 }}>
          <MooterMarkTiny size={size} />
        </span>
      ))}
    </span>
  );
}
