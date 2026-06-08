import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog | Mooter',
  description: 'What shipped, wave by wave.',
};

// Wave 33.5 Block G.1 — changelog (scaffold; CC Design will redesign).
const ENTRIES: { version: string; date: string; headline: string; items: string[] }[] = [
  {
    version: 'v1.21.1 — Historic',
    date: '2026-06-08',
    headline: 'Spawn agents default + orchestration + security framework',
    items: [
      'Spawn agents local-first by default, isolated in a 4-layer bubblewrap sandbox (no --no-sandbox).',
      'Cross-session intelligence: mooter sessions watch/quota/handoff across all projects.',
      'Worktree Conductor: atomic locks + heartbeats serialize git push/tag/deploy across terminals.',
      'Security framework: mooter security audit + spawn-test (real CVE-2025-59528 escape test).',
      'Intent-based UX: mooter intent "<phrase>" resolves to a command, shown before it runs.',
      'mooter doctor health check; 16 MCP tools; classify.js doctrine sha intact.',
    ],
  },
  {
    version: 'v1.21.0',
    date: '2026-06-08',
    headline: 'Polish + TurboQuant + EAGLE-3 + MiniMax + Arbitrage',
    items: ['Opt-in performance backends; statusline polish; mooter sessions list; mooter pricing-update.'],
  },
];

export default function ChangelogPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 prose">
      <h1>Changelog</h1>
      {ENTRIES.map((e) => (
        <section key={e.version}>
          <h2>
            {e.version} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {e.date}</span>
          </h2>
          <p>
            <strong>{e.headline}</strong>
          </p>
          <ul>
            {e.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
