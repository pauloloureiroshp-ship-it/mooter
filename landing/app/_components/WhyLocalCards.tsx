// Wave 10 · A.2 — "Why local models work" teaser on the homepage.
//
// The full explainer already lives at /under-the-hood (quantization bars, LoRA /
// DoRA diagram, quality-delta table). This is the 3-card teaser that answers a
// vibe coder's "wait, a local model is good enough?" in <30s and links through.
// Numbers mirror the canonical figures in /under-the-hood — no new claims.

const cards = [
  {
    icon: '🗜️',
    title: 'Quantization',
    body: 'Q4_K_M shrinks a 120 GB model to ~18 GB. Quality stays (~98%), speed goes up, and it runs free on the GPU you already own.',
  },
  {
    icon: '🧩',
    title: 'LoRA / DoRA',
    body: 'Adapter layers fine-tune the base model for your codebase — ~80 MB each, trained overnight on your machine. Free when local.',
  },
  {
    icon: '🎮',
    title: 'Hardware match',
    body: 'mooter probes your GPU/CPU and pulls only the models that fit your VRAM. No config, no guesswork — it just fits your machine.',
  },
];

export default function WhyLocalCards() {
  return (
    <section style={{ padding: '24px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>
          Why a local model is good enough
        </h2>
        <a href="/under-the-hood" style={{ color: 'var(--color-accent)', fontWeight: 600, fontSize: 15 }}>
          See the benchmarks →
        </a>
      </div>

      <div
        className="why-local-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 22 }}
      >
        {cards.map((c) => (
          <a
            key={c.title}
            href="/under-the-hood"
            style={{
              display: 'block',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: '22px 22px 20px',
              background: 'var(--color-surface, transparent)',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: 28 }} aria-hidden>{c.icon}</span>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text)', margin: '12px 0 8px' }}>
              {c.title}
            </h3>
            <p style={{ color: 'var(--color-muted)', fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
              {c.body}
            </p>
            <span style={{ display: 'inline-block', marginTop: 14, color: 'var(--color-accent)', fontWeight: 600, fontSize: 14 }}>
              Learn more →
            </span>
          </a>
        ))}
      </div>

      <style>{`@media (max-width: 860px){ .why-local-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
