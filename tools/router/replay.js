#!/usr/bin/env node
/**
 * replay.js — replay historical Claude Code prompts through the classifier
 * to produce statistically-meaningful validation data.
 *
 * Reads ~/.claude/history.jsonl (Claude Code stores every user prompt here),
 * runs each through classify.js, and produces:
 *   - tier distribution
 *   - category distribution
 *   - confidence histogram
 *   - estimated cost savings vs naive Opus baseline
 *   - low-confidence prompts (tuning candidates)
 *   - per-project breakdown
 *
 * Usage:
 *   node replay.js                          # full corpus, console output
 *   node replay.js --json out.json          # machine-readable to file
 *   node replay.js --substantive            # filter out trivial slash-cmds + cd
 *   node replay.js --top-low-conf 30        # show top N low-conf for tuning
 *   node replay.js --per-project            # per-project breakdown
 *   node replay.js --gold-labels            # validate against gold-labels.json
 *   node replay.js --gold-labels path.json  # validate against custom labels file
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HISTORY = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude', 'history.jsonl'
);
const CLASSIFY = path.join(__dirname, 'classify.js');

// Inline the classifier logic for speed (avoids 1370 subprocess spawns).
// We `require` the classify module by re-implementing the classify() function
// inline via dynamic eval — but cleaner: just shell out to classify.js once
// per prompt is too slow. Instead we hot-load classify.js.
//
// classify.js doesn't export — it runs (async IIFE). So we read its source,
// strip the IIFE, and eval the function body. Hacky but contained to this tool.
const classifySrc = fs.readFileSync(CLASSIFY, 'utf8');
// v0.9 fix: take everything from the first 'use strict' (or start-of-file)
// up to the async IIFE at the bottom. Strip the IIFE and export classify().
// This is robust to new helpers being added to classify.js.
const iifeIdx = classifySrc.search(/\(async \(\) => \{/);
if (iifeIdx < 0) {
  console.error('Failed to locate classify.js IIFE — has the file shape changed?');
  process.exit(2);
}
// Strip shebang line — `new Function()` does not accept it.
const classifyBody = classifySrc.slice(0, iifeIdx).replace(/^#!.*\n/, '');
// eslint-disable-next-line no-new-func
// classify.js declares its own `const fs = require('fs')` etc. at the top,
// so we only need to inject `require` itself (new Function has no closure
// over the module-level require). The const declarations inside the body
// will call that injected require to rebuild fs/path/crypto/os.
const classify = new Function('require', `
  ${classifyBody}
  return classify;
`)(require);

// ─────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argi = (k) => args.indexOf(k);
const wantJson = argi('--json') >= 0;
const jsonOut = wantJson ? args[argi('--json') + 1] : null;
const substantive = argi('--substantive') >= 0;
const topLowConf = argi('--top-low-conf') >= 0 ? parseInt(args[argi('--top-low-conf') + 1], 10) : 0;
const perProject = argi('--per-project') >= 0;
const goldLabelsMode = argi('--gold-labels') >= 0;
const goldLabelsPath = goldLabelsMode
  ? (args[argi('--gold-labels') + 1] && !args[argi('--gold-labels') + 1].startsWith('--')
      ? args[argi('--gold-labels') + 1]
      : path.join(__dirname, 'gold-labels.json'))
  : null;

// ─────────────────────────────────────────────────────────────
// Pricing model (early-2026 estimates, output tokens only)
// ─────────────────────────────────────────────────────────────
const PRICE = {
  'claude-opus-4-6': 15.0,
  'claude-sonnet-4-6': 3.0,
  'claude-haiku-4-5-20251001': 0.80,
  'qwen2.5:3b': 0,
  'qwen3:30b': 0,
};

// Calibrated avg output tokens per tier from real demo data
const AVG_OUT_TOK = { T0: 200, T1: 350, T2: 600, T3: 1200 };

// Naive baseline: assume Opus would have produced its typical output length
// for EVERY prompt regardless of tier. This is the fair apples-to-apples
// comparison: "what would I have spent if I ran every prompt through Opus?"
const NAIVE_OPUS_TOK_PER_PROMPT = 600;

// ─────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────
function isTrivialCommand(p) {
  if (!p) return true;
  const t = p.trim();
  if (t.length < 4) return true;
  if (/^\/(cd|exit|clear|help|model|status|cost|init|review|compact)\b/i.test(t)) return true;
  if (/^![a-z\-]+/.test(t)) return true;     // shell escape
  if (/^cd\s/i.test(t)) return true;
  if (t === 'y' || t === 'n' || t === 'yes' || t === 'no') return true;
  return false;
}

// ─────────────────────────────────────────────────────────────
// Gold labels validation mode
// ─────────────────────────────────────────────────────────────
if (goldLabelsMode) {
  if (!fs.existsSync(goldLabelsPath)) {
    console.error(`Gold labels file not found: ${goldLabelsPath}`);
    process.exit(2);
  }
  const labels = JSON.parse(fs.readFileSync(goldLabelsPath, 'utf8'));
  const mismatches = [];
  const byTierExpected = {};
  const byTierCorrect = {};

  for (const label of labels) {
    const d = classify(label.prompt);
    const got = d.tier;
    const expected = label.expected_tier;
    byTierExpected[expected] = (byTierExpected[expected] || 0) + 1;
    if (got === expected) {
      byTierCorrect[expected] = (byTierCorrect[expected] || 0) + 1;
    } else {
      mismatches.push({
        id: label.id,
        expected,
        got,
        confidence: d.confidence,
        prompt: label.prompt,
      });
    }
  }

  const total = labels.length;
  const correct = total - mismatches.length;
  const accuracy = ((correct / total) * 100).toFixed(1);

  console.log('');
  console.log(`Gold labels validation: ${correct}/${total} correct (${accuracy}%)`);
  console.log('');

  if (mismatches.length > 0) {
    console.log('Mismatches:');
    for (const m of mismatches) {
      console.log(`  ${m.id}: expected ${m.expected}, got ${m.got} (confidence: ${m.confidence}) — "${m.prompt.slice(0, 80)}"`);
    }
    console.log('');
  }

  console.log('Precision by tier:');
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const exp = byTierExpected[t] || 0;
    const cor = byTierCorrect[t] || 0;
    const pct = exp > 0 ? ((cor / exp) * 100).toFixed(0) : 'N/A';
    console.log(`  ${t}: ${cor}/${exp} (${pct}%)`);
  }
  console.log('');

  process.exit(parseFloat(accuracy) >= 85.0 ? 0 : 1);
}

// ─────────────────────────────────────────────────────────────
// Load + process
// ─────────────────────────────────────────────────────────────
if (!fs.existsSync(HISTORY)) {
  console.error(`No history file at ${HISTORY}`);
  process.exit(1);
}

const lines = fs.readFileSync(HISTORY, 'utf8').split('\n').filter(Boolean);
const all = [];
for (const line of lines) {
  try {
    const j = JSON.parse(line);
    if (!j.display) continue;
    all.push(j);
  } catch { /* skip malformed */ }
}

