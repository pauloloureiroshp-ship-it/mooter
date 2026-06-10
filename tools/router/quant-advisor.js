'use strict';

// Adaptive-quantization ADVISOR (Wave 52 Phase 4).
//
// ── Honest framing (doctrine V4: honest > forced) ────────────────────────────
// Ollama serves each model at a FIXED quantization baked into the model tag —
// Q4_K_M by default for qwen3 / llama3 / most models. Mooter does NOT requantize
// at runtime and this module does NOT change routing (classify.js is untouched).
//
// What this is: a PURE, OFFLINE calculator that, given your free VRAM, the model
// size, and the context length you want, estimates which quantization tag would
// fit and recommends the one to `ollama pull` (e.g. `:q5_K_M` / `:q3_K_M`) or
// whether you should pick a smaller model. It is ADVISORY — you act on it by
// pulling a different tag, not by flipping a Mooter switch.
//
// Estimates are FIRST-ORDER: weight sizes derive from the project's QUANT_INFO
// SSoT (tools/router/quantization.js); KV-cache is approximated and calibrated
// to GQA-modern models (qwen2.5-class). Real usage varies by model architecture,
// framework overhead, and batch size — always keep headroom.

const { QUANT_INFO } = require('./quantization.js');

// FP16 weight footprint per billion params, in MiB: 1e9 params × 2 bytes / 1024².
const FP16_MB_PER_B = 1907.35;

// GGUF metadata + embedding/output layers that stay near FP16 even when the body
// is quantized. Calibrated so qwen2.5-coder:7.6b Q4_K_M ≈ 4.7 GB weights (matches
// the pool.ts PER_WORKER_VRAM_MB ≈ 5.2 GB once a small KV cache is added).
const WEIGHT_OVERHEAD = 1.15;

// KV-cache MiB per token per billion params, FP16, calibrated to GQA-modern
// (qwen2.5-7b @ 8k ≈ 0.9 GB). Older MHA models without grouped-query attention
// use ~4–8× more — this is a deliberately documented approximation, not exact.
const KV_COEFF_FP16 = 0.015;

// Default runtime headroom for activations / framework overhead / fragmentation.
const DEFAULT_HEADROOM_PCT = 15;

// Quality floor for the "sweet spot" recommendation: below ~99% the quality drop
// becomes user-visible; above Q4_K_M the gains are <1% for a large VRAM cost.
const QUALITY_FLOOR = 99;

// Ollama's real default tag. The advisor reports whether THIS fits first, because
// "the default already fits — pull nothing" is the most common honest answer.
const OLLAMA_DEFAULT = 'Q4_K_M';

// VRAM tier thresholds (MiB), mirroring packages/cli env-detect.ts classifyHwTier.
// Kept in sync by hand; documented here so the advisor is self-contained.
const HW_TIER_VRAM_MB = { 'gpu-high': 20480, 'gpu-mid': 8192, 'gpu-low': 4096 };

// Preference order: highest quality first. Ties (Q5_K_M/Q4_K_M both ~99%) keep the
// larger first so "best that fits" is unambiguous; the sweet-spot pass then prefers
// the smaller one. FP16 is included for completeness but is rarely the right call.
const PREFERENCE = ['FP16', 'Q8_0', 'Q6_K', 'Q5_K_M', 'Q4_K_M', 'Q4_0', 'Q3_K_M', 'Q2_K'];

const HONEST_NOTE =
  'Advisory only: Ollama serves a FIXED quant per model tag (Q4_K_M default); ' +
  'Mooter does not requantize at runtime. Act on this by `ollama pull model:<tag>` ' +
  'or by choosing a smaller model. VRAM figures are first-order estimates — keep headroom.';

/** Normalise a params input ("7b", "7.6B", 13, "32") to billions as a number. */
function toParamsB(params) {
  if (typeof params === 'number' && Number.isFinite(params)) return params;
  const m = String(params || '').match(/([\d.]+)\s*b?/i);
  return m ? parseFloat(m[1]) : NaN;
}

/**
 * Estimated weight VRAM (MiB) for a model at a given quant.
 * @param {number} paramsB billions of parameters
 * @param {string} quant key into QUANT_INFO (e.g. "Q4_K_M")
 * @returns {number}
 */
function estimateWeightsMb(paramsB, quant) {
  const info = QUANT_INFO[quant];
  if (!info || !(paramsB > 0)) return NaN;
  return paramsB * FP16_MB_PER_B * (info.size_pct_vs_fp16 / 100) * WEIGHT_OVERHEAD;
}

/**
 * Estimated KV-cache VRAM (MiB). Scales linearly with context and params.
 * @param {number} contextTokens
 * @param {number} paramsB
 * @param {number} [kvQuantBits=16] 16 = FP16 (Ollama default); 3 ≈ TurboQuant 3-bit KV.
 * @returns {number}
 */
