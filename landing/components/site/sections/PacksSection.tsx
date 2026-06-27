// Wave 4 (site v2) · #packs — the "stop hunting" strip. A pack is a domain
// bundle (the right local models for your VRAM + skills + scaffolds + MCPs, each
// trust-scored). Laid out Raycast-store style: a category rail on top, then a
// grid of pack cards (icon · one line of contents · trust meter).
//
// Conventions (matches the existing landing/): server component, inline styles on
// the canonical --color-* tokens, global .band/.page/.section-head/.eyebrow/.lede.
// Scroll reveal is CSS-native (animation-timeline: view()), guarded for
// reduced-motion / no-support so content is always present in the DOM (a11y + SEO).
//
// HONESTY: these are DEMO packs. The live /packs route currently renders
// "Loading…" (study §4) — until Wave 7 wires the real registry, the demo nature
// is labelled both inline (the category rail + cards) and in the closing note.
// Trust scores are shown as data under that demo banner, never as live numbers.

import Link from 'next/link';

const categories = ['Data', 'Docs & Diagram', 'Voice', 'Engineering', 'Productivity', 'Web'] as const;

type Pack = {
  icon: string;
  name: string;
  category: (typeof categories)[number];
  contents: string;
  trust: number;
};

// The three canonical demo packs (brief). data · diagram · voice — the same trio
// the homepage already reports as "installed", kept consistent here.
const packs: Pack[] = [
  { icon: '🗂️', name: 'data', category: 'Data', contents: 'duckdb · postgres skills · csv MCP', trust: 96 },
  { icon: '📊', name: 'diagram', category: 'Docs & Diagram', contents: 'mermaid · excalidraw scaffolds', trust: 98 },
  { icon: '🎙️', name: 'voice', category: 'Voice', contents: 'whisper · cartesia TTS · audio MCP', trust: 94 },
];

// Categories with a populated demo pack — used to "light up" the rail.
const populated = new Set<string>(packs.map((p) => p.category));

