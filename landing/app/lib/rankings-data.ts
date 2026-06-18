// rankings-data.ts — the single builder of the public rankings payload (the §B
// contract). Both /api/rankings (the public JSON API) and the (marketing)/rankings
// page (server component) call buildRankingsPayload() so they render the SAME
// numbers from the SAME frozen matrix + pricing snapshot — no HTTP self-call, no
// second copy of the shaping logic.
//
// Doctrine: every number carries source + as_of; an unmeasured cell is null +
// status 'unmeasured' (never fabricated); a pending price yields tes:null; local
// models floor to 'free'. "Real data · not a community average."

import { MATRIX_MODELS, MATRIX_CATEGORIES } from './matrix-roster';
import { buildCells, seedCellIndex, priceStatusForModel, isLocalModel, per1kFromMtok, tesFormula, SEED, SNAPSHOT } from './matrix-engine';

export const RANKINGS_VERSION = '1.0';
export const RANKINGS_SOURCE_NOTE =
  'TES = measured quality / $ · sources cited per cell · real data, not a community average';

// Display names + vendors. R0/R1 derive these from the model id; R2's
// data/model-id-map.json (built by the ingestor) will supply authoritative
// vendor/name once external sources are wired. Never fabricated — purely labels.
const DISPLAY_NAMES: Record<string, string> = {
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-opus-4-7': 'Claude Opus 4.7',
  'claude-opus-4-8': 'Claude Opus 4.8',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-fable-5': 'Claude Fable 5',
  'gpt-5': 'GPT-5',
  'gpt-5-3-codex': 'GPT-5.3 Codex',
  'gpt-oss': 'GPT-OSS',
  'gemini-3.1-pro': 'Gemini 3.1 Pro',
  'gemini-3-flash': 'Gemini 3 Flash',
  'deepseek-v3.2': 'DeepSeek V3.2',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  minimax: 'MiniMax',
  'kimi-k2.6': 'Kimi K2.6',
  'qwen3.6': 'Qwen3.6',
  'qwen3-30b': 'Qwen3 30B (local)',
};

export function vendorFor(id: string): string {
  if (id.startsWith('claude-')) return 'Anthropic';
  if (id.startsWith('gpt-')) return 'OpenAI';
  if (id.startsWith('gemini-')) return 'Google';
  if (id.startsWith('deepseek-')) return 'DeepSeek';
  if (id.startsWith('qwen')) return 'Alibaba';
  if (id.startsWith('kimi')) return 'Moonshot';
  if (id === 'minimax') return 'MiniMax';
  return 'unknown';
}

// Capability tier band. Local → T0; otherwise the frozen snapshot's tier; else
// null (honest: we don't invent a tier for a model we have no data on).
function tierFor(id: string): string | null {
  if (isLocalModel(id, SNAPSHOT)) return 'T0';
  return SNAPSHOT.models[id]?.tier ?? null;
}

// `routed` = a model Mooter actually auto-routes to: the free local default (T0)
// and the Claude auto-tiers (T1–T3). Fable (T5) is opt-in only; every
// non-Anthropic model is a capability record for the frontier, not a route target.
function routedFor(id: string, tier: string | null): boolean {
  if (isLocalModel(id, SNAPSHOT)) return true;
  return vendorFor(id) === 'Anthropic' && tier !== 'T5';
}

export interface RankingsModel {
  id: string;
  name: string;
  vendor: string;
  tier: string | null;
  routed: boolean;
}

export type PublicPriceStatus = 'priced' | 'pending' | 'free';

export interface RankingsPricing {
  in_per_mtok: number | null;
  out_per_mtok: number | null;
  blended_3to1: number | null;
  status: PublicPriceStatus;
  source: string | null;
  as_of: string | null;
}

function pricingFor(id: string): RankingsPricing {
  const m = SNAPSHOT.models[id];
  const raw = priceStatusForModel(id, SNAPSHOT); // priced | pending | free | unknown
  const in_per_mtok = m?.input_per_mtok ?? null;
  const out_per_mtok = m?.output_per_mtok ?? null;
  // Blended $/Mtok at the 3:1 input:output convention (same as the AA axis).
  const blended_3to1 =
    in_per_mtok != null && out_per_mtok != null
      ? Math.round(((3 * in_per_mtok + out_per_mtok) / 4) * 1e4) / 1e4
      : null;
  // Collapse 'unknown' → 'pending' for the public surface (honest: no price yet).
  const status: PublicPriceStatus = raw === 'priced' ? 'priced' : raw === 'free' ? 'free' : 'pending';
  return {
    in_per_mtok,
    out_per_mtok,
    blended_3to1,
    status,
    source: SNAPSHOT.source ?? null,
    as_of: SNAPSHOT.snapshot_date ?? null,
  };
}

