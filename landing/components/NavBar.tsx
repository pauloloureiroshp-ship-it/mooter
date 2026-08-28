import Link from 'next/link';
import MooterMark from './MooterMark';

const LINKS = [
  { label: 'How', href: '/under-the-hood' },
  { label: 'Packs', href: '/packs' },
  { label: 'Rankings', href: '/rankings' },
  { label: 'Compare', href: '/compare' },
  { label: 'Commands', href: '/commands' },
  { label: 'Conductor', href: '/conductor' },
  { label: 'Workflow', href: '/workflow' },
  { label: 'Methodology', href: '/methodology' },
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

          {/* 2026-08-27 · até hoje não havia navegação nenhuma em telemóvel: as
              regras em baixo escondiam `.nav-links` a ≤1024 e `.nav-signin` a ≤640
              **sem pôr nada no lugar**. Medido a 375px, os únicos alvos visíveis eram
              o logo e o «Install in 30s» — as 8 entradas do menu simplesmente
              desapareciam, e com elas /packs, /compare, /rankings e /methodology.

              É `<details>` e não `useState` de propósito: o cabeçalho deste ficheiro
              diz «SSR-safe, no client state» e continua verdade. O elemento nativo
              abre e fecha sem uma linha de JavaScript, já é focusável, já responde a
              Enter e Espaço, e já expõe o estado aberto/fechado à árvore de
              acessibilidade. Um botão com `aria-expanded` feito à mão precisaria de
              client component, hidratação e handler de teclado para chegar ao mesmo
              sítio. */}
          <details className="nav-menu">
            <summary aria-label="Menu" className="nav-menu-btn">
              <span aria-hidden="true">≡</span>
            </summary>
            <div className="nav-menu-panel">
              {LINKS.map((l) => (
                <a key={l.href} href={l.href}>{l.label}</a>
              ))}
              {/* Reposto aqui porque a regra dos 640 o esconde da barra: escondido
                  na barra E ausente do menu, o sign-in ficava inalcançável no
                  telemóvel. */}
              <a href="/dashboard">Sign in with GitHub</a>
            </div>
          </details>
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
        .nav-menu { display: none; position: static; }
        .nav-menu-btn {
          list-style: none; cursor: pointer; font-size: 22px; line-height: 1;
          padding: 4px 10px; border-radius: 8px; color: var(--color-text);
          border: 1px solid var(--color-border);
        }
        .nav-menu-btn::-webkit-details-marker { display: none; }
        .nav-menu[open] .nav-menu-btn { background: var(--color-border); }
        .nav-menu-panel {
          position: absolute; top: 100%; left: 0; right: 0;
          display: flex; flex-direction: column; gap: 2px;
          padding: 8px 20px 16px;
          background: rgba(11,10,9,0.97);
          backdrop-filter: saturate(140%) blur(8px);
          border-bottom: 1px solid var(--color-border);
        }
        .nav-menu-panel a {
          color: var(--color-text); font-size: 15.5; font-weight: 500;
          padding: 11px 4px; border-bottom: 1px solid var(--color-border);
        }
        .nav-menu-panel a:last-child { border-bottom: 0; }
        @media (max-width: 1024px) { .nav-links { display: none !important; } .nav-menu { display: block; } }
        @media (max-width: 640px)  { .nav-signin { display: none !important; } .nav-inner { padding: 12px 20px !important; } }
      `}</style>
    </header>
  );
}
