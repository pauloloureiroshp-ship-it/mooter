#!/usr/bin/env node
'use strict';

/**
 * perf-validate.js — Wave perf-validation (WS2): run the 3-axis validation.
 *
 * Answers "does the routing strategy pay off, and by how much?" by positioning
 * Mooter against the RouterBench baselines (Oracle / BestSingle / Random /
 * all-Opus) on three axes:
 *
 *   💰 COST/TOKEN  — computed from pricing.js over a fixed corpus (deterministic).
 *   ⚡ SPEED       — read from speed-metrics.jsonl (measured locally by WS1) +
 *                    estimated for cloud tiers (estimateCloud, marked estimated).
 *   🎯 QUALITY     — read from mooter-quality-matrix.json (PRIOR curated A/B);
 *                    NOT re-run here (a fresh LLM-judge needs an API key). Every
 *                    quality number carries its provenance — measured vs prior.
 *
 * Honest by construction: COST is computed and reproducible (fixed corpus, frozen
 * classifier); SPEED separates measured-local from estimated-cloud; QUALITY is
 * labelled prior/curated, never presented as a fresh measurement. classify.js is
 * required READ-ONLY (frozen) — this script never touches the decision path.
 *
 * Usage:  node perf-validate.js            # human summary
 *         node perf-validate.js --json      # full results object
 *         node perf-validate.js --write     # also write audit/PERF_VALIDATION_RESULTS.json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { classify } = require('./classify.js'); // FROZEN — read-only require
const pricing = require('./pricing.js');
const speed = require('./speed-meter.js');

// ── Fixed corpus (reused from benchmark.sh — benchmark v2) ──────────────────
// 3 trivial · 3 simple · 3 medium · 3 complex. Documented N=12. The expected
// tier is the human-labelled minimum-viable tier → it doubles as the ORACLE.
const CORPUS = [
  { prompt: 'que horas são?', expected: 'T0' },
  { prompt: 'resume o que faz a função handleConnect', expected: 'T0' },
  { prompt: 'compara estes dois snippets de código rapidamente', expected: 'T0' },
  { prompt: 'gera uma commit message para esta mudança', expected: 'T0' },
  { prompt: 'escreve uma docstring para a função getUser', expected: 'T0' },
  { prompt: 'cria um regex para validar email', expected: 'T0' },
  { prompt: 'porque é que o websocket reconnect falha às vezes', expected: 'T2' },
  { prompt: 'investiga a causa raiz deste bug intermitente no STT', expected: 'T2' },
  { prompt: 'decompõe o sprint 9 em tarefas executáveis', expected: 'T2' },
  { prompt: 'refator a arquitetura do hub para suportar multi-tenant', expected: 'T3' },
  { prompt: 'audita o sistema de auth antes do deploy de produção', expected: 'T3' },
  { prompt: 'review final antes de fazer push para main', expected: 'T3' },
];

const TIERS = ['T0', 'T1', 'T2', 'T3'];

function round(n, d = 4) {
  if (!Number.isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}
function pct(n, d = 1) {
  return Number.isFinite(n) ? round(n * 100, d) : null;
}

// ── Classification (deterministic; frozen classifier) ───────────────────────
function classifyCorpus(corpus = CORPUS) {
  return corpus.map((c) => {
    let r = {};
    try {
      r = classify(c.prompt) || {};
    } catch {
      r = {};
    }
    return {
      prompt: c.prompt,
      promptLen: c.prompt.length,
      expected: c.expected,
      got: r.tier || null,
      category: r.task_category || null,
      model: r.recommended_model || null,
      confidence: typeof r.confidence === 'number' ? r.confidence : null,
    };
  });
}

// ── COST axis ───────────────────────────────────────────────────────────────
// Mooter routed cost vs the all-Opus baseline, per pricing.js. T0 → $0 (local).
function costAnalysis(rows) {
  const perTier = { T0: { n: 0, usd: 0 }, T1: { n: 0, usd: 0 }, T2: { n: 0, usd: 0 }, T3: { n: 0, usd: 0 } };
  let mooter = 0;
  let opus = 0;
  let correct = 0;
  for (const r of rows) {
    const tier = r.got || 'T3'; // unclassified → conservative (never undercount)
    const m = pricing.estimateTurnCost(tier, r.promptLen);
    const o = pricing.naiveOpusCost(r.promptLen);
    mooter += m;
    opus += o;
    if (perTier[tier]) {
      perTier[tier].n += 1;
      perTier[tier].usd += m;
    }
    if (r.got === r.expected) correct += 1;
  }
  for (const t of TIERS) perTier[t].usd = round(perTier[t].usd, 6);
  return {
    n: rows.length,
    mooter_usd: round(mooter, 6),
    opus_usd: round(opus, 6),
    saved_usd: round(opus - mooter, 6),
    saved_pct: opus > 0 ? pct((opus - mooter) / opus) : null,
    accuracy_pct: rows.length ? pct(correct / rows.length) : null,
    correct,
    perTier,
  };
}

// ── Baseline strategies for the Pareto frontier ─────────────────────────────
// Cost is computed for every strategy. Quality is attached only where evidence
// exists (all-Opus = reference; Mooter from A/B); single-model baselines are
// cost-only (quality not measured here) — flagged so the Pareto plot is honest.
function strategyCosts(rows) {
  const sumFixed = (tier) => rows.reduce((s, r) => s + pricing.estimateTurnCost(tier, r.promptLen), 0);
  const sumOracle = () => rows.reduce((s, r) => s + pricing.estimateTurnCost(r.expected, r.promptLen), 0);
  const sumRandom = () =>
    rows.reduce((s, r) => {
      const avg = TIERS.reduce((a, t) => a + pricing.estimateTurnCost(t, r.promptLen), 0) / TIERS.length;
      return s + avg;
    }, 0);
  const sumMooter = () => rows.reduce((s, r) => s + pricing.estimateTurnCost(r.got || 'T3', r.promptLen), 0);
  return {
    all_opus: { label: 'all-Opus (no router)', usd: round(sumFixed('T3'), 6) },
    all_sonnet: { label: 'BestSingle (all-Sonnet)', usd: round(sumFixed('T2'), 6) },
    all_haiku: { label: 'all-Haiku', usd: round(sumFixed('T1'), 6) },
    random: { label: 'Random tier', usd: round(sumRandom(), 6) },
    mooter: { label: 'Mooter (routed)', usd: round(sumMooter(), 6) },
    oracle: { label: 'Oracle (perfect routing)', usd: round(sumOracle(), 6) },
  };
}

// ── QUALITY axis (prior curated A/B — NOT re-run here) ───────────────────────
function loadQualityMatrix(p) {
  const file = p || path.join(__dirname, 'mooter-quality-matrix.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function qualityAnalysis(matrix) {
  if (!matrix || typeof matrix !== 'object') {
    return { available: false, source: 'mooter-quality-matrix.json (missing)' };
  }
  let wins = 0;
  let ties = 0;
  let losses = 0;
  const byCategory = {};
  for (const [key, v] of Object.entries(matrix)) {
    if (!v || typeof v !== 'object') continue;
    const w = Number(v.wins) || 0;
    const t = Number(v.ties) || 0;
    const l = Number(v.losses) || 0;
    wins += w;
    ties += t;
    losses += l;
    const cat = key.split(':').slice(1).join(':') || 'unknown';
    byCategory[cat] = byCategory[cat] || { wins: 0, ties: 0, losses: 0 };
    byCategory[cat].wins += w;
    byCategory[cat].ties += t;
    byCategory[cat].losses += l;
  }
  const total = wins + ties + losses;
  return {
    available: total > 0,
    source: 'mooter-quality-matrix.json (PRIOR curated A/B — not re-run this session)',
    note: 'local-model vs cloud A/B; win = local matched-or-beat cloud, tie = equivalent. '
      + 'A fresh LLM-judge run (randomised order + criterion-separated rubric + ensemble) '
      + 'requires an API key, which is absent here.',
    comparisons: total,
    wins,
    ties,
    losses,
    non_regression_pct: total ? pct((wins + ties) / total) : null, // local ≥ cloud
    win_pct: total ? pct(wins / total) : null,
    byCategory,
  };
}

// ── SPEED axis (measured local + estimated cloud) ───────────────────────────
function speedTable(opts = {}) {
  const recs = speed.readMetrics({ logPath: opts.speedLog });
  const localByModel = {};
  for (const r of recs) {
    if (!r || !r.model) continue;
    localByModel[r.model] = r; // newest wins (append-only order)
  }
  const local = Object.values(localByModel).map((r) => ({
    model: r.model,
    tier: 'T0',
    source: 'measured',
    estimated: false,
    warm: r.warm || null,
    cold: r.cold ? { ttft_ms: r.cold.ttft_ms, load_ms: r.cold.load_ms, tps: r.cold.tps } : null,
  }));
  const cloud = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6[1m]'].map((m) => {
    const e = speed.estimateCloud(m);
    return { model: m, tier: pricing.getPrice(m).tier || null, source: 'estimated', estimated: true, ttft_ms: e.ttft_ms, tps: e.tps, tpot_ms: e.tpot_ms, basis: e.basis };
  });
  return { local, cloud, has_local_measurement: local.length > 0 };
}

// ── Pareto positioning ──────────────────────────────────────────────────────
function paretoPoints(strat, quality) {
  const opus = strat.all_opus.usd || 0;
  const costPctOfOpus = (u) => (opus > 0 ? round((u / opus) * 100, 1) : null);
  // Quality: reference for all-Opus; Mooter from prior A/B non-regression; the
  // single-model baselines are cost-only (quality not measured) — flagged.
  const mooterQ = quality && quality.available ? quality.non_regression_pct : null;
  return [
    { strategy: 'Oracle (perfect)', cost_usd: strat.oracle.usd, cost_pct_of_opus: costPctOfOpus(strat.oracle.usd), quality_pct: 100, quality_basis: 'definitional (perfect routing preserves quality)' },
    { strategy: 'Mooter (routed)', cost_usd: strat.mooter.usd, cost_pct_of_opus: costPctOfOpus(strat.mooter.usd), quality_pct: mooterQ, quality_basis: 'prior curated A/B (non-regression %)' },
    { strategy: 'BestSingle (Sonnet)', cost_usd: strat.all_sonnet.usd, cost_pct_of_opus: costPctOfOpus(strat.all_sonnet.usd), quality_pct: null, quality_basis: 'cost-only (quality not measured here)' },
    { strategy: 'all-Haiku', cost_usd: strat.all_haiku.usd, cost_pct_of_opus: costPctOfOpus(strat.all_haiku.usd), quality_pct: null, quality_basis: 'cost-only (quality not measured here)' },
    { strategy: 'Random', cost_usd: strat.random.usd, cost_pct_of_opus: costPctOfOpus(strat.random.usd), quality_pct: null, quality_basis: 'cost-only (expected over uniform tier)' },
    { strategy: 'all-Opus (baseline)', cost_usd: strat.all_opus.usd, cost_pct_of_opus: 100, quality_pct: 100, quality_basis: 'reference baseline' },
  ];
}

// ── Assemble ────────────────────────────────────────────────────────────────
function run(opts = {}) {
  const rows = classifyCorpus(opts.corpus || CORPUS);
  const cost = costAnalysis(rows);
  const strat = strategyCosts(rows);
  const quality = qualityAnalysis(loadQualityMatrix(opts.qualityMatrix));
  const spd = speedTable({ speedLog: opts.speedLog });
  const pareto = paretoPoints(strat, quality);
  return {
    generated_at: new Date(opts.now || Date.now()).toISOString(),
    methodology: 'RouterBench Pareto baselines + NVIDIA/BentoML speed metrics (TTFT/TPOT/throughput). '
      + 'COST computed (frozen classifier + pricing.js); SPEED measured-local + estimated-cloud; '
      + 'QUALITY = prior curated A/B (not re-run). See docs/strategy/MOOTER_PERF_VALIDATION.md.',
    sample: { n: rows.length, source: 'benchmark v2 corpus (benchmark.sh): 3 trivial · 3 simple · 3 medium · 3 complex' },
    rows,
    cost,
    strategies: strat,
    quality,
    speed: spd,
    pareto,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function fmtUsd(n) {
  return n == null ? '—' : '$' + Number(n).toFixed(4);
}

function printSummary(res) {
  const c = res.cost;
  console.log('\n🐮 Mooter performance validation — 3 axes vs all-Opus  (N=' + res.sample.n + ' prompts)\n');
  console.log('💰 COST (computed · frozen classifier + pricing.js)');
  console.log('   Mooter routed: ' + fmtUsd(c.mooter_usd) + '   all-Opus: ' + fmtUsd(c.opus_usd));
  console.log('   saved: ' + fmtUsd(c.saved_usd) + '  (' + c.saved_pct + '%)   classifier accuracy: ' + c.accuracy_pct + '%');
  console.log('   per tier: ' + TIERS.map((t) => t + '=' + c.perTier[t].n).join(' · '));

  console.log('\n⚡ SPEED (local measured · cloud estimated)');
  if (res.speed.has_local_measurement) {
    for (const l of res.speed.local) {
      const w = l.warm || {};
      const cold = l.cold || {};
      console.log('   ' + l.model.padEnd(20) + ' warm ' + (w.tps == null ? '—' : w.tps + ' tok/s') + ' · TTFT ' + (w.ttft_ms == null ? '—' : w.ttft_ms + 'ms') + '   cold TTFT ' + (cold.ttft_ms == null ? '—' : cold.ttft_ms + 'ms'));
    }
  } else {
    console.log('   (no local measurement yet — run: node speed-meter.js --all)');
  }
  for (const cl of res.speed.cloud) {
    console.log('   ' + cl.model.padEnd(20) + ' ~' + cl.tps + ' tok/s · TTFT ~' + cl.ttft_ms + 'ms   [estimated]');
  }

  console.log('\n🎯 QUALITY (' + (res.quality.available ? 'prior curated A/B — not re-run' : 'unavailable') + ')');
  if (res.quality.available) {
    console.log('   comparisons: ' + res.quality.comparisons + '   local ≥ cloud (non-regression): ' + res.quality.non_regression_pct + '%   win: ' + res.quality.win_pct + '%');
  }

  console.log('\n📈 PARETO (cost as % of all-Opus · quality where measured)');
  for (const p of res.pareto) {
    console.log('   ' + p.strategy.padEnd(22) + ' ' + fmtUsd(p.cost_usd) + '  (' + p.cost_pct_of_opus + '% of Opus)  quality ' + (p.quality_pct == null ? '— (cost-only)' : p.quality_pct + '%'));
  }
  console.log('');
}

function main() {
  const argv = process.argv.slice(2);
  const res = run({});
  if (argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    printSummary(res);
  }
  if (argv.includes('--write')) {
    const out = path.join(__dirname, '..', '..', 'audit', 'PERF_VALIDATION_RESULTS.json');
    try {
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(res, null, 2) + '\n', 'utf8');
      console.error('wrote ' + out);
    } catch (e) {
      // Fallback to scratch — never fail the run on a write error.
      const alt = path.join(os.tmpdir(), 'PERF_VALIDATION_RESULTS.json');
      try {
        fs.writeFileSync(alt, JSON.stringify(res, null, 2) + '\n', 'utf8');
        console.error('wrote ' + alt + ' (repo path failed: ' + ((e && e.message) || e) + ')');
      } catch {
        /* give up silently — summary already printed */
      }
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('perf-validate:', (e && e.message) || e);
    process.exit(0);
  }
}

module.exports = {
  CORPUS,
  TIERS,
  classifyCorpus,
  costAnalysis,
  strategyCosts,
  loadQualityMatrix,
  qualityAnalysis,
  speedTable,
  paretoPoints,
  run,
};
