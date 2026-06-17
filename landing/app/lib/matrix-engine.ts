// matrix-engine.ts — the shared, pure specialization-matrix + TES engine for the
// landing app. Extracted from the admin matrix route (R0 #5) so the public
// /api/rankings route and the admin route build the SAME dense 17×24 grid from the
// SAME frozen data, with one honest implementation of the TES contract.
//
// ── TES SOURCE CHOICE (documented) ───────────────────────────────────────────
// The canonical TES engine is packages/router/src/tes-calculator.ts. It is an ESM
// `.ts` module that imports its pricing snapshot via a router-package-relative path
// and drags in benchmark-fetcher (node:fs); Next's bundler cannot pull it into the
// landing build graph without coupling the two build graphs. So we PORT the small,
// pure TES formula here and import the SAME frozen snapshot file at build time. The
// constants below are copied verbatim from tes-calculator.ts and MUST be kept in
// lockstep with it. We never re-implement the cost math beyond the single
// documented formula, and we never fabricate a number — pending price or missing
// score ⇒ tes:null.
//
//   TES = (benchmark_score * 100) / (cost_per_1k_in + OUTPUT_WEIGHT * cost_per_1k_out)
//
// Mirrors tes-calculator.ts: OUTPUT_WEIGHT = 0.3, FREE_COST_FLOOR_PER_1K = 0.001
// (a labelled floor for free local models, not a real price).

import { MATRIX_MODELS, MATRIX_CATEGORIES } from './matrix-roster';
// Frozen data inlined at build time (Wave 61 pattern) — no runtime IO, no cwd
// dependence. data/ is at the repo root.
import seedJson from '../../../data/benchmark-seed-2026.json';
import snapshotJson from '../../../data/pricing-snapshot-2026-05-27.json';

export const OUTPUT_WEIGHT = 0.3;
export const FREE_COST_FLOOR_PER_1K = 0.001;

export interface SeedCell {
  model: string;
  category: string;
  score: number | null;
  source: string;
  source_url?: string;
  measured?: boolean;
  confidence?: string;
  as_of?: string;
}
export interface SnapshotModel {
  input_per_mtok: number | null;
  output_per_mtok: number | null;
  /** Capability tier band from the frozen snapshot. */
  tier?: string;
  pricing_status?: string;
}
export interface PricingSnapshot {
  models: Record<string, SnapshotModel>;
  ollama_models?: string[];
  local_models_free?: string[];
  source?: string;
  snapshot_date?: string;
}
export interface SeedFile {
  cells?: SeedCell[];
}

export type PriceStatus = 'priced' | 'pending' | 'free' | 'unknown';
export type TesStatus = 'ok' | 'free' | 'pending';

export interface MatrixCell {
  model: string;
  category: string;
  /** Real benchmark score in [0,1], or null (qualitative / unmeasured). */
  score: number | null;
  /** Benchmark name; 'unknown' for an unmeasured cell. */
  source: string;
  /** True only when a real, cited benchmark backs the cell. */
  measured: boolean;
  /** Computed TES, or null when status !== 'ok'/'free'. NEVER fabricated. */
  tes: number | null;
  /** 'ok' (priced), 'free' (local floor), or 'pending' (no price / no score). */
  tes_status: TesStatus;
}

// The frozen data, typed. Single import point for both routes.
export const SEED = seedJson as unknown as SeedFile;
export const SNAPSHOT = snapshotJson as unknown as PricingSnapshot;

/**
 * Faithful port of cost.ts/decide-agent isLocalModel: a model is free-local when
 * it is in the snapshot's ollama_models or local_models_free lists, or carries an
 * Ollama-style ':' tag. (Adding local_models_free here cannot change any cell TES:
 * every free-local roster model is unmeasured, so computeCellTes returns pending on
 * the null-score guard before price is ever consulted.)
 */
export function isLocalModel(model: string, snapshot: PricingSnapshot): boolean {
  if (snapshot.ollama_models?.includes(model)) return true;
  if (snapshot.local_models_free?.includes(model)) return true;
  return model.includes(':');
}

