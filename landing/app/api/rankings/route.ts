import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { MATRIX_MODELS, MATRIX_CATEGORIES } from '../../lib/matrix-roster';
import {
  buildCells,
  seedCellIndex,
  priceStatusForModel,
  isLocalModel,
  per1kFromMtok,
  SEED,
  SNAPSHOT,
} from '../../lib/matrix-engine';

// ── Public rankings API (R0 #5) ──────────────────────────────────────────────
//
// Un-gated, no auth, no user data — it serves ONLY the frozen specialization
// matrix (17×24), the ported TES, and the pricing snapshot. Powers mooter.ai/
// rankings. ISR: regenerated at most hourly. Doctrine: every number carries a
// source + as_of; an unmeasured cell is `null` + status 'unmeasured' (never a
// fabricated number); a pending price yields tes:null; local models floor to
// 'free'. "Real data · not a community average."
export const revalidate = 3600;

const VERSION = '1.0';
const SOURCE_NOTE =
  'TES = measured quality / $ · sources cited per cell · real data, not a community average';

// Display names + vendors. R0 derives these from the model id; R2's
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

function vendorFor(id: string): string {
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
// null (honest: we don't invent a tier for a model we have no data on — unlike
// the router's conservative T2 fallback, a DISPLAY must not assert a guess).
function tierFor(id: string): string | null {
  if (isLocalModel(id, SNAPSHOT)) return 'T0';
  return SNAPSHOT.models[id]?.tier ?? null;
}

// `routed` = a model Mooter actually auto-routes to in normal operation: the free
// local default (T0) and the Claude auto-tiers (T1–T3). Fable (T5) is opt-in only
// (never auto-routed); every non-Anthropic model is a capability record for the
// frontier, not an auto-route target.
function routedFor(id: string, tier: string | null): boolean {
  if (isLocalModel(id, SNAPSHOT)) return true;
  return vendorFor(id) === 'Anthropic' && tier !== 'T5';
}

interface PublicPricing {
  in_per_mtok: number | null;
  out_per_mtok: number | null;
  blended_3to1: number | null;
  status: 'priced' | 'pending' | 'free';
  source: string | null;
  as_of: string | null;
}

function pricingFor(id: string): PublicPricing {
  const m = SNAPSHOT.models[id];
  const raw = priceStatusForModel(id, SNAPSHOT); // priced | pending | free | unknown
  const in_per_mtok = m?.input_per_mtok ?? null;
  const out_per_mtok = m?.output_per_mtok ?? null;
  // Blended $/Mtok at the 3:1 input:output convention (same as the AA axis).
  const blended_3to1 =
    in_per_mtok != null && out_per_mtok != null
      ? Math.round(((3 * in_per_mtok + out_per_mtok) / 4) * 1e4) / 1e4
      : null;
  // Collapse 'unknown' → 'pending' for the public surface (honest: we simply
  // have no price for it yet — never presented as priced).
  const status: PublicPricing['status'] = raw === 'priced' ? 'priced' : raw === 'free' ? 'free' : 'pending';
  return {
    in_per_mtok,
    out_per_mtok,
    blended_3to1,
    status,
    source: SNAPSHOT.source ?? null,
    as_of: SNAPSHOT.snapshot_date ?? null,
  };
}

type PublicCellStatus = 'measured' | 'free' | 'pending' | 'unmeasured';

// The Mooter point is an ADVISORY snapshot (advisory:true), never a measured
// fleet number. Real fleet saved% (from /api/stats, k-anonymised at K≥50) is
// wired into the page hero in R1; below 50 devices it stays an honest estimate.
// Scores are on the cell scale (0–1); TES uses the effective blended cost.
const MOOTER_SCORE = 0.58;
const MOOTER_BLENDED_3TO1 = 3.3;
const MOOTER_POINT = {
  score: MOOTER_SCORE,
  blended_3to1: MOOTER_BLENDED_3TO1,
  tes: Math.round(((MOOTER_SCORE * 100) / per1kFromMtok(MOOTER_BLENDED_3TO1)) * 1e2) / 1e2,
  basis: 'advisory snapshot · ~66.8% saved vs all-Opus (real $0.85 vs naive $2.56) · your numbers vary',
  advisory: true,
};

export async function GET() {
  try {
    const { cells, measuredCount, pendingTesCount } = buildCells(SEED, SNAPSHOT);
    const seedIdx = seedCellIndex(SEED);

    const models = MATRIX_MODELS.map((id) => {
      const tier = tierFor(id);
      return {
        id,
        name: DISPLAY_NAMES[id] ?? id,
        vendor: vendorFor(id),
        tier,
        routed: routedFor(id, tier),
      };
    });

    const publicCells = cells.map((c) => {
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

    const pricing: Record<string, PublicPricing> = {};
    for (const id of MATRIX_MODELS) pricing[id] = pricingFor(id);

    const totalCells = MATRIX_MODELS.length * MATRIX_CATEGORIES.length;

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        version: VERSION,
        source_note: SOURCE_NOTE,
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
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'api/rankings' } });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
