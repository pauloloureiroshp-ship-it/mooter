// pricing.ts — cost computation from the FROZEN pricing snapshot (§17.2).
//
// Reproducibility contract: cost is priced against data/pricing-snapshot-2026-05-27.json,
// NOT the live tools/router/pricing.js. The snapshot was verified against
// platform.claude.com on 2026-05-27 and reconciled with pricing.js (P7). Local
// (Ollama) models cost $0. Returns INTEGER microUSD (§13.3) to avoid float drift.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

interface SnapshotModel {
  input_per_mtok: number;
  output_per_mtok: number;
}
interface PricingSnapshot {
  snapshot_version: string;
  models: Record<string, SnapshotModel>;
  ollama_local_cost_usd: number;
  ollama_models: string[];
  pricing_js_sha256: string;
}

// scripts/wave1-benchmark/lib/pricing.ts -> <repo>/data/pricing-snapshot-2026-05-27.json
const SNAPSHOT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "..",
  "data",
  "pricing-snapshot-2026-05-27.json",
);

let _snapshot: PricingSnapshot | null = null;
export function loadSnapshot(): PricingSnapshot {
  if (_snapshot) return _snapshot;
  _snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as PricingSnapshot;
  return _snapshot;
}

export function pricingVersion(): string {
  return loadSnapshot().snapshot_version;
}

/** Strip a trailing `-YYYYMMDD` so dated API ids resolve to the snapshot key. */
function normalizeModel(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

/** True for any local Ollama model id (contains ':' tag, or listed in snapshot). */
export function isLocalModel(model: string): boolean {
  const snap = loadSnapshot();
  if (snap.ollama_models.includes(model)) return true;
  // Ollama model ids carry a ':tag' (e.g. qwen3:30b) which API ids never do.
  return model.includes(":");
}

/**
 * Cost in integer microUSD for a turn. Local models → 0. Unknown API models
 * throw — we never silently mis-price (the benchmark's headline depends on it).
 */
export function costMicros(model: string, tokensIn: number, tokensOut: number): number {
  if (isLocalModel(model)) return 0;
  const snap = loadSnapshot();
  const key = normalizeModel(model);
  const price = snap.models[key];
  if (!price) {
    throw new Error(
      `pricing: no snapshot price for model "${model}" (normalized "${key}"). ` +
        `Add it to pricing-snapshot-2026-05-27.json — refusing to guess.`,
    );
  }
  const usd =
    (tokensIn * price.input_per_mtok + tokensOut * price.output_per_mtok) / 1e6;
  return Math.round(usd * 1e6);
}

export function microsToUsd(micros: number): number {
  return micros / 1e6;
}
