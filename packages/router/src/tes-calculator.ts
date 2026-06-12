// tes-calculator.ts — Token Efficiency Score (TES), Wave 58 matrix engine.
//
// TES answers one question per (model, category) cell of the Wave 58 matrix:
// "how much benchmark quality do I get per dollar of tokens?". A higher TES is
// strictly better — more measured capability for the same spend.
//
//   TES = (benchmark_score * 100) / (cost_per_1k_in + 0.3 * cost_per_1k_out)
//
// The 0.3 output weight models a roughly 30%-output / 70%-input turn mix (a
// typical coding/agentic turn reads far more context than it writes). It is a
// fixed convention of this score, NOT a per-turn measurement — see the SPEC at
// docs/strategy/TOKEN_EFFICIENCY_SCORE_SPEC.md for the full rationale.
//
// ── NO-FABRICATION (Doctrine V4 #5) ─────────────────────────────────────────
// This module NEVER invents a number. A TES is only emitted when BOTH inputs
// are real and citable:
//   - benchmark_score: a real, caller-supplied score in [0, 1] (e.g. a SWE-bench
//     pass rate or an arena win-rate the caller cites). null/unknown ⇒ pending.
//   - price: a real per-MTok price present in the frozen snapshot. Models whose
//     snapshot entry carries pricing_status="pending" (input/output = null) ⇒
//     pending. computeCostMicros() flattens these to 0, which would look like a
//     FREE model if we trusted it blindly — so we read the snapshot directly to
//     tell "pending price" (unknown) apart from "genuinely $0 local" (free).
// When either input is missing we return { tes: null, status: 'pending', ... }.
// We NEVER divide by an epsilon to manufacture a large-but-fake number.
//
// ── FREE local models ───────────────────────────────────────────────────────
// Local Ollama models cost $0 (electricity not accounted, per the snapshot).
// Dividing by 0 is undefined, so for free models we apply a documented COST
// FLOOR (FREE_COST_FLOOR_PER_1K, in USD) standing in for the marginal local
// cost. The result is labelled status='free' so a consumer can render it
// distinctly (e.g. "∞ value, floored") and never confuse it with a priced TES.
//
// Pure module: no IO beyond the snapshot read that cost.ts already performs, no
// network, never throws. Mirrors cost.ts conventions (integer microUSD probe,
// graceful degradation on unknown models).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeCostMicros, isLocalModel } from "./cost.ts";

// --- conventions (documented; change here + in the SPEC together) -----------

/** Output-token weight in the denominator. 0.3 ≈ a 30%-out / 70%-in turn mix. */
export const OUTPUT_WEIGHT = 0.3 as const;

/** Marginal cost-per-1k (USD) attributed to FREE local models so TES is finite.
 *  NOT a real price — a labelled floor. Chosen ≈ the cheapest cloud input rate
 *  ($1/MTok Haiku ⇒ $0.001/1k) so a free model's TES is comparable-in-scale to,
 *  and never absurdly larger than, the cheapest paid option. status='free'
 *  always travels with the number so it is never mistaken for a priced TES. */
export const FREE_COST_FLOOR_PER_1K = 0.001 as const;

/** Probe size used to derive a per-1k rate through computeCostMicros(). */
const PROBE_TOKENS = 1000;
const MICRO_PER_USD = 1e6;

// --- snapshot pricing-status probe (honesty: pending vs free vs priced) ------
//
// cost.ts owns pricing for events and intentionally returns 0 for BOTH pending
// and local models. TES must distinguish them, so we read the same frozen
// snapshot directly — only to read pricing_status / null prices, never to
// re-implement cost math (that stays in computeCostMicros).

interface SnapshotModel {
  input_per_mtok: number | null;
  output_per_mtok: number | null;
  pricing_status?: string;
}
interface PricingSnapshot {
  models: Record<string, SnapshotModel>;
}

// packages/router/src/tes-calculator.ts -> <repo>/data/pricing-snapshot-2026-05-27.json
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

/** Same trailing-date strip as cost.ts, so dated API ids resolve to a key. */
function normalizeModel(model: string): string {
  return model.replace(/-\d{8}$/, "");
}

export type PriceStatus = "priced" | "pending" | "free" | "unknown";

/**
 * Classify a model's price availability WITHOUT fabricating anything:
 *   - "free"    → local Ollama model (cost.ts isLocalModel) — $0 by convention.
 *   - "pending" → snapshot entry exists but price is null / pricing_status
 *                 "pending" (Wave 58 seeded models awaiting a real price).
 *   - "priced"  → snapshot entry has real, non-null input & output rates.
 *   - "unknown" → model id is not in the snapshot at all (and not local).
 */
export function priceStatusForModel(model: string): PriceStatus {
  if (isLocalModel(model)) return "free";
  const m = loadSnapshot().models[normalizeModel(model)];
  if (!m) return "unknown";
  if (m.pricing_status === "pending" || m.input_per_mtok == null || m.output_per_mtok == null) {
    return "pending";
  }
  return "priced";
}

/** Per-1k input/output cost in USD, derived via computeCostMicros() (1k probe).
 *  Only meaningful for a "priced" model; callers must gate on priceStatusForModel. */
function costPer1kUsd(model: string): { in: number; out: number } {
  const inMicros = computeCostMicros(model, PROBE_TOKENS, 0);
  const outMicros = computeCostMicros(model, 0, PROBE_TOKENS);
  return { in: inMicros / MICRO_PER_USD, out: outMicros / MICRO_PER_USD };
}

// --- public result type ------------------------------------------------------

export type TESStatus = "ok" | "free" | "pending";