const corpus = substantive ? all.filter((e) => !isTrivialCommand(e.display)) : all;

// Run classifier on each prompt
const decisions = corpus.map((e) => {
  const d = classify(e.display);
  return {
    project: (e.project || 'unknown').split(/[\\/]/).pop(),
    timestamp: e.timestamp,
    prompt: e.display,
    prompt_len: e.display.length,
    tier: d.tier,
    category: d.task_category,
    backend: d.recommended_backend,
    model: d.recommended_model,
    confidence: d.confidence,
  };
});

// ─────────────────────────────────────────────────────────────
// Aggregations
// ─────────────────────────────────────────────────────────────
const byTier = {};
const byCategory = {};
const byBackend = {};
const byProject = {};
const confBuckets = { '0.0-0.5': 0, '0.5-0.6': 0, '0.6-0.7': 0, '0.7-0.8': 0, '0.8-0.9': 0, '0.9-1.0': 0 };
let actualCost = 0;
let naiveCost = 0;
const lowConf = [];

for (const d of decisions) {
  byTier[d.tier] = (byTier[d.tier] || 0) + 1;
  byCategory[d.category] = (byCategory[d.category] || 0) + 1;
  byBackend[d.backend] = (byBackend[d.backend] || 0) + 1;
  byProject[d.project] = byProject[d.project] || { total: 0, tiers: {} };
  byProject[d.project].total++;
  byProject[d.project].tiers[d.tier] = (byProject[d.project].tiers[d.tier] || 0) + 1;

  const c = d.confidence;
  if (c < 0.5) confBuckets['0.0-0.5']++;
  else if (c < 0.6) confBuckets['0.5-0.6']++;
  else if (c < 0.7) confBuckets['0.6-0.7']++;
  else if (c < 0.8) confBuckets['0.7-0.8']++;
  else if (c < 0.9) confBuckets['0.8-0.9']++;
  else confBuckets['0.9-1.0']++;

  const tok = AVG_OUT_TOK[d.tier] || 500;
  actualCost += (tok * (PRICE[d.model] || 0)) / 1e6;
  // Apples-to-apples: assume naive user runs every prompt through Opus at
  // typical output length (~600 tok). Independent of mediator's chosen tier.
  naiveCost += (NAIVE_OPUS_TOK_PER_PROMPT * PRICE['claude-opus-4-6']) / 1e6;

  if (c < 0.6) lowConf.push(d);
}

const total = decisions.length;
const savings = naiveCost - actualCost;
const savingsPct = naiveCost > 0 ? (savings / naiveCost) * 100 : 0;
const localPct = ((byBackend['ollama'] || 0) / total) * 100;
const opusPct = ((byTier['T3'] || 0) / total) * 100;