function estimateKvCacheMb(contextTokens, paramsB, kvQuantBits = 16) {
  if (!(contextTokens > 0) || !(paramsB > 0)) return 0;
  const bitScale = Math.max(1, kvQuantBits) / 16;
  return contextTokens * paramsB * KV_COEFF_FP16 * bitScale;
}

/**
 * Total estimated VRAM (MiB) = weights + KV cache (before headroom).
 * @returns {number}
 */
function estimateTotalVramMb(paramsB, quant, contextTokens, kvQuantBits = 16) {
  return estimateWeightsMb(paramsB, quant) + estimateKvCacheMb(contextTokens, paramsB, kvQuantBits);
}

/**
 * Recommend a quantization tag for a VRAM budget + model + context.
 *
 * @param {object} opts
 * @param {number} opts.vramMb       free VRAM in MiB
 * @param {number|string} opts.paramsB model size ("7b" / 7.6 / 32)
 * @param {number} [opts.contextTokens=8192]
 * @param {number} [opts.headroomPct=15]
 * @param {number} [opts.kvQuantBits=16]
 * @param {number} [opts.qualityFloor=99]
 * @returns {{
 *   advisory: true, fits: boolean, defaultFits: boolean,
 *   recommended: string|null, best: string|null, action: string,
 *   budgetMb: number, fits_list: Array<{quant:string,estVramMb:number,quality_pct:number}>,
 *   breakdown: {weightsMb:number,kvCacheMb:number}|null, note: string
 * }}
 */
function recommendQuant(opts = {}) {
  const paramsB = toParamsB(opts.paramsB);
  const vramMb = Number(opts.vramMb);
  const contextTokens = opts.contextTokens ?? 8192;
  const headroomPct = opts.headroomPct ?? DEFAULT_HEADROOM_PCT;
  const kvQuantBits = opts.kvQuantBits ?? 16;
  const qualityFloor = opts.qualityFloor ?? QUALITY_FLOOR;

  if (!(paramsB > 0) || !(vramMb > 0)) {
    throw new TypeError('recommendQuant: vramMb and paramsB must be positive numbers');
  }

  const budgetMb = vramMb * (1 - headroomPct / 100);
  const kvCacheMb = estimateKvCacheMb(contextTokens, paramsB, kvQuantBits);

  const fitsList = [];
  for (const quant of PREFERENCE) {
    const weightsMb = estimateWeightsMb(paramsB, quant);
    if (!Number.isFinite(weightsMb)) continue;
    const estVramMb = weightsMb + kvCacheMb;
    if (estVramMb <= budgetMb) {
      fitsList.push({ quant, estVramMb: Math.round(estVramMb), quality_pct: QUANT_INFO[quant].quality_pct });
    }
  }

  const best = fitsList.length ? fitsList[0].quant : null;
  // Sweet spot: smallest VRAM among quants that meet the quality floor (typically
  // Q4_K_M — the Ollama default). Falls back to `best` when nothing meets the floor.
  let recommended = null;
  for (const f of fitsList) {
    if (f.quality_pct >= qualityFloor) recommended = f.quant; // keep the last (smallest) qualifying
  }
  if (!recommended) recommended = best;

  const defaultFits = fitsList.some((f) => f.quant === OLLAMA_DEFAULT);

  let action;
  if (!best) {
    action = `No quant of a ${paramsB}B model fits in ${Math.round(budgetMb)} MiB budget at ${contextTokens} ctx — pick a smaller model or reduce context.`;
  } else if (defaultFits && recommended === OLLAMA_DEFAULT) {
    action = `Ollama default (${OLLAMA_DEFAULT}) fits — pull nothing, you're set.`;
  } else if (recommended !== OLLAMA_DEFAULT && QUANT_INFO[recommended].size_pct_vs_fp16 < QUANT_INFO[OLLAMA_DEFAULT].size_pct_vs_fp16) {
    action = `Default ${OLLAMA_DEFAULT} is too big — pull the smaller \`:${recommended.toLowerCase()}\` tag (quality ~${QUANT_INFO[recommended].quality_pct}%).`;
  } else {
    action = `You have headroom for \`:${recommended.toLowerCase()}\` (quality ~${QUANT_INFO[recommended].quality_pct}%), though ${OLLAMA_DEFAULT} is usually enough.`;
  }

  return {
    advisory: true,
    fits: !!best,
    defaultFits,
    recommended,
    best,
    action,
    budgetMb: Math.round(budgetMb),
    fits_list: fitsList,
    breakdown: best ? { weightsMb: Math.round(estimateWeightsMb(paramsB, recommended)), kvCacheMb: Math.round(kvCacheMb) } : null,
    note: HONEST_NOTE,
  };
}

