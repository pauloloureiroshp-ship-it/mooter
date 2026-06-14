// Single source of truth for the author's real, measured routing numbers.
// 47% saved vs all-Opus across 658 routed calls on ONE machine (Paulo's) — not a
// community average. Consumed by the PulseStrip and the page metadata (layout.tsx)
// so the numbers can never drift between surfaces.
//
// NOTE: the hero prose in app/page.tsx intentionally keeps the literal
// "47% saved vs all-Opus …" sentence — it is pinned by
// app/_components/wave11-landing.test.ts as the canonical honest claim.

export const FACTS = {
  callsRouted: 658,
  moos: 7,
  savedAllTimeUsd: 25.95,
  avgSavingsPct: 47,
  packsInstalled: 3,
} as const;

// Canonical one-line proof, derived from FACTS — reused in SEO metadata.
export const PROOF_LINE = `${FACTS.avgSavingsPct}% saved vs all-Opus across ${FACTS.callsRouted} routed calls — real data from the author’s own machine, not a community average.`;
