// @mooter/council — public surface.
//
// Council is Mooter's THIRD routing axis: classify.js routes by complexity (tier),
// decideAgent routes by cost (TES), and the Council routes by *confidence* — "does
// one head suffice, or does this question deserve a deliberating council?".
//
// This package is ADDITIVE. It never modifies classify.js (sha CI-enforced) nor any
// frozen engine package. It READS the classifier output and REUSES existing primitives:
//   - validation/adversarial  → review() / vote()  (deliberation + aggregation)
//   - router                  → decideAgent        (per-seat model selection, TES)
//   - workflow                → parallel / converge (concurrency + convergence)
//
// Implemented incrementally across blocks A–D. This stub keeps the package buildable
// and its test harness green from day 0 (Bloco 0 scaffold).

/** Marker for the scaffolded-but-not-yet-implemented state. Replaced as blocks land. */
export const COUNCIL_SCAFFOLD = "council-scaffold-ready" as const;

// ---- Bloco A: Advisory Council ----
export * from "./types.ts";
export * from "./cas.ts";
export * from "./compose.ts";
export * from "./verdict.ts";
export * from "./deliberate.ts";
export * from "./chip.ts";
export * from "./cli.ts";
