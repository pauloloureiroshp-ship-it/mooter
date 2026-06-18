// @ts-check
/**
 * lib/ingest.js — Rankings R2: external benchmark + pricing ingestor.
 *
 * Pulls model benchmarks (Artificial Analysis) and pricing (AA + OpenRouter),
 * normalises them onto Mooter ids + categories, and writes them to the D1 tables
 * created by migration 020 (benchmark_cells, pricing_models). The daily scheduled
 * handler calls runIngest(env); /v1/benchmarks and /v1/pricing then serve the rows.
 *
 * DOCTRINE (this is the product):
 *  - NO FABRICATION. We only write a cell/price the source actually reported. A
 *    failed source writes nothing (INSERT OR REPLACE on produced rows only), so the
 *    last good value is kept — never overwritten with null.
 *  - PROVENANCE. Every row carries source + as_of (+ confidence for cells).
 *  - HONEST MAPPING. AA's single coding_index maps to ONE representative cell
 *    (coding.backend), NOT broadcast across all 9 coding.* categories — claiming the
 *    same score for frontend/security/test/etc. from one index would be fabrication.
 *  - DEGRADES. No AA_API_KEY ⇒ OpenRouter-only (prices). A source that 4xx/5xx or
 *    times out is skipped, not fatal.
 *
 * Pure functions are exported for unit tests; network + DB are injectable.
 */

import idMapJson from '../../data/model-id-map.json' with { type: 'json' };

export const AA_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/models';

/** The committed crosswalk: { mooterId: { vendor, match_name, aa_slug, openrouter_id } }. */
export const ID_MAP = idMapJson.models;

// AA evaluation field → Mooter category. `scale` 100 = a 0–100 index (÷100 to
// reach the cell's [0,1] scale); 1 = an already-0–1 sub-benchmark.
export const AA_EVAL_MAP = [
  { field: 'artificial_analysis_intelligence_index', category: 'reasoning.general', scale: 100 },
  { field: 'artificial_analysis_coding_index', category: 'coding.backend', scale: 100 },
  { field: 'artificial_analysis_math_index', category: 'reasoning.math', scale: 100 },
  { field: 'livecodebench', category: 'coding.competitive', scale: 1 },
  { field: 'scicode', category: 'reasoning.science', scale: 1 },
];

/** lowercase + strip everything but [a-z0-9] → for tolerant name matching. */
export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Clamp a score to [0,1]; return null for non-finite input (never fabricate). */
export function clamp01(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Match a Mooter map entry to one AA data[] row. EXACT only — by slug/id or by
 * fully-normalized name. We deliberately do NOT do substring/contains fuzzy
 * matching: it cross-maps near-named models (e.g. "gpt53codex" contains "gpt5"),
 * which would assign one model's scores to another. Per doctrine, an inexact match
 * is no match (skip + the caller writes nothing) — never guess in silence. To map a
 * model whose AA name differs, refresh its `match_name`/`aa_slug` in
 * data/model-id-map.json via review.
 * @returns {{ entry: any, confidence: 'high' } | null}
 */
export function matchAaEntry(mapEntry, aaData) {
  if (!Array.isArray(aaData)) return null;
  const wantName = normalizeName(mapEntry.match_name);
  const wantSlug = mapEntry.aa_slug ? normalizeName(mapEntry.aa_slug) : null;
  if (wantSlug) {
    const bySlug = aaData.find(
      (e) => normalizeName(e.slug) === wantSlug || normalizeName(e.id) === wantSlug,
    );
    if (bySlug) return { entry: bySlug, confidence: 'high' };
  }
  const byName = aaData.find((e) => normalizeName(e.name) === wantName);
  if (byName) return { entry: byName, confidence: 'high' };
  return null;
}

/** Find the OpenRouter row for a map entry (by openrouter_id, else null). */
export function matchOpenRouterEntry(mapEntry, orData) {
  if (!Array.isArray(orData) || !mapEntry.openrouter_id) return null;
  const want = normalizeName(mapEntry.openrouter_id);
  return orData.find((e) => normalizeName(e.id) === want) || null;
}

/**
 * Build benchmark_cells rows from AA for every mapped model.
 * @returns {Array<{model,category,score,source,as_of,confidence}>}
 */
export function buildAaCells(idMap, aaData, asOf) {
  const rows = [];
  for (const [mooterId, mapEntry] of Object.entries(idMap)) {
    const m = matchAaEntry(mapEntry, aaData);
    if (!m) continue;
    const ev = m.entry.evaluations || {};
    for (const { field, category, scale } of AA_EVAL_MAP) {
      const raw = ev[field];
      if (raw == null || typeof raw !== 'number') continue;
      const score = clamp01(scale === 100 ? raw / 100 : raw);
      if (score == null) continue;
      rows.push({
        model: mooterId,
        category,
        score,
        source: 'artificial-analysis',
        as_of: asOf,
        confidence: m.confidence,
      });
    }
  }
  return rows;
}

/** Parse an OpenRouter per-token price STRING to $/Mtok (×1e6). null if absent. */
export function orPriceToMtok(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1e6 * 1e4) / 1e4;
}

/**
 * Build pricing_models rows. AA price preferred; OpenRouter cross-checks the input
 * rate (>10% divergence ⇒ confidence medium reflected in the chosen source label).
 * @returns {Array<{model,input_per_mtok,output_per_mtok,blended_3to1,source,as_of}>}
 */