/**
 * Inverse advisor: the largest model (billions of params) that fits a VRAM budget
 * at a given quant + context. Advisory; rounds DOWN to stay safe.
 * @returns {number} max params in billions (0 if even ~1B won't fit)
 */
function maxModelParamsB(opts = {}) {
  const vramMb = Number(opts.vramMb);
  const quant = opts.quant || OLLAMA_DEFAULT;
  const contextTokens = opts.contextTokens ?? 8192;
  const headroomPct = opts.headroomPct ?? DEFAULT_HEADROOM_PCT;
  const kvQuantBits = opts.kvQuantBits ?? 16;
  const info = QUANT_INFO[quant];
  if (!(vramMb > 0) || !info) throw new TypeError('maxModelParamsB: need positive vramMb and a known quant');

  const budgetMb = vramMb * (1 - headroomPct / 100);
  // budget = paramsB × (FP16_MB_PER_B × sizePct × overhead + ctx × KV_COEFF × bitScale)
  const perB =
    FP16_MB_PER_B * (info.size_pct_vs_fp16 / 100) * WEIGHT_OVERHEAD +
    contextTokens * KV_COEFF_FP16 * (Math.max(1, kvQuantBits) / 16);
  const raw = budgetMb / perB;
  return raw >= 1 ? Math.floor(raw * 10) / 10 : 0; // 0.1B resolution, floored
}

// ── CLI / self-test ──────────────────────────────────────────────────────────

function _selfTest() {
  const assert = require('assert');
  // Q4_K_M default fits a 7.6B model on a 24GB card at 8k ctx.
  const r = recommendQuant({ vramMb: 24576, paramsB: '7.6b', contextTokens: 8192 });
  assert.equal(r.fits, true);
  assert.equal(r.defaultFits, true);
  assert.equal(r.recommended, 'Q4_K_M');
  // Weight estimate calibrated to the known ~4.7GB qwen2.5-coder:7.6b Q4_K_M.
  const w = estimateWeightsMb(7.6, 'Q4_K_M');
  assert.ok(w > 4400 && w < 5000, `weights ${w} MiB out of calibrated band`);
  // A 32B model does NOT fit Q4_K_M on an 8GB card → recommend smaller or none.
  const tight = recommendQuant({ vramMb: 8192, paramsB: 32, contextTokens: 8192 });
  assert.equal(tight.defaultFits, false);
  // TurboQuant 3-bit KV shrinks the cache vs FP16.
  assert.ok(estimateKvCacheMb(32000, 7, 3) < estimateKvCacheMb(32000, 7, 16));
  // Inverse: a 24GB card fits a sizeable model at Q4_K_M.
  assert.ok(maxModelParamsB({ vramMb: 24576, quant: 'Q4_K_M' }) > 10);
  // Bad input rejected.
  assert.throws(() => recommendQuant({ vramMb: 0, paramsB: 7 }));
  console.log('quant-advisor self-test: OK');
}

function _cli(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self-test') return _selfTest();
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] !== undefined ? m[2] : argv[++i];
  }
  if (args.vram && args.params) {
    const r = recommendQuant({
      vramMb: Number(args.vram),
      paramsB: args.params,
      contextTokens: args.ctx ? Number(args.ctx) : undefined,
      headroomPct: args.headroom ? Number(args.headroom) : undefined,
      kvQuantBits: args['kv-bits'] ? Number(args['kv-bits']) : undefined,
    });
    if (args.json !== undefined) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`recommended: ${r.recommended}  (best-fitting: ${r.best || 'none'})`);
      console.log(`action:      ${r.action}`);
      console.log(`budget:      ${r.budgetMb} MiB  ·  weights ~${r.breakdown ? r.breakdown.weightsMb : '—'} MiB + KV ~${r.breakdown ? r.breakdown.kvCacheMb : '—'} MiB`);
      console.log(`fits:        ${r.fits_list.map((f) => `${f.quant}(${f.estVramMb}MiB)`).join(' ') || 'none'}`);
      console.log(`note:        ${r.note}`);
    }
    return;
  }
  console.log('usage: node quant-advisor.js --vram <MiB> --params <7b|32> [--ctx <tokens>] [--headroom <pct>] [--kv-bits <16|3>] [--json]');
  console.log('       node quant-advisor.js --self-test');
}

if (require.main === module) _cli(process.argv.slice(2));

module.exports = {
  FP16_MB_PER_B,
  WEIGHT_OVERHEAD,
  KV_COEFF_FP16,
  DEFAULT_HEADROOM_PCT,
  QUALITY_FLOOR,
  OLLAMA_DEFAULT,
  HW_TIER_VRAM_MB,
  HONEST_NOTE,
  toParamsB,
  estimateWeightsMb,
  estimateKvCacheMb,
  estimateTotalVramMb,
  recommendQuant,
  maxModelParamsB,
};
