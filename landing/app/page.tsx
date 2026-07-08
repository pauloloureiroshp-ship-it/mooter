import NavBar from '@/components/NavBar';
import versionInfo from './version.json';
import Footer from '@/components/Footer';
import { CrookOutline } from '@/components/PastorCrook';
import Dotgrid from '@/components/Dotgrid';
import Eyebrow from '@/components/Eyebrow';
import HeroTerminal from './_components/HeroTerminal';
import TwoTerminalDemo from './_components/TwoTerminalDemo';
import PulseStrip from './_components/PulseStrip';
import CommunityPulse from './_components/CommunityPulse';
import WhyLocalCards from './_components/WhyLocalCards';
import HandoffStory from './_components/HandoffStory';
import AuthErrorBanner from './_components/AuthErrorBanner';
import { M } from './lib/canonical-metrics';

const trust = ['Hook, not a proxy', 'Runs locally', '<50ms overhead'];

// Inline above-the-fold pulse strip — author's real machine numbers (not a community average).
const heroStats: [string, string, string][] = [
  ['calls routed', M.routedCalls, 'across the author’s moos'],
  // "saved" = naive all-Opus − real mooter spend, DERIVED in canonical-metrics.ts (so the amount PAID,
  // $25.95, is never shown under a "saved" label). Single source → the hero, PulseStrip, cockpit + SEO agree.
  ['saved vs Opus', M.savedUsd, `vs ${M.baselineUsd} all-Opus`],
  ['avg savings', M.savedPct, 'vs all-Opus'],
  ['packs installed', '3', 'data · diagram · voice'],
];

export default function Page() {
  return (
    <>
      <NavBar />
      <main>
        <section className="m-pad" style={{ position: 'relative', maxWidth: 1280, margin: '0 auto', padding: '0 40px' }}>
          <Dotgrid style={{ top: -24, height: 720, bottom: 'auto', maskImage: 'linear-gradient(to bottom, #000 55%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent)' }} />
          <AuthErrorBanner />
          <div className="hero-grid" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 56, alignItems: 'center', padding: '72px 0 40px' }}>
            {/* Left */}
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--color-muted)', border: '1px solid var(--color-border)', borderRadius: 999, padding: '5px 12px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-green)' }} />
                Open source · MIT · v{versionInfo.version} · classify.js unchanged 19 waves
              </span>

              <h1 className="hero-h1" style={{ fontSize: 'clamp(56px, 13vw, 168px)', fontWeight: 700, lineHeight: 0.92, margin: '22px 0 0', display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
                Got
                <CrookOutline size={48} />
                Moo<span style={{ color: 'var(--color-accent)' }}>?</span>
              </h1>

              <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 600, marginTop: 18, color: 'var(--color-text)' }}>
                The router for Claude Code. Local-first. Learns forever.
              </h2>
              <p style={{ fontSize: 15, fontWeight: 500, marginTop: 6, color: 'var(--color-muted)' }}>
                Spawns agents safely by default.
              </p>

              <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.65, marginTop: 18, maxWidth: 540 }}>
                Your GPU, your subscriptions, your local models — you&apos;re already paying for a powerful AI stack.
                But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full
                environment and routes every prompt to the optimal model. Comparable quality on routine tasks, a fraction of the spend —{' '}
                <strong style={{ color: 'var(--color-text)' }}>{M.savedPct} saved vs all-Opus across the author&apos;s own {M.routedCalls} routed calls</strong>. Real data, not a community average.{' '}
                <a href="/methodology" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  See the benchmark *
                </a>
              </p>

              {/* D6 — condensed persona+$ subline (rubric C5) */}
              <p style={{ color: 'var(--color-text)', fontSize: 15, lineHeight: 1.6, marginTop: 14, maxWidth: 560, fontWeight: 500 }}>
                For a vibe coder on a Max plan: renames, commits &amp; explains run <strong>local (free)</strong>;
                debugging &amp; refactors go <strong>cloud</strong> — typically ~30% less on a mixed day, more when
                local does the heavy lifting.{' '}
                <a href="/methodology" style={{ color: 'var(--color-accent)' }}>Estimate yours →</a>
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
                <a href="/install" style={{ background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, fontSize: 16, padding: '14px 24px', borderRadius: 11 }}>
                  Install in 30s →
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

          {/* Inline community-pulse strip — author's real machine numbers (gap #4). */}
          <div
            className="m-2col"
            style={{
              position: 'relative',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              borderRadius: 14,
              padding: '20px 28px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 24,
            }}
          >
            {heroStats.map(([label, num, sub]) => (
              <div key={label}>
                <Eyebrow>{label}</Eyebrow>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 30, fontVariantNumeric: 'tabular-nums', fontWeight: 600, letterSpacing: '-0.02em', marginTop: 4 }}>{num}</div>
                <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', marginTop: 14, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true">🐮</span>
            <span>From the author&apos;s machine — 1 dev (Paulo). Real numbers, not a community average. Opted-in herd telemetry goes live soon.</span>
          </div>

          {/* Live two-terminal savings demo (client island) — below the hero (gap #1). */}
          <TwoTerminalDemo />

          {/* How it works — the longer explanation lives below the fold, out of the hero (gap #6). */}
          <section style={{ padding: '4px 0 8px', maxWidth: 720 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-muted)', fontWeight: 500 }}>How it works</div>
            <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.65, marginTop: 10 }}>
              Your GPU, your subscriptions, your local models — you&apos;re already paying for a powerful AI stack.
              But Claude Code defaults to Opus for everything, even renaming a variable. Mooter maps your full
              environment and routes every prompt to the optimal model: comparable quality on routine tasks, a
              fraction of the spend.
            </p>
            <p style={{ color: 'var(--color-text)', fontSize: 15, lineHeight: 1.6, marginTop: 14, fontWeight: 500 }}>
              For a vibe coder on a Max plan: renames, commits &amp; explains run <strong>local (free)</strong>;
              debugging &amp; refactors go <strong>cloud</strong> — typically ~30% less on a mixed day, more when
              local does the heavy lifting.{' '}
              <a href="/methodology" style={{ color: 'var(--color-accent)' }}>Estimate yours →</a>
            </p>
          </section>

          <PulseStrip />

          <WhyLocalCards />

          <HandoffStory />

          <CommunityPulse />
        </section>
      </main>
      <Footer />
      <style>{`@media (max-width: 1024px){ .hero-grid{ grid-template-columns: 1fr !important; gap: 36px !important; } } @media (max-width: 640px){ section{ padding-left:20px !important; padding-right:20px !important; } } @media (max-width: 480px){ .hero-h1{ font-size: clamp(38px, 12vw, 56px) !important; flex-wrap: wrap !important; } }`}</style>
    </>
  );
}
