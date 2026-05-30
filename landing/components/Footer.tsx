import MooterMark from './MooterMark';
import { CrookOutline } from './PastorCrook';

// Footer — 3-tier (IMPLEMENTATION_SPEC §7.4). "Got Moo?" at 96pt — deliberately
// smaller than the hero's 168pt so the hierarchy is preserved.

const COLUMNS: { title: string; links: { label: string; href: string; ext?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Install', href: '/install' },
      { label: 'Pack browser', href: '/packs' },
      { label: 'Compare', href: '/compare' },
      { label: 'Methodology', href: '/methodology' },
      { label: 'Under the hood', href: '/under-the-hood' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Methodology', href: '/methodology' },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Benchmark', href: '/methodology' },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub ↗', href: 'https://github.com/pauloloureiroshp-ship-it/mooter', ext: true },
      { label: 'Contribute', href: 'https://github.com/pauloloureiroshp-ship-it/mooter', ext: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'License', href: 'https://github.com/pauloloureiroshp-ship-it/mooter/blob/main/LICENSE', ext: true },
      { label: 'Security', href: '/privacy' },
    ],
  },
];

export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--color-border)', marginTop: 80 }}>
      {/* Tier 1 — sign-off */}
      <div style={{ background: 'var(--color-bg-2)', padding: '72px 24px', textAlign: 'center' }}>
        <div
          style={{
            fontSize: 'clamp(56px, 10vw, 96px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          Got
          <CrookOutline size={42} />
          Moo<span style={{ color: 'var(--color-accent)' }}>?</span>
        </div>
        <p style={{ color: 'var(--color-muted)', marginTop: 18, fontSize: 17 }}>
          Stop overpaying for AI. Start shepherding your stack.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
          <a href="/install" style={{ background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, padding: '13px 22px', borderRadius: 10 }}>
            Install mooter →
          </a>
          <a href="/auth/sign-in" style={{ border: '1px solid var(--color-border-light)', color: 'var(--color-text)', fontWeight: 600, padding: '13px 22px', borderRadius: 10 }}>
            Sign in with GitHub
          </a>
        </div>
      </div>

      {/* Tier 2 — link columns */}
      <div
        className="footer-cols"
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '56px 40px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 32,
        }}
      >
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{col.title}</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {col.links.map((l) => (
                <li key={l.label + l.href}>
                  <a
                    href={l.href}
                    {...(l.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    style={{ color: 'var(--color-muted)', fontSize: 14 }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Tier 3 — bottom bar */}
      <div style={{ borderTop: '1px solid var(--color-border)' }}>
        <div
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '22px 40px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            fontSize: 13,
            color: 'var(--color-muted)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <MooterMark size={20} /> © 2026 mooter.ai · MIT License · Open source
          </span>
          <span style={{ marginLeft: 'auto' }}>Made with ❤️ for vibe coders by Paulo Loureiro &amp; contributors</span>
        </div>
      </div>
      <style>{`@media (max-width: 768px){ .footer-cols{ grid-template-columns: repeat(2,1fr) !important; padding:40px 20px !important; } }`}</style>
    </footer>
  );
}