export interface TESInput {
  /** Snapshot/API model id, e.g. "claude-opus-4-7" or "qwen3:30b". */
  model: string;
  /** One of the 24 Wave 58 categories, e.g. "coding.backend". Pass-through
   *  label only — TES math does not depend on it (the caller is responsible
   *  for supplying a benchmark_score measured ON that category). */
  category: string;
  /** Real, citable benchmark score in [0, 1] for (model, category), or
   *  null/undefined when no measured score exists yet (⇒ pending). */
  benchmark_score: number | null | undefined;
}

export interface TESResult {
  model: string;
  category: string;
  /** The computed score, or null when status !== 'ok'/'free' is incomputable.
   *  'free' yields a floored, clearly-labelled number; 'pending' yields null. */
  tes: number | null;
  status: TESStatus;
  /** The benchmark_score echoed back (null when not supplied). */
  benchmark_score: number | null;
  /** Per-1k USD rates used (null components when not priced/free-floor). */
  cost_per_1k_in: number | null;
  cost_per_1k_out: number | null;
  /** Underlying price classification, for transparency/rendering. */
  price_status: PriceStatus;
  /** Human-readable explanation — always populated. */
  reason: string;
}

/** Clamp a benchmark score to [0,1] only when it is a finite number. */
function isValidScore(s: number | null | undefined): s is number {
  return typeof s === "number" && Number.isFinite(s) && s >= 0 && s <= 1;
}

/** Core TES formula on already-validated per-1k rates. Returns a finite number. */
function tesFormula(benchmark_score: number, per1kIn: number, per1kOut: number): number {
  const denom = per1kIn + OUTPUT_WEIGHT * per1kOut;
  // denom is guaranteed > 0 by the callers (priced rates are positive; free
  // models use FREE_COST_FLOOR_PER_1K). Round to 4 dp to avoid float noise in
  // the matrix without pretending to more precision than the inputs carry.
  return Math.round(((benchmark_score * 100) / denom) * 1e4) / 1e4;
}

/**
 * Compute the Token Efficiency Score for one (model, category, benchmark_score).
 *
 * Honest contract:
 *   - benchmark_score missing/out-of-range → { tes: null, status: 'pending' }.
 *   - model price pending/unknown          → { tes: null, status: 'pending' }.
 *   - local free model + valid score       → floored TES, status: 'free'.
 *   - priced model + valid score           → real TES, status: 'ok'.
 * Never throws; never fabricates a number.
 */
export function computeTES(input: TESInput): TESResult {
  const { model, category } = input;
  const score = input.benchmark_score ?? null;
  const price_status = priceStatusForModel(model);

  const base = {
    model,
    category,
    benchmark_score: isValidScore(score) ? score : null,
    cost_per_1k_in: null as number | null,
    cost_per_1k_out: null as number | null,
    price_status,
  };

  // Gate 1 — no real benchmark score ⇒ pending (NEVER guess a score).
  if (!isValidScore(score)) {
    return {
      ...base,
      tes: null,
      status: "pending",
      reason:
        score === null
          ? `no benchmark_score supplied for ${model} on ${category} — TES pending until a real score is measured`
          : `benchmark_score ${String(input.benchmark_score)} is not a finite [0,1] value — refusing to fabricate a TES`,
    };
  }

  // Gate 2 — price not real ⇒ pending (NEVER divide by epsilon to fake a TES).
  if (price_status === "pending" || price_status === "unknown") {
    return {
      ...base,
      tes: null,
      status: "pending",
      reason:
        price_status === "pending"
          ? `price for ${model} is pending (null in pricing snapshot) — supply via 'mooter price-update' before TES can be computed`
          : `model ${model} is not in the pricing snapshot — cannot price it, TES pending`,
    };
  }

  // Free local model — finite TES via a clearly-labelled cost floor.
  if (price_status === "free") {
    const tes = tesFormula(score, FREE_COST_FLOOR_PER_1K, FREE_COST_FLOOR_PER_1K);
    return {
      ...base,
      tes,
      status: "free",
      cost_per_1k_in: FREE_COST_FLOOR_PER_1K,
      cost_per_1k_out: FREE_COST_FLOOR_PER_1K,
      reason: `${model} is a free local model ($0); TES computed against a labelled cost floor of $${FREE_COST_FLOOR_PER_1K}/1k (not a real price)`,
    };
  }

  // Priced model — the real case.
  const { in: per1kIn, out: per1kOut } = costPer1kUsd(model);
  // Defensive: a "priced" snapshot entry with a 0 rate would still be div-safe
  // for the input side but could zero the denominator if both were 0. Treat
  // an all-zero priced denominator as pending rather than fabricate infinity.
  if (per1kIn + OUTPUT_WEIGHT * per1kOut <= 0) {
    return {
      ...base,
      tes: null,
      status: "pending",
      cost_per_1k_in: per1kIn,
      cost_per_1k_out: per1kOut,
      reason: `${model} priced at $0/1k in the snapshot — ambiguous; treating TES as pending rather than dividing by zero`,
    };
  }

  const tes = tesFormula(score, per1kIn, per1kOut);
  return {
    ...base,
    tes,
    status: "ok",
    cost_per_1k_in: per1kIn,
    cost_per_1k_out: per1kOut,
    reason: `TES = (${score} * 100) / (${per1kIn} + ${OUTPUT_WEIGHT} * ${per1kOut}) for ${model} on ${category}`,
  };
}

/**
 * Batch helper — compute TES for many cells at once. Pure pass-through over
 * computeTES; preserves input order. Useful for filling a (model × category)
 * matrix row/column in one call.
 */
export function computeTESBatch(inputs: TESInput[]): TESResult[] {
  return inputs.map(computeTES);
}

/** Reset the cached snapshot (tests only — mirrors no public reset in cost.ts,
 *  but TES tests may want to assert against a fresh read). */
export function __resetSnapshotCacheForTests(): void {
  _snapshot = null;
}
