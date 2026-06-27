// Wave 4 (site v2) · #autonomy — the new Claude Code capabilities that make a
// vibe coder comfortable delegating MORE: loop & schedule, isolated worktrees +
// dynamic workflow, the 3rd-brain (Notion/Obsidian), and Moo Packs.
//
// Each card opens with the *pain* (italic, muted) and answers it with the
// feature, then a fleet-style "agent · outcome" footer (design-language §5).
//
// Conventions (matches the existing landing/): server component, inline styles
// on the canonical --color-* tokens, plain global classes (.band/.page/
// .section-head/.eyebrow/.lede). Motion is CSS-native scroll reveal via
// animation-timeline: view() — zero runtime, LCP-safe, and wrapped so
// reduced-motion / no-support renders the content fully visible (design-language
// §3). Honesty (the moat): the 160× figure is labelled "this run · author's
// machine"; outcome lines are illustrative capability examples, not live
// telemetry; no fabricated $-savings, and $0.00 stays muted (never green).

import type { ReactNode } from 'react';

type Agent = { emoji: string; outcome: string };
type FeatureCard = {
  icon: string;
  title: string;
  pain: string;
  body: ReactNode;
  agent: Agent;
};

const cards: FeatureCard[] = [
  {
    icon: '🔁',
    title: 'Loop & Schedule',
    pain: 'I forget to run the repetitive stuff.',
    body: (
      <>
        <strong style={{ color: 'var(--color-text)' }}>moo-loop</strong> runs safe,
        cheap iterations until the task is done; <strong style={{ color: 'var(--color-text)' }}>Schedule</strong>{' '}
        fires tasks each morning or on a cron — local and free wherever it can be.
      </>
    ),
    agent: { emoji: '🐮', outcome: 'moo-loop · 14 safe iterations · stopped clean · local, $0.00' },
  },
  {
    icon: '🌿',
    title: 'Worktrees & Dynamic Workflow',
    pain: 'My agents trip over each other.',
    body: (
      <>
        Each agent gets its own isolated <strong style={{ color: 'var(--color-text)' }}>worktree</strong>,
        so parallel runs never collide. The <strong style={{ color: 'var(--color-text)' }}>Workflow</strong>{' '}
        engine runs multi-agent flows locally — roughly{' '}
        <span style={{ fontFamily: 'var(--mono)', color: 'var(--color-text)', fontWeight: 600 }}>160×</span>{' '}
        cheaper than cloud dynamic workflows.
      </>
    ),
    agent: { emoji: '🌿', outcome: 'fleet · 4 agents · 6 worktrees · 0 collisions' },
  },
  {
    icon: '🧠',
    title: '3rd-brain · Notion · Obsidian',
    pain: 'It never remembers my decisions.',
    body: (
      <>
        Every prompt consults your vault before it runs. Your{' '}
        <strong style={{ color: 'var(--color-text)' }}>Notion</strong> and{' '}
        <strong style={{ color: 'var(--color-text)' }}>Obsidian</strong> become the agent&apos;s
        long-term memory — decisions persist, no copy-paste.
      </>
    ),
    agent: { emoji: '🧠', outcome: 'vault · recalls your past decisions before each run' },
  },
  {
    icon: '🧩',
    title: 'Packs — skills, models & MCPs',
    pain: 'I’m tired of hunting repos for solutions.',
    body: (
      <>
        Moo Packs bundle the models, skills, scaffolds and MCPs for a domain, each
        trust-scored. <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>Mooter resolves it</span>{' '}
        — you don&apos;t go shopping.
      </>
    ),
    agent: { emoji: '🧩', outcome: 'packs · data · diagram · voice installed' },
  },
];

export default function AutonomySection() {
  return (
    <section id="autonomy" className="band">
      <div className="page">
        <div className="section-head" style={{ marginBottom: 36 }}>
          <span className="eyebrow">Autonomy · so you stop babysitting</span>
          <h2>The vibe coder creates. Mooter does the rest.</h2>
          <p className="lede" style={{ marginTop: 16 }}>
            Every new Claude Code capability, wired so you stay comfortable — and so you
            keep using your other LLM subscriptions too.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <span className="moo-pill">
              <span className="dot" aria-hidden="true" /> Parallel by default
            </span>
            <span className="moo-tag" title="Measured on the author's machine, this run — not a community average.">
              160× cheaper · measured this run · author&apos;s machine
            </span>
          </div>
        </div>

        <div className="feat-grid">
          {cards.map((c) => (
            <article key={c.title} className="moo-card moo-reveal">
              <div className="moo-card-head">
                <span className="moo-icon" aria-hidden="true">{c.icon}</span>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text)', margin: 0, letterSpacing: '-0.01em' }}>
                  {c.title}
                </h3>
              </div>
              <p className="moo-pain">
                <em>&ldquo;{c.pain}&rdquo;</em>
              </p>
              <p className="moo-body">{c.body}</p>
              <div className="moo-agent">
                <span className="dot" aria-hidden="true" />
                <span aria-hidden="true">{c.agent.emoji}</span>
                <span className="nm">{c.agent.outcome}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <style>{`
        #autonomy .feat-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        #autonomy .moo-card {
          display: flex;
          flex-direction: column;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 14px;
          padding: 22px;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
        }
        #autonomy .moo-card:hover,
        #autonomy .moo-card:focus-within {
          border-color: var(--color-accent);
          background: var(--color-surface-2);
          transform: translateY(-3px);
          box-shadow: 0 18px 48px -30px var(--color-accent-25), inset 0 0 0 1px var(--color-accent-12);
        }
        #autonomy .moo-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        #autonomy .moo-icon { font-size: 24px; line-height: 1; }
        #autonomy .moo-pain { margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; color: var(--color-muted); }
        #autonomy .moo-pain em { font-style: italic; }
        #autonomy .moo-body { margin: 0; font-size: 14px; line-height: 1.6; color: var(--ink-2); }
        #autonomy .moo-agent {
          display: flex; align-items: center; gap: 8px;
          margin-top: auto; padding-top: 14px;
          border-top: 1px dashed var(--color-border);
          font-family: var(--mono); font-size: 11px; line-height: 1.4;
          color: var(--color-muted); letter-spacing: 0.01em;
        }
        #autonomy .moo-agent .nm { color: var(--ink-2); }
        #autonomy .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--color-green); flex-shrink: 0; }
        #autonomy .moo-pill {
          display: inline-flex; align-items: center; gap: 7px;
          font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em;
          color: var(--ink-2);
          border: 1px solid var(--color-border); background: var(--color-surface);
          border-radius: 999px; padding: 5px 12px;
        }
        #autonomy .moo-tag {
          display: inline-flex; align-items: center;
          font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.03em;
          color: var(--color-muted);
          border: 1px solid var(--color-border); border-radius: 6px; padding: 4px 9px;
        }

        /* CSS-native scroll reveal — zero runtime, LCP-safe. Only engages where
           supported AND the user hasn't asked for reduced motion; otherwise the
           cards render fully visible (no opacity:0 baseline leaks out). */
        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            #autonomy .moo-reveal {
              opacity: 0;
              animation: moo-rise-autonomy linear both;
              animation-timeline: view();
              animation-range: entry 4% cover 20%;
            }
          }
        }
        @keyframes moo-rise-autonomy {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1040px) { #autonomy .feat-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 600px)  { #autonomy .feat-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}
