import Link from 'next/link';
import MooterMark from './MooterMark';

const LINKS = [
  { label: 'How', href: '/under-the-hood' },
  { label: 'Packs', href: '/packs' },
  { label: 'Compare', href: '/compare' },
  { label: 'Methodology', href: '/methodology' },
  { label: 'Privacy', href: '/privacy' },
];

// NavBar — sticky top nav (IMPLEMENTATION_SPEC §5.1). SSR-safe, no client state.
export default function NavBar() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(11,10,9,0.82)',
        backdropFilter: 'saturate(140%) blur(8px)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <nav
        className="nav-inner"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '12px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}
      >
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontWeight: 700, fontSize: 17 }}>
          <MooterMark size={26} />
          <span>mooter</span>
        </Link>
        <div className="nav-links" style={{ display: 'flex', gap: 22, marginLeft: 14 }}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} style={{ color: 'var(--color-muted)', fontSize: 14.5, fontWeight: 500 }}>
              {l.label}
            </a>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <a className="nav-signin" href="/dashboard" style={{ color: 'var(--color-text)', fontSize: 14.5, fontWeight: 500 }}>
            Sign in with GitHub
          </a>
          <a
            href="/install"
            style={{
              background: 'var(--color-accent)',
              color: '#1A0E0E',
              fontWeight: 600,
              fontSize: 14.5,
              padding: '9px 16px',
              borderRadius: 10,
            }}
          >
            Install in 30s →
          </a>
        </div>
      </nav>
      <style>{`
        @media (max-width: 1024px) { .nav-links { display: none !important; } }
        @media (max-width: 640px)  { .nav-signin { display: none !important; } .nav-inner { padding: 12px 20px !important; } }
      `}</style>
    </header>
  );
}
