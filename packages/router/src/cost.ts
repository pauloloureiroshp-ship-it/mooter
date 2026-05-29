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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Provider } from "./mooter_event.ts";

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

// packages/router/src/cost.ts -> <repo>/data/pricing-snapshot-2026-05-27.json
const SNAPSHOT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "data",
  "pricing-snapshot-2026-05-27.json",
);

let _snapshot: PricingSnapshot | null = null;
function loadSnapshot(): PricingSnapshot {
  if (_snapshot) return _snapshot;
  _snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as PricingSnapshot;
  return _snapshot;
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
