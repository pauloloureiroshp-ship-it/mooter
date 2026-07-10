// canonical-metrics.ts — THE single source of the author's real routing proof.
//
// Everything the landing shows about "47% / 658 / $22.95 / $48.90 / $25.95" derives from the three
// PRIMITIVES below. Change a primitive here and every surface (hero, PulseStrip, CockpitShowcase,
// TwoTerminalDemo, SEO/OG in layout) updates consistently — no more duplicated literals drifting apart.
//
// This is the concrete target of the Live Edit "data-hop": click the savings box in the preview and
// the agent lands HERE — the one place the numbers are defined — instead of guessing among copies.
//
// HONESTY (kept from the surfaces this replaces):
//  - These are the AUTHOR'S OWN measured numbers (one machine, real sessions), NOT a community average.
//    The live community source is lib/hub.ts (`/aggregate-stats`); this is the personal proof.
//  - "saved" = naive all-Opus baseline − real mooter spend. `$25.95` is what was PAID — it must NEVER
//    carry a "saved" label. `savedUsd`/`savedPct` are DERIVED so a paid/saved mix-up cannot recur.

export const AUTHOR_PROOF = {
  /** Calls the router actually handled across the author's own moos. */
  routedCalls: 658,
  /** Naive baseline: every one of those calls billed at Opus. */
  allOpusBaselineUsd: 48.9,
  /** What mooter actually cost (local-first routing did the rest). */
  mooterPaidUsd: 25.95,
} as const;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Amount saved = baseline − paid. Derived, so it can never contradict the primitives. */
export const savedUsd: number = round2(AUTHOR_PROOF.allOpusBaselineUsd - AUTHOR_PROOF.mooterPaidUsd); // 22.95
/** Percentage saved vs the all-Opus baseline. Derived. */
export const savedPct: number = Math.round((savedUsd / AUTHOR_PROOF.allOpusBaselineUsd) * 100); // 47

const usd = (n: number): string => "$" + n.toFixed(2);

/**
 * Pre-formatted labels — import these so every surface renders the IDENTICAL string it did when the
 * numbers were hardcoded. (`baselineUsd` → "$48.90", `savedPct` → "47%", etc.)
 */
export const M = {
  routedCalls: String(AUTHOR_PROOF.routedCalls), // "658"
  baselineUsd: usd(AUTHOR_PROOF.allOpusBaselineUsd), // "$48.90"
  paidUsd: usd(AUTHOR_PROOF.mooterPaidUsd), // "$25.95"
  savedUsd: usd(savedUsd), // "$22.95"
  savedPct: savedPct + "%", // "47%"
} as const;
