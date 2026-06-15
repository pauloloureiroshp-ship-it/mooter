// cost.ts — cost computation for prod MooterEvents (Wave 2 Day 6).
//
// Prices a turn against the FROZEN pricing snapshot
// (data/pricing-snapshot-2026-05-27.json) — the same snapshot the wave1
// benchmark lib uses (scripts/wave1-benchmark/lib/pricing.ts).
//
// Contract difference vs the benchmark lib: the benchmark THROWS on an unknown
// model (reproducibility — a benchmark headline must never silently mis-price).
// A prod event hook must never throw — a missing price cannot be allowed to
// break the turn — so this module returns 0 for unknown/local models instead.
// Both honour the §13.3 invariant: cost is INTEGER microUSD (no float drift).

import type { Provider } from "./mooter_event.ts";
// Wave 61: pricing snapshot inlined at build time (esbuild/tsx) so the bundled CLI
// (~/.mooter/cli-v1/mooter.js) resolves it without a source-relative path — the
// previous import.meta.url + "../../../data" resolved to a non-existent path in the
// bundle (ENOENT). The data is now part of the bundle.
import pricingSnapshot from "../../../data/pricing-snapshot-2026-05-27.json";

interface SnapshotModel {
  input_per_mtok: number;
  output_per_mtok: number;
}
interface PricingSnapshot {
  snapshot_version: string;
  models: Record<string, SnapshotModel>;
  ollama_local_cost_usd: number;
  ollama_models: string[];
}

function loadSnapshot(): PricingSnapshot {
  return pricingSnapshot as unknown as PricingSnapshot;
}

/** The snapshot version string — written to the event's pricing_version. */
export function pricingSnapshotVersion(): string {
  return loadSnapshot().snapshot_version;
}

/** Strip a trailing `-YYYYMMDD` so dated API ids resolve to the snapshot key. */
function normalizeModel(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

/** True for any local Ollama model id (listed in snapshot, or carries a ':tag'). */
export function isLocalModel(model: string): boolean {
  const snap = loadSnapshot();
  if (snap.ollama_models.includes(model)) return true;
  // Ollama model ids carry a ':tag' (e.g. qwen3:30b) which API ids never do.
  return model.includes(":");
}

/**
 * Best-effort provider inference from a model id. Anthropic ids start with
 * "claude-"; Ollama ids are local. Anything else is unknown (null) — we never
 * guess openai/google/grok from an opaque id.
 */
export function providerForModel(model: string): Provider | null {
  if (isLocalModel(model)) return "ollama";
  if (/^claude-/.test(model)) return "anthropic";
  return null;
}

/**
 * Cost in INTEGER microUSD for a turn. Local models → 0. Unknown API models →
 * 0 (NO throw — a prod hook must never break the turn over a missing price).
 * Negative token counts are clamped to 0.
 */
export function computeCostMicros(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  if (isLocalModel(model)) return 0;
  const snap = loadSnapshot();
  const price = snap.models[normalizeModel(model)];
  if (!price) return 0; // unknown model — degrade gracefully, never throw
  const tin = Math.max(0, tokensIn);
  const tout = Math.max(0, tokensOut);
  const usd = (tin * price.input_per_mtok + tout * price.output_per_mtok) / 1e6;
  return Math.round(usd * 1e6);
}