/** Port of tes-calculator.priceStatusForModel (no fabrication). */
export function priceStatusForModel(model: string, snapshot: PricingSnapshot): PriceStatus {
  if (isLocalModel(model, snapshot)) return 'free';
  const m = snapshot.models[model];
  if (!m) return 'unknown';
  if (m.pricing_status === 'pending' || m.input_per_mtok == null || m.output_per_mtok == null) {
    return 'pending';
  }
  return 'priced';
}

/** Per-1k USD rate from a per-MTok price (1000 tokens / 1e6 tokens-per-MTok). */
export function per1kFromMtok(perMtok: number): number {
  return perMtok / 1000;
}

export function isValidScore(s: number | null | undefined): s is number {
  return typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1;
}

export function tesFormula(score: number, per1kIn: number, per1kOut: number): number {
  const denom = per1kIn + OUTPUT_WEIGHT * per1kOut;
  return Math.round(((score * 100) / denom) * 1e4) / 1e4;
}

/**
 * Compute TES for one cell — honest contract identical to computeTES():
 *   missing/invalid score → pending; pending/unknown price → pending;
 *   free local → floored TES (status 'free'); priced → real TES (status 'ok').
 */
export function computeCellTes(
  model: string,
  score: number | null,
  snapshot: PricingSnapshot,
): { tes: number | null; tes_status: TesStatus } {
  if (!isValidScore(score)) return { tes: null, tes_status: 'pending' };

  const price = priceStatusForModel(model, snapshot);
  if (price === 'pending' || price === 'unknown') return { tes: null, tes_status: 'pending' };

  if (price === 'free') {
    return {
      tes: tesFormula(score, FREE_COST_FLOOR_PER_1K, FREE_COST_FLOOR_PER_1K),
      tes_status: 'free',
    };
  }

  const m = snapshot.models[model];
  const per1kIn = per1kFromMtok(m.input_per_mtok as number);
  const per1kOut = per1kFromMtok(m.output_per_mtok as number);
  if (per1kIn + OUTPUT_WEIGHT * per1kOut <= 0) return { tes: null, tes_status: 'pending' };
  return { tes: tesFormula(score, per1kIn, per1kOut), tes_status: 'ok' };
}

/** Build the full dense 17×24 matrix: empty scaffold overlaid with measured seed cells. */
export function buildCells(seed: SeedFile, snapshot: PricingSnapshot): {
  cells: MatrixCell[];
  measuredCount: number;
  pendingTesCount: number;
} {
  const byKey = new Map<string, SeedCell>();
  for (const c of seed.cells ?? []) {
    if (c && c.measured && c.model && c.category) byKey.set(`${c.model} ${c.category}`, c);
  }

  const cells: MatrixCell[] = [];
  let measuredCount = 0;
  let pendingTesCount = 0;

  for (const model of MATRIX_MODELS) {
    for (const category of MATRIX_CATEGORIES) {
      const seedCell = byKey.get(`${model} ${category}`);
      const measured = Boolean(seedCell);
      const score = measured ? (seedCell as SeedCell).score ?? null : null;
      const source = measured ? (seedCell as SeedCell).source : 'unknown';
      const { tes, tes_status } = computeCellTes(model, score, snapshot);
      if (measured) measuredCount++;
      if (tes === null) pendingTesCount++;
      cells.push({ model, category, score, source, measured, tes, tes_status });
    }
  }

  return { cells, measuredCount, pendingTesCount };
}

/** Map `${model} ${category}` → its measured seed cell (for as_of / source provenance). */
export function seedCellIndex(seed: SeedFile): Map<string, SeedCell> {
  const byKey = new Map<string, SeedCell>();
  for (const c of seed.cells ?? []) {
    if (c && c.measured && c.model && c.category) byKey.set(`${c.model} ${c.category}`, c);
  }
  return byKey;
}
