import type { CSSProperties, ReactNode } from 'react';

type Variant = 'primary' | 'secondary';
type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, CSSProperties> = {
  sm: { padding: '8px 14px', fontSize: 14 },
  md: { padding: '12px 20px', fontSize: 15 },
  lg: { padding: '15px 26px', fontSize: 16 },
};

export default function Btn({
  children,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  icon,
  style,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    fontWeight: 600,
    fontFamily: 'var(--font)',
    border: '1px solid transparent',
    transition: 'background 0.15s ease, border-color 0.15s ease, transform 0.05s ease',
    cursor: 'pointer',
    textDecoration: 'none',
    lineHeight: 1,
    ...SIZES[size],
    ...(variant === 'primary'
      ? { background: 'var(--color-accent)', color: '#1A0E0E' }
      : { background: 'transparent', color: 'var(--color-text)', borderColor: 'var(--color-border-light)' }),
    ...style,
  };
  const content = (
    <>
      {icon}
      {children}
    </>
  );
  if (href) {
    return (
      <a href={href} style={base} onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" style={base} onClick={onClick}>
      {content}
    </button>
  );
}
