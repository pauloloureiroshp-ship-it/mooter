// HandoffStory — "Never wake up lost." The site already tells the routing/savings
// story (47%, 658 calls). This section carries the other half: the perfect handoff.
// The real cost of agentic coding isn't tokens — it's waking up to ten terminals
// and no idea where you left off. Mooter writes an honest summary after every
// session so you glance and know what to do.
//
// Tone: EN, honest, qualitative. NO fabricated metrics — the only number here is
// $0, which is the real cost of running the handoff on local hardware. The terminal
// block is explicitly illustrative, not a measured stat. Static server component.

import TerminalCard from '@/components/TerminalCard';

const pillars = [
  {
    icon: '🪵',
    title: 'Honest summaries',
    body:
      'After every session Mooter writes what actually happened — and what is still unlanded. It never says “clean” when there is work waiting to ship. No false green.',
  },
  {
    icon: '🧾',
    title: 'Auditable memory',
    body:
      'Every decision gets recorded — which tier, why, what it cost. The local GPU does the writing, so the record itself costs $0. Nothing is taken on trust.',
  },
  {
    icon: '⏎',
    title: 'The time back',
    body:
      'Glance and know what to do next. No re-reading diffs, no archaeology across terminals. You pick up exactly where you left off — that is the time you get back.',
  },
];

export default function HandoffStory() {
  return (
    <section style={{ padding: '40px 0 8px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--color-muted)', fontWeight: 500 }}>
        The handoff
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          Never wake up lost
        </h2>
        <a href="/methodology" style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: 15 }}>
          How it stays honest →
        </a>
      </div>

      <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.65, marginTop: 12, maxWidth: 640 }}>
        The real cost of agentic coding is not tokens — it is opening ten terminals and having no idea where you
        left off. Mooter closes every session with an honest handoff: what landed, what did not, and the one thing
        to do next. So you recover your time instead of drowning in context.
      </p>

      <div
        className="handoff-grid"
        style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 20, marginTop: 24, alignItems: 'start' }}
      >
        {/* Three pillars */}
        <div className="handoff-cards" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
          {pillars.map((p) => (
            <div
              key={p.title}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 14,
                padding: '18px 20px',
                background: 'var(--color-surface)',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 14,
                alignItems: 'start',
              }}
            >
              <span style={{ fontSize: 24, lineHeight: 1.2 }} aria-hidden>{p.icon}</span>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)', margin: '0 0 6px' }}>
                  {p.title}
                </h3>
                <p style={{ color: 'var(--color-muted)', fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
                  {p.body}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Illustrative honest-handoff summary */}
        <div>
          <TerminalCard title="moo handoff — end of session">
            <div style={{ color: 'var(--color-term-dim)' }}>$ session ended · feat/site-handoff-story</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ color: 'var(--color-green)' }}>✓</span> build green · diff shown
            </div>
            <div>
              <span style={{ color: 'var(--color-yellow)' }}>⚠</span> not landed — needs your OK to deploy
            </div>
            <div style={{ color: 'var(--color-term-dim)', marginTop: 6 }}>
              next → review diff · merge · deploy
            </div>
            <div style={{ marginTop: 10, color: 'var(--color-term-dim)', fontSize: 12 }}>
              written locally · $0 · recorded to memory
            </div>
          </TerminalCard>
          <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.5 }}>
            Illustrative — your summary reflects your real session, never a canned “all clean”.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.5 }}>
        <span aria-hidden="true">🐮</span>
        <span>Qualitative by design — the handoff&apos;s worth is the time you don&apos;t lose, not a number we could fake.</span>
      </div>

      <style>{`@media (max-width: 860px){ .handoff-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
