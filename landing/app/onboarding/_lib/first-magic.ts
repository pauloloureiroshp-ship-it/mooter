// Wave W3 (First-Magic) — the "see it route, $0" demo data + helpers. Pure and
// framework-free so it unit-tests in landing's node-env vitest (mirrors persona.ts).
//
// The example verdicts below are REAL output of the FROZEN deterministic classifier
// (tools/router/classify.js, sha256 427d8c0b…), captured on 2026-07-10 by running
// `node tools/router/classify.js "<prompt>"`. Honest-copy doctrine: we show what the
// router actually decides — never invented tiers, never a fabricated $ figure.

export type Tier = 0 | 1 | 2 | 3;

export interface RoutingExample {
  /** A task a non-dev recognises. */
  prompt: string;
  /** Real classifier tier: 0 = local Ollama … 3 = Opus. */
  tier: Tier;
  /** Real classifier task_category (verbatim). */
  category: string;
  /** Real classifier confidence, 0–1. */
  confidence: number;
}

/**
 * Curated real verdicts. Three land on the local tier ($0) so the "magic moment"
 * is honest and immediate; the rest show that cloud is used only when it earns it.
 * Every {tier, category, confidence} here is the verbatim classify.js output for
 * its exact prompt string — re-run the CLI to re-verify.
 */
export const FIRST_MAGIC_EXAMPLES: readonly RoutingExample[] = [
  { prompt: 'Change the login button colour to blue', tier: 0, category: 'mechanical_trivial', confidence: 0.9 },
  { prompt: 'Explain this error: TypeError x is not a function', tier: 0, category: 'simple_transform_or_explain', confidence: 0.85 },
  { prompt: 'Summarise this file', tier: 0, category: 'simple_transform_or_explain', confidence: 0.85 },
  { prompt: 'Write a commit message for these changes', tier: 1, category: 'cheap_task', confidence: 0.9 },
  { prompt: 'Why does the websocket reconnect fail sometimes?', tier: 2, category: 'reasoning_intermediate', confidence: 0.7 },
  { prompt: 'Redesign the vault for multi-user', tier: 3, category: 'architecture_or_critical', confidence: 0.75 },
] as const;

export interface TierMeta {
  /** Ladder label, e.g. "T0". */
  label: string;
  /** Honest model/where it runs. */
  model: string;
  /** Cost shown to the user — "$0" only for the local tier. */
  cost: string;
  /** True when the tier runs locally (no cloud spend). */
  local: boolean;
}

/**
 * Honest per-tier presentation. Costs are qualitative for cloud tiers (no fabricated
 * numbers); only the local tier claims "$0", which is literally true. Mirrors the
 * tier ladder in CLAUDE.md (T0 local · T1 Haiku · T2 Sonnet · T3 Opus).
 */
export function tierMeta(tier: Tier): TierMeta {
  switch (tier) {
    case 0: return { label: 'T0', model: 'Local · qwen3:30b', cost: '$0', local: true };
    case 1: return { label: 'T1', model: 'Haiku', cost: 'cloud · cheapest', local: false };
    case 2: return { label: 'T2', model: 'Sonnet', cost: 'cloud · mid', local: false };
    case 3: return { label: 'T3', model: 'Opus', cost: 'cloud · top tier', local: false };
  }
}

const CATEGORY_WHY: Readonly<Record<string, string>> = {
  mechanical_trivial: 'a one-file, few-line change — no cloud needed',
  trivial_local: 'a small local edit — no cloud needed',
  simple_transform_or_explain: 'summarise / explain — a local model nails this',
  cheap_task: 'short and well-scoped — the cheapest cloud tier is enough',
  reasoning_intermediate: 'needs real reasoning — the mid cloud tier',
  architecture_or_critical: 'high blast-radius design — the top tier earns its cost',
};

/** A one-line, honest "why it routed there" for an example (never fabricated). */
export function whyRouted(ex: RoutingExample): string {
  return CATEGORY_WHY[ex.category] ?? 'routed by the deterministic classifier';
}

/** Convenience: does this example run for free on the user's machine? */
export function isLocal(ex: RoutingExample): boolean {
  return tierMeta(ex.tier).local;
}
