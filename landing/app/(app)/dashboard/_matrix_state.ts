// Wave 58 batch 4 (A.13/A.15) — PURE helpers for the admin MatrixPanel.
// landing vitest is node-env (no React testing library), so the logic that the
// heatmap depends on — TES→colour bucketing, category/cost filtering, and the
// CSV/JSON export string builders — lives here as pure functions and is unit-
// tested directly. The .tsx file is a thin shell over these.
//
// NO FABRICATION (Doctrine V4 #5): a cell with tes === null (pending price or
// missing benchmark score) is NEVER given a numeric bucket or a fake number.
// It buckets to 'pending' and exports render as the literal string "pending".

export type TesStatus = 'ok' | 'free' | 'pending';

export interface MatrixCell {
  model: string;
  category: string;
  score: number | null;
  source: string;
  measured: boolean;
  tes: number | null;
  tes_status: TesStatus;
}

export type TesBucket = 'high' | 'mid' | 'low' | 'pending';

/**
 * TES→colour bucket. Thresholds are on the raw TES value (quality-per-$ ; a
 * higher TES is strictly better). A null TES (pending/incomputable) ALWAYS maps
 * to 'pending' — we never colour a cell we cannot honestly score.
 *
 *   tes >= HIGH_THRESHOLD → 'high'
 *   tes >= MID_THRESHOLD  → 'mid'
 *   tes >= 0              → 'low'
 *   null / negative / NaN → 'pending'
 *
 * Defaults chosen so that a free local model (floored at ~score·100/0.0013 ≈ 7e4
 * for score 0.9) lands 'high', a cheap paid model lands 'mid', and an expensive
 * one lands 'low' — but callers may override the thresholds.
 */
export const HIGH_THRESHOLD = 5000;
export const MID_THRESHOLD = 1500;

export function tesBucket(
  tes: number | null | undefined,
  high: number = HIGH_THRESHOLD,
  mid: number = MID_THRESHOLD,
): TesBucket {
  if (tes == null || !Number.isFinite(tes) || tes < 0) return 'pending';
  if (tes >= high) return 'high';
  if (tes >= mid) return 'mid';
  return 'low';
}

/** CSS colour for a bucket — DIY palette, no chart lib. */
export const BUCKET_COLORS: Record<TesBucket, string> = {
  high: 'rgba(56, 161, 105, 0.85)', // green — best value
  mid: 'rgba(214, 158, 46, 0.80)', // amber — ok value
  low: 'rgba(197, 48, 48, 0.70)', // red — poor value
  pending: 'rgba(120, 120, 120, 0.18)', // grey — honestly unknown
};

export function bucketColor(bucket: TesBucket): string {
  return BUCKET_COLORS[bucket];
}

export interface MatrixFilter {
  /** Restrict to a single category, or null/undefined for all. */
  category?: string | null;
  /**
   * Cap on per-1k input price (USD) inferred from the model's tier. Cells whose
   * model exceeds this cap are filtered out. Pending-price models are ALWAYS
   * kept when no cap is set, and kept-or-dropped per `includeUnpriced` when a
   * cap IS set (default: drop, since we cannot prove they fit the cap).
   */
  maxCostPer1k?: number | null;
  /** When a cost cap is set, whether to keep models with unknown price. */
  includeUnpriced?: boolean;
}

/**
 * Per-1k input price (USD) for the 3 priced Wave 58 models, derived from the
 * frozen snapshot's per-MTok rates. Any model not listed here has an unknown
 * price (its TES is pending) — we NEVER invent a rate to filter it. Kept in
 * lockstep with data/pricing-snapshot-2026-05-27.json.
 */
export const KNOWN_PRICE_PER_1K: Record<string, number> = {
  'claude-opus-4-7': 5 / 1000,
  'claude-sonnet-4-6': 3 / 1000,
  'claude-haiku-4-5': 1 / 1000,
};

/** Local (free) models — per-1k price treated as 0 for the cost filter. */
export const FREE_MODELS: ReadonlySet<string> = new Set(['qwen3.6', 'qwen3-30b']);

/**
 * Resolve the per-1k input price used by the cost filter:
 *   free model        → 0
 *   known priced model → its real rate
 *   anything else      → null (unknown; we will not guess)
 */
export function modelPricePer1k(model: string): number | null {
  if (FREE_MODELS.has(model) || model.includes(':')) return 0;
  return KNOWN_PRICE_PER_1K[model] ?? null;
}

/**
 * Filter cells by category and by a cost cap. Pure; never mutates the input.
 * - No category filter ⇒ all categories.
 * - No cost cap ⇒ all priced + unpriced cells pass.
 * - Cost cap set ⇒ keep cells whose model price ≤ cap; unknown-price cells are
 *   kept only when `includeUnpriced` is true (default false: we cannot prove
 *   an unknown-price model fits the cap, so we drop it rather than fabricate).
 */
export function filterCells(cells: MatrixCell[], filter: MatrixFilter = {}): MatrixCell[] {
  const { category, maxCostPer1k, includeUnpriced = false } = filter;
  return cells.filter((c) => {
    if (category && c.category !== category) return false;
    if (maxCostPer1k != null) {
      const price = modelPricePer1k(c.model);
      if (price == null) return includeUnpriced;
      if (price > maxCostPer1k) return false;
    }
    return true;
  });
}

/** Escape one CSV field (RFC-4180: wrap in quotes + double embedded quotes). */
function csvField(value: string | number | null): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Build a CSV string for the given cells. Header:
 *   model,category,score,source,measured,tes,tes_status
 * A pending/incomputable TES is rendered as the literal "pending" (NEVER a
 * fake number); a null score is rendered as "" (empty). Stable column order.
 */
export function toCsv(cells: MatrixCell[]): string {
  const header = ['model', 'category', 'score', 'source', 'measured', 'tes', 'tes_status'];
  const lines = [header.join(',')];
  for (const c of cells) {
    const tesOut = c.tes == null ? 'pending' : c.tes;
    lines.push(
      [
        csvField(c.model),
        csvField(c.category),
        csvField(c.score),
        csvField(c.source),
        csvField(c.measured ? 'true' : 'false'),
        csvField(tesOut),
        csvField(c.tes_status),
      ].join(','),
    );
  }
  return lines.join('\n');
}

/**
 * Build a pretty-printed JSON export string. Preserves the honest null TES (we
 * do NOT coerce pending cells to a number); adds a top-level note so a reader of
 * the raw export understands the pending convention.
 */
export function toJson(cells: MatrixCell[]): string {
  return JSON.stringify(
    {
      _note:
        'tes:null means the value is pending — model price is null in the pricing snapshot or no benchmark score is measured. Never a fabricated number.',
      exported_at: new Date().toISOString(),
      count: cells.length,
      cells,
    },
    null,
    2,
  );
}