// ─────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────
const summary = {
  corpus: HISTORY,
  total_prompts_in_history: all.length,
  filter_substantive: substantive,
  prompts_classified: total,
  by_tier: byTier,
  by_category: byCategory,
  by_backend: byBackend,
  confidence_histogram: confBuckets,
  per_project: perProject ? byProject : undefined,
  cost_estimate: {
    avg_output_tok_per_tier: AVG_OUT_TOK,
    actual_cost_usd: +actualCost.toFixed(4),
    naive_opus_cost_usd: +naiveCost.toFixed(4),
    savings_usd: +savings.toFixed(4),
    savings_pct: +savingsPct.toFixed(1),
  },
  metrics: {
    local_routing_pct: +localPct.toFixed(1),
    opus_routing_pct: +opusPct.toFixed(1),
    low_confidence_pct: +((lowConf.length / total) * 100).toFixed(1),
  },
  low_confidence_top: lowConf.slice(0, topLowConf || 20).map((d) => ({
    confidence: d.confidence,
    tier: d.tier,
    category: d.category,
    prompt: d.prompt.slice(0, 120),
  })),
};

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
  console.log(`wrote ${jsonOut} (${total} prompts classified)`);
  process.exit(0);
}

// Pretty print
const max = (o) => Math.max(...Object.values(o));
const bar = (n, m, w = 40) => '█'.repeat(Math.round((n / m) * w)).padEnd(w, '░');

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║   Claude Code Router — REAL CORPUS VALIDATION (history.jsonl)   ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Corpus: ${HISTORY}`);
console.log(`Total prompts in history:   ${all.length}`);
console.log(`Substantive filter:         ${substantive ? 'ON (skips slash-cmds + cd)' : 'OFF'}`);
console.log(`Prompts classified:         ${total}`);
console.log('');

console.log('Tier distribution:');
const maxT = max(byTier);
for (const t of ['T0', 'T1', 'T2', 'T3']) {
  const n = byTier[t] || 0;
  const pct = ((n / total) * 100).toFixed(1);
  console.log(`  ${t}  ${bar(n, maxT)} ${String(n).padStart(5)} (${pct}%)`);
}
console.log('');

console.log('Top categories:');
const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
const maxC = cats[0][1];
for (const [c, n] of cats) {
  const pct = ((n / total) * 100).toFixed(1);
  console.log(`  ${c.padEnd(32)} ${bar(n, maxC, 25)} ${String(n).padStart(5)} (${pct}%)`);
}
console.log('');

console.log('Backend mix:');
for (const [b, n] of Object.entries(byBackend).sort((a, b) => b[1] - a[1])) {
  const pct = ((n / total) * 100).toFixed(1);
  console.log(`  ${b.padEnd(20)} ${String(n).padStart(5)} (${pct}%)`);
}
console.log('');

console.log('Confidence histogram:');
const maxB = max(confBuckets);
for (const [k, v] of Object.entries(confBuckets)) {
  const pct = ((v / total) * 100).toFixed(1);
  console.log(`  ${k}  ${bar(v, maxB, 25)} ${String(v).padStart(5)} (${pct}%)`);
}
console.log('');

console.log('💰 Cost projection (output tokens, full corpus):');
console.log(`  Mediator path:    $${actualCost.toFixed(4)}`);
console.log(`  Naive Opus path:  $${naiveCost.toFixed(4)}`);
console.log(`  ─────────────────────────────────`);
console.log(`  💵 SAVINGS:       $${savings.toFixed(4)}  (${savingsPct.toFixed(1)}%)`);
console.log('');
console.log(`  Local routing %:  ${localPct.toFixed(1)}%`);
console.log(`  Opus routing %:   ${opusPct.toFixed(1)}%`);
console.log(`  Low-conf %:       ${((lowConf.length / total) * 100).toFixed(1)}%`);
console.log('');

if (perProject) {
  console.log('Per-project breakdown:');
  const projs = Object.entries(byProject).sort((a, b) => b[1].total - a[1].total).slice(0, 10);
  for (const [p, info] of projs) {
    const tDist = ['T0', 'T1', 'T2', 'T3'].map((t) => `${t}=${info.tiers[t] || 0}`).join(' ');
    console.log(`  ${p.padEnd(30)} n=${String(info.total).padStart(4)}   ${tDist}`);
  }
  console.log('');
}

if (topLowConf > 0 && lowConf.length > 0) {
  console.log(`⚠  Top ${Math.min(topLowConf, lowConf.length)} low-confidence prompts (tuning candidates):`);
  for (const d of lowConf.slice(0, topLowConf)) {
    console.log(`  [${d.confidence}] [${d.tier}] ${d.prompt.slice(0, 100).replace(/\s+/g, ' ')}`);
  }
  console.log('');
}
