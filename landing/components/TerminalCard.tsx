import type { CSSProperties, ReactNode } from 'react';

// TerminalCard — TTY frame with mac traffic lights + header (IMPLEMENTATION_SPEC §6.1).
export default function TerminalCard({
  title,
  headerRight,
  children,
  style,
}: {
  title?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: 'var(--color-term-bg)',
        border: '1px solid var(--color-term-border)',
        borderRadius: 14,
        overflow: 'hidden',
        fontFamily: 'var(--mono)',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: 'var(--color-term-header)',
          borderBottom: '1px solid var(--color-term-border)',
        }}
      >
        <span style={{ display: 'inline-flex', gap: 7 }} aria-hidden="true">
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
        </span>
        {title ? (
          <span style={{ fontSize: 12.5, color: 'var(--color-term-dim)' }}>{title}</span>
        ) : null}
        {headerRight ? <span style={{ marginLeft: 'auto' }}>{headerRight}</span> : null}
      </div>
      <div style={{ padding: '16px 18px', color: 'var(--color-term-fg)', fontSize: 13.5, lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}
