import type { CSSProperties, ReactNode } from 'react';

export default function MonoNum({
  children,
  color,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="num"
      style={{ fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', color, ...style }}
    >
      {children}
    </span>
  );
}
