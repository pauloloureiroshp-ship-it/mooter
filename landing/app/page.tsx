import NavBar from '@/components/NavBar';
import Footer from '@/components/Footer';
import { CrookOutline } from '@/components/PastorCrook';
import HeroTerminal from './_components/HeroTerminal';
import CommunityPulse from './_components/CommunityPulse';
import WhyLocalCards from './_components/WhyLocalCards';

const trust = ['Hook, not a proxy', 'Runs locally', '<50ms overhead'];

export default function Page() {
  return (
    <>
      <NavBar />
      <main>
        <section style={{ maxWidth: 1280, margin: '0 auto', padding: '0 40px' }}>
          <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 56, alignItems: 'center', padding: '72px 0 56px' }}>
            {/* Left */}
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '5px 12px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-green)' }} />
                Open source · MIT · Free forever
              </span>

              <h1 className="hero-h1" style={{ fontSize: 'clamp(56px, 13vw, 168px)', fontWeight: 700, lineHeight: 0.92, margin: '22px 0 0', display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
                Got
                <CrookOutline size={48} />
                Moo<span style={{ color: 'var(--color-accent)' }}>?</span>
              </h1>

              <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 600, marginTop: 18, color: 'var(--color-text)' }}>
                The AI shepherd for your Claude Code.
              </h2>

              <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.65, marginTop: 18, maxWidth: 540 }}>
                Your GPU, your subscriptions, your local models — you&apos;re already paying for a powerful AI stack.
                But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full
                environment and routes every prompt to the optimal model. Same results. Up to 90% less cost.
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
                <a href="/install" style={{ background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, fontSize: 16, padding: '14px 24px', borderRadius: 11 }}>
                  Install mooter →
                </a>
                <a href="/dashboard" style={{ border: '1px solid var(--color-border-light)', color: 'var(--color-text)', fontWeight: 600, fontSize: 16, padding: '14px 24px', borderRadius: 11 }}>
                  Sign in with GitHub
                </a>
              </div>

              <div style={{ display: 'flex', gap: 18, marginTop: 22, flexWrap: 'wrap' }}>
                {trust.map((t) => (
                  <span key={t} style={{ color: 'var(--color-muted)', fontSize: 13.5, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ color: 'var(--color-green)' }}>✓</span> {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — terminal (client island) */}
            <div style={{ minHeight: 360 }}>
              <HeroTerminal />
            </div>
          </div>

          <WhyLocalCards />

          <CommunityPulse />
        </section>
      </main>
      <Footer />
      <style>{`@media (max-width: 1024px){ .hero-grid{ grid-template-columns: 1fr !important; gap: 36px !important; } } @media (max-width: 640px){ section{ padding-left:20px !important; padding-right:20px !important; } } @media (max-width: 480px){ .hero-h1{ font-size: clamp(38px, 12vw, 56px) !important; flex-wrap: wrap !important; } }`}</style>
    </>
  );
}
