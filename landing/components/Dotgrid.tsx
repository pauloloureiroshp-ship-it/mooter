import type { CSSProperties } from 'react';

// Dotgrid — recessed dot-grid backdrop (mock parity: shared.jsx Dotgrid).
// Decorative only: absolutely positioned, no pointer events, aria-hidden.
export default function Dotgrid({
  color = 'rgba(255,255,255,0.025)',
  size = 22,
  style,
}: {
  color?: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: `radial-gradient(${color} 1px, transparent 1px)`,
        backgroundSize: `${size}px ${size}px`,
        ...style,
      }}
    />
  );
}
