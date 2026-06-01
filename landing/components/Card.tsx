import type { CSSProperties, ReactNode } from 'react';

export default function Card({
  children,
  padding = 24,
  accent = false,
  style,
}: {
  children: ReactNode;
  padding?: number;
  accent?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${accent ? 'var(--color-accent-25)' : 'var(--color-border)'}`,
        borderRadius: 14,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