export default function PacksSection() {
  return (
    <section id="packs" className="band">
      <div className="page">
        <div className="section-head" style={{ marginBottom: 28 }}>
          <span className="eyebrow">Packs</span>
          <h2>Stop hunting. The pack already has it.</h2>
          <p className="lede" style={{ marginTop: 16 }}>
            A pack is a domain bundle — the right local models for your VRAM, skills,
            prompt scaffolds and MCP servers, each with a trust score. Install one
            command; the cockpit lights up.
          </p>
        </div>

        {/* Raycast-style category rail. Populated demo categories are highlighted;
            the rest read as "browse the registry" — not a promise of shipped packs. */}
        <div className="pack-rail" role="list" aria-label="Pack categories">
          {categories.map((cat) => (
            <span
              key={cat}
              role="listitem"
              className={populated.has(cat) ? 'pack-chip on' : 'pack-chip'}
            >
              {cat}
            </span>
          ))}
        </div>

        <div className="pack-grid">
          {packs.map((p) => (
            <Link key={p.name} href="/packs" className="pack-card moo-reveal">
              <div className="pack-card-head">
                <span className="pack-icon" aria-hidden="true">{p.icon}</span>
                <div className="pack-id">
                  <span className="pack-name">{p.name}</span>
                  <span className="pack-cat">{p.category}</span>
                </div>
                <span className="pack-demo" aria-label="Demo pack">demo</span>
              </div>
              <p className="pack-contents">{p.contents}</p>
              <div className="pack-trust" aria-label={`Trust score ${p.trust} of 100`}>
                <span className="pack-trust-k">trust</span>
                <span className="pack-trust-bar" aria-hidden="true">
                  <span style={{ width: `${p.trust}%` }} />
                </span>
                <span className="pack-trust-n">{p.trust}</span>
              </div>
            </Link>
          ))}

          {/* Community tail — leverages OSS without claiming shipped packs. */}
          <Link href="/packs" className="pack-card pack-more moo-reveal">
            <span className="pack-icon" aria-hidden="true">＋</span>
            <span className="pack-more-title">Plus more from the community</span>
            <span className="pack-more-sub">Browse the full pack registry →</span>
          </Link>
        </div>

        <p className="pack-honest">
          <span className="led" aria-hidden="true" />
          Demo packs shown. The <code>/packs</code> grid must render real packs in the
          browser — the live page currently shows &ldquo;Loading…&rdquo; (see study §4).
        </p>
      </div>

      <style>{`
        #packs .pack-rail {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-bottom: 22px;
        }
        #packs .pack-chip {
          font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.03em;
          color: var(--color-muted);
          border: 1px solid var(--color-border); background: var(--color-surface);
          border-radius: 999px; padding: 5px 12px;
        }
        #packs .pack-chip.on {
          color: var(--color-accent);
          border-color: var(--color-accent-25);
          background: var(--color-accent-08);
        }

        #packs .pack-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        #packs .pack-card {
          display: flex; flex-direction: column;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 14px;
          padding: 20px;
          text-decoration: none;
          transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease, background .18s ease;
        }
        #packs .pack-card:hover,
        #packs .pack-card:focus-visible {
          border-color: var(--color-accent);
          background: var(--color-surface-2);
          transform: translateY(-3px);
          box-shadow: 0 18px 48px -30px var(--color-accent-25), inset 0 0 0 1px var(--color-accent-12);
          outline: none;
        }
        #packs .pack-card-head { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
        #packs .pack-icon { font-size: 24px; line-height: 1; }
        #packs .pack-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        #packs .pack-name {
          font-family: var(--mono); font-size: 15px; font-weight: 700;
          color: var(--color-text); letter-spacing: -0.01em;
        }
        #packs .pack-cat {
          font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.04em;
          color: var(--color-muted); text-transform: uppercase;
        }
        #packs .pack-demo {
          margin-left: auto; align-self: flex-start;
          font-family: var(--mono); font-size: 9.5px; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--color-muted);
          border: 1px solid var(--color-border); border-radius: 5px; padding: 2px 6px;
        }
        #packs .pack-contents {
          margin: 0 0 16px; font-size: 13px; line-height: 1.55;
          color: var(--ink-2); font-family: var(--mono);
        }
        #packs .pack-trust {
          display: flex; align-items: center; gap: 8px; margin-top: auto;
          font-family: var(--mono); font-size: 11px; color: var(--color-muted);
        }
        #packs .pack-trust-k { letter-spacing: 0.06em; text-transform: uppercase; }
        #packs .pack-trust-bar {
          flex: 1; height: 5px; border-radius: 999px; overflow: hidden;
          background: var(--color-border);
        }
        #packs .pack-trust-bar > span {
          display: block; height: 100%; border-radius: 999px;
          background: var(--color-green);
        }
        #packs .pack-trust-n { color: var(--ink-2); font-variant-numeric: tabular-nums; }

        /* Community tail card — dashed, ghosted, no trust number. */
        #packs .pack-more {
          align-items: flex-start; justify-content: center; gap: 8px;
          border-style: dashed;
          background: transparent;
        }
        #packs .pack-more-title { font-size: 14px; font-weight: 600; color: var(--color-text); }
        #packs .pack-more-sub { font-size: 12.5px; color: var(--color-accent); font-weight: 600; }

        #packs .pack-honest {
          display: flex; align-items: flex-start; gap: 9px;
          margin-top: 20px;
          font-size: 12.5px; line-height: 1.55; color: var(--color-muted);
        }
        #packs .pack-honest code {
          font-family: var(--mono); font-size: 12px; color: var(--ink-2);
          background: var(--color-surface); border: 1px solid var(--color-border);
          border-radius: 5px; padding: 1px 6px;
        }
        #packs .pack-honest .led {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
          margin-top: 5px; background: var(--color-yellow);
        }

        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            #packs .moo-reveal {
              opacity: 0;
              animation: moo-rise-packs linear both;
              animation-timeline: view();
              animation-range: entry 4% cover 20%;
            }
          }
        }
        @keyframes moo-rise-packs {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 1040px) { #packs .pack-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 560px)  { #packs .pack-grid { grid-template-columns: 1fr; } }
      `}</style>
    </section>
  );
}