export type PublicCellStatus = 'measured' | 'free' | 'pending' | 'unmeasured';

export interface RankingsCell {
  model: string;
  category: string;
  score: number | null;
  tes: number | null;
  status: PublicCellStatus;
  source: string | null;
  as_of: string | null;
}

// The Mooter point is an ADVISORY snapshot (advisory:true), never a measured fleet
// number. Real fleet saved% (from /api/stats, k-anonymised at K≥50) wires into the
// page hero once the fleet exists; below 50 devices it stays an honest estimate.
// Both figures trace to real inputs, and the score is disclosed as an estimate:
//   - blended_3to1: all-Opus list price ($10/Mtok at 3:1) × (1 − 0.64 bench savings)
//     ≈ $3.6/Mtok — the deterministic bench's saved% applied to the Opus baseline.
//   - score: an advisory estimate of the routed mix's quality (cheaper/local tiers
//     pull the blended quality below pure-Opus). NOT a single benchmark — carries a
//     source+as_of saying so, and the UI renders it with a ≈ marker. Your numbers vary.
const MOOTER_SCORE = 0.58;
const MOOTER_BLENDED_3TO1 = 3.6; // = $10 all-Opus blended × (1 − 0.64 bench savings)
export interface MooterPoint {
  score: number;
  blended_3to1: number;
  tes: number;
  basis: string;
  advisory: boolean;
  /** Provenance for the advisory figures — never presented as a benchmark. */
  source: string;
  as_of: string;
}
export const MOOTER_POINT: MooterPoint = {
  score: MOOTER_SCORE,
  blended_3to1: MOOTER_BLENDED_3TO1,
  // SAME formula + OUTPUT_WEIGHT as every cell (tesFormula), so the leaderboard TES
  // column compares like-for-like. The single advisory blended figure is costed
  // symmetrically (in ≈ out at the blended rate) since we have no in/out split.
  tes: tesFormula(MOOTER_SCORE, per1kFromMtok(MOOTER_BLENDED_3TO1), per1kFromMtok(MOOTER_BLENDED_3TO1)),
  basis: 'advisory routing estimate · ~64% saved vs all-Opus (deterministic bench, N=50) · your numbers vary',
  advisory: true,
  source: 'advisory estimate of the routed mix — not a single benchmark',
  as_of: SNAPSHOT.snapshot_date ?? '2026-05-27',
};

export interface RankingsCoverage {
  measured_cells: number;
  total_cells: number;
  coverage_pct: number;
  tes_pending_cells: number;
}

export interface RankingsPayload {
  generated_at: string;
  version: string;
  source_note: string;
  models: RankingsModel[];
  categories: readonly string[];
  cells: RankingsCell[];
  pricing: Record<string, RankingsPricing>;
  mooter_point: MooterPoint;
  coverage: RankingsCoverage;
}

export function buildRankingsPayload(): RankingsPayload {
  const { cells, measuredCount, pendingTesCount } = buildCells(SEED, SNAPSHOT);
  const seedIdx = seedCellIndex(SEED);

  const models: RankingsModel[] = MATRIX_MODELS.map((id) => {
    const tier = tierFor(id);
    return { id, name: DISPLAY_NAMES[id] ?? id, vendor: vendorFor(id), tier, routed: routedFor(id, tier) };
  });

  const publicCells: RankingsCell[] = cells.map((c) => {
    const status: PublicCellStatus = !c.measured
      ? 'unmeasured'
      : c.tes_status === 'free'
        ? 'free'
        : c.tes_status === 'ok'
          ? 'measured'
          : 'pending';
    const seedCell = c.measured ? seedIdx.get(`${c.model} ${c.category}`) : undefined;
    return {
      model: c.model,
      category: c.category,
      score: c.score,
      tes: c.tes,
      status,
      source: c.measured ? c.source : null,
      as_of: seedCell?.as_of ?? null,
    };
  });

  const pricing: Record<string, RankingsPricing> = {};
  for (const id of MATRIX_MODELS) pricing[id] = pricingFor(id);

  const totalCells = MATRIX_MODELS.length * MATRIX_CATEGORIES.length;

  return {
    generated_at: new Date().toISOString(),
    version: RANKINGS_VERSION,
    source_note: RANKINGS_SOURCE_NOTE,
    models,
    categories: MATRIX_CATEGORIES,
    cells: publicCells,
    pricing,
    mooter_point: MOOTER_POINT,
    coverage: {
      measured_cells: measuredCount,
      total_cells: totalCells,
      coverage_pct: totalCells > 0 ? Math.round((measuredCount / totalCells) * 100) : 0,
      tes_pending_cells: pendingTesCount,
    },
  };
}
