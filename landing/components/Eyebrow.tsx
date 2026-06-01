import type { ReactNode } from 'react';

export default function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--color-accent)',
        marginBottom: 12,
      }}
    >
      {children}
    </span>
  );
}