export function buildPricingRows(idMap, aaData, orData, asOf) {
  const rows = [];
  for (const [mooterId, mapEntry] of Object.entries(idMap)) {
    const aa = matchAaEntry(mapEntry, aaData);
    const aaPricing = aa && aa.entry.pricing ? aa.entry.pricing : null;
    const aaIn = aaPricing && typeof aaPricing.price_1m_input_tokens === 'number' ? aaPricing.price_1m_input_tokens : null;
    const aaOut = aaPricing && typeof aaPricing.price_1m_output_tokens === 'number' ? aaPricing.price_1m_output_tokens : null;
    const aaBlended = aaPricing && typeof aaPricing.price_1m_blended_3_to_1 === 'number' ? aaPricing.price_1m_blended_3_to_1 : null;

    const or = matchOpenRouterEntry(mapEntry, orData);
    const orIn = or && or.pricing ? orPriceToMtok(or.pricing.prompt) : null;
    const orOut = or && or.pricing ? orPriceToMtok(or.pricing.completion) : null;

    let inP = aaIn,
      outP = aaOut,
      source = 'artificial-analysis';
    if (aaIn == null && orIn != null) {
      // AA missing → OpenRouter only.
      inP = orIn;
      outP = orOut;
      source = 'openrouter';
    } else if (aaIn != null && orIn != null) {
      // Both present → cross-check the input rate; >10% divergence flags medium
      // confidence but we still prefer AA's figure.
      const diverged = Math.abs(aaIn - orIn) / aaIn > 0.1;
      source = diverged ? 'artificial-analysis (or-divergent)' : 'artificial-analysis';
    }

    if (inP == null && outP == null && aaBlended == null) continue; // nothing to write — don't fabricate

    const blended =
      aaBlended != null
        ? Math.round(aaBlended * 1e4) / 1e4
        : inP != null && outP != null
          ? Math.round(((3 * inP + outP) / 4) * 1e4) / 1e4
          : null;

    rows.push({
      model: mooterId,
      input_per_mtok: inP,
      output_per_mtok: outP,
      blended_3to1: blended,
      source,
      as_of: asOf,
    });
  }
  return rows;
}

// ── network (injectable) ─────────────────────────────────────────────────────

/** Fetch AA models. Returns data[] or null (no key / error → degrade). */
export async function fetchAA(env, fetchImpl = fetch) {
  const key = env && env.AA_API_KEY;
  if (!key) return null; // degrade to OpenRouter-only
  try {
    const res = await fetchImpl(AA_URL, { headers: { 'x-api-key': key } });
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body) ? body : Array.isArray(body && body.data) ? body.data : null;
  } catch {
    return null;
  }
}

/** Fetch OpenRouter models. Tries no-auth; on 401 retries with OPENROUTER_API_KEY. */
export async function fetchOpenRouter(env, fetchImpl = fetch) {
  const tryFetch = async (headers) => {
    const res = await fetchImpl(OPENROUTER_URL, headers ? { headers } : undefined);
    return res;
  };
  try {
    let res = await tryFetch(null);
    if (res.status === 401 && env && env.OPENROUTER_API_KEY) {
      res = await tryFetch({ Authorization: `Bearer ${env.OPENROUTER_API_KEY}` });
    }
    if (!res.ok) return null;
    const body = await res.json();
    return Array.isArray(body && body.data) ? body.data : Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

// ── orchestrator ─────────────────────────────────────────────────────────────

/** Today as an ISO date (YYYY-MM-DD); injectable for tests. */
export function isoDate(now) {
  return new Date(typeof now === 'number' ? now : Date.now()).toISOString().slice(0, 10);
}

/**
 * Run the full ingest: fetch → normalise → write D1 (idempotent). Returns a
 * summary. Never throws on a source failure; degrades to whatever is reachable.
 * @param {any} env  Worker env (env.DB D1 binding, env.AA_API_KEY, ...)
 * @param {{ fetchImpl?: typeof fetch, now?: number, idMap?: any }} [deps]
 */
export async function runIngest(env, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const idMap = deps.idMap || ID_MAP;
  const asOf = isoDate(deps.now);

  const aaData = await fetchAA(env, fetchImpl);
  const orData = await fetchOpenRouter(env, fetchImpl);

  const cells = aaData ? buildAaCells(idMap, aaData, asOf) : [];
  const prices = buildPricingRows(idMap, aaData, orData, asOf);

  let cellsWritten = 0;
  let pricesWritten = 0;
  const db = env && env.DB;
  if (db && (cells.length || prices.length)) {
    const stmts = [];
    for (const c of cells) {
      stmts.push(
        db
          .prepare(
            'INSERT OR REPLACE INTO benchmark_cells (model,category,score,source,as_of,confidence) VALUES (?,?,?,?,?,?)',
          )
          .bind(c.model, c.category, c.score, c.source, c.as_of, c.confidence),
      );
    }
    for (const p of prices) {
      stmts.push(
        db
          .prepare(
            'INSERT OR REPLACE INTO pricing_models (model,input_per_mtok,output_per_mtok,blended_3to1,source,as_of) VALUES (?,?,?,?,?,?)',
          )
          .bind(p.model, p.input_per_mtok, p.output_per_mtok, p.blended_3to1, p.source, p.as_of),
      );
    }
    if (stmts.length) await db.batch(stmts);
    cellsWritten = cells.length;
    pricesWritten = prices.length;
  }

  return {
    ok: Boolean(aaData || orData),
    as_of: asOf,
    sources: { artificial_analysis: Boolean(aaData), openrouter: Boolean(orData) },
    cells_written: cellsWritten,
    prices_written: pricesWritten,
  };
}
