#!/usr/bin/env node
/**
 * backtest.js — analyses ~/.claude/tools/router/decisions.log to discover
 * patterns where the classifier is over- or under-routing, and writes
 * router-tuning.json with concrete tuning suggestions.
 *
 * Output: ~/.claude/tools/router/router-tuning.json
 *         + human-readable report on stdout
 *
 * Pure stdlib. Run daily via scheduled task or `node backtest.js`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const TUNING_PATH = path.join(ROUTER_DIR, 'router-tuning.json');

// Naive cost per prompt (Opus baseline) vs actual tier
const TIER_COST = { T0: 0.0, T1: 0.002, T2: 0.008, T3: 0.045 };
const NAIVE_COST = TIER_COST.T3;

function loadDecisions() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

// Pattern signature: lowercased first 3 meaningful words
function signature(preview) {
  return (preview || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
}

function analyze(decisions) {
  const total = decisions.length;
  const byTier = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const sigToTiers = new Map(); // signature -> [tier...]
  const shortHighTier = []; // <50 chars on T2/T3
  const lowConfHighTier = []; // confidence < 0.6 on T2/T3 (escalation noise)

  for (const d of decisions) {
    const tier = d.tier || 'T3';
    byTier[tier] = (byTier[tier] || 0) + 1;
    const sig = signature(d.prompt_preview);
    if (sig) {
      if (!sigToTiers.has(sig)) sigToTiers.set(sig, []);
      sigToTiers.get(sig).push({ tier, conf: d.confidence, len: d.prompt_len });
    }
    if ((d.prompt_len || 0) < 50 && (tier === 'T2' || tier === 'T3')) {
      shortHighTier.push(d);
    }
    if ((d.confidence || 0) < 0.6 && (tier === 'T2' || tier === 'T3')) {
      lowConfHighTier.push(d);
    }
  }

  // Repeated signatures: same first words seen ≥3 times always at T2/T3
  const repeated = [];
  for (const [sig, hits] of sigToTiers.entries()) {
    if (hits.length < 3) continue;
    const allHigh = hits.every(h => h.tier === 'T2' || h.tier === 'T3');
    if (allHigh) repeated.push({ sig, count: hits.length, tiers: hits.map(h => h.tier) });
  }
  repeated.sort((a, b) => b.count - a.count);

  // Top 3 demote candidates: signatures that appear in shortHighTier
  const demoteCandidates = new Map();
  for (const d of shortHighTier) {
    const sig = signature(d.prompt_preview);
    if (!sig) continue;
    demoteCandidates.set(sig, (demoteCandidates.get(sig) || 0) + 1);
  }
  const topDemote = [...demoteCandidates.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sig, count]) => ({ pattern: sig, count }));

  // Promote-to-T0 patterns: short prompts (<30 chars) repeatedly classified
  // T2/T3 with low confidence — almost certainly noise (status pastes, "ok", etc.)
  const promoteCandidates = new Set();
  for (const d of lowConfHighTier) {
    if ((d.prompt_len || 0) < 30) {
      const sig = signature(d.prompt_preview);
      if (sig) promoteCandidates.add(sig);
    }
  }

  // Cost analysis: actual vs naive vs ideal-if-demoted
  let actualCost = 0;
  let idealCost = 0;
  for (const d of decisions) {
    const t = d.tier || 'T3';
    actualCost += TIER_COST[t] || 0;
    // ideal: if it was a demote candidate, drop one tier
    const sig = signature(d.prompt_preview);
    const isDemote = demoteCandidates.has(sig);
    if (isDemote && t === 'T3') idealCost += TIER_COST.T2;
    else if (isDemote && t === 'T2') idealCost += TIER_COST.T1;
    else idealCost += TIER_COST[t] || 0;
  }
  const naiveCost = total * NAIVE_COST;
  const additionalSavings = Math.max(0, actualCost - idealCost);

  return {
    total,
    byTier,
    naiveCost,
    actualCost,
    idealCost,
    additionalSavings,
    shortHighTier: shortHighTier.length,
    lowConfHighTier: lowConfHighTier.length,
    repeated: repeated.slice(0, 10),
    topDemote,
    promoteToT0: [...promoteCandidates],
  };
}

function buildTuning(stats) {
  // Heuristic: if >5% of prompts are short+high-tier, tighten the threshold
  const noiseRatio = stats.total ? stats.shortHighTier / stats.total : 0;
  const complexity_threshold = noiseRatio > 0.1 ? 0.25 : noiseRatio > 0.05 ? 0.3 : 0.35;
  return {
    generated_at: new Date().toISOString(),
    sample_size: stats.total,
    complexity_threshold,
    promote_to_t0_patterns: stats.promoteToT0,
    demote_from_t3_patterns: stats.topDemote.map(d => d.pattern),
    notes: [
      `Analysed ${stats.total} prompts.`,
      `Short prompts on high tier: ${stats.shortHighTier} (${(noiseRatio * 100).toFixed(1)}%).`,
      `Estimated additional savings if patterns demoted: $${stats.additionalSavings.toFixed(4)}.`,
    ],
  };
}

function report(stats, tuning) {
  const lines = [];
  lines.push('frugal — router backtest');
  lines.push('');
  lines.push(`Sample size:        ${stats.total} prompts`);
  lines.push(`Naive cost (T3):    $${stats.naiveCost.toFixed(4)}`);
  lines.push(`Actual cost:        $${stats.actualCost.toFixed(4)}`);
  lines.push(`Ideal (post-tune):  $${stats.idealCost.toFixed(4)}`);
  lines.push(`Additional savings: $${stats.additionalSavings.toFixed(4)}`);
  lines.push('');
  lines.push('Tier distribution:');
  for (const t of ['T0', 'T1', 'T2', 'T3']) {
    const n = stats.byTier[t] || 0;
    const pct = stats.total ? ((n / stats.total) * 100).toFixed(1) : '0.0';
    lines.push(`  ${t}  ${String(n).padStart(4)}  (${pct}%)`);
  }
  lines.push('');
  lines.push(`Short prompts on T2/T3:  ${stats.shortHighTier}`);
  lines.push(`Low-conf on T2/T3:        ${stats.lowConfHighTier}`);
  lines.push('');
  lines.push('Top 3 demote candidates (short + high tier):');
  if (stats.topDemote.length === 0) lines.push('  (none)');
  for (const d of stats.topDemote) {
    lines.push(`  "${d.pattern}"  ×${d.count}`);
  }
  lines.push('');
  lines.push('Repeated signatures always on T2/T3 (≥3 hits):');
  if (stats.repeated.length === 0) lines.push('  (none)');
  for (const r of stats.repeated.slice(0, 5)) {
    lines.push(`  "${r.sig}"  ×${r.count}`);
  }
  lines.push('');
  lines.push(`Tuning written: ${TUNING_PATH}`);
  lines.push(`  complexity_threshold: ${tuning.complexity_threshold}`);
  lines.push(`  promote_to_t0_patterns: ${tuning.promote_to_t0_patterns.length}`);
  lines.push(`  demote_from_t3_patterns: ${tuning.demote_from_t3_patterns.length}`);
  return lines.join('\n');
}

function main() {
  const decisions = loadDecisions();
  if (decisions.length === 0) {
    console.log('frugal backtest: decisions.log empty or missing.');
    process.exit(0);
  }
  const stats = analyze(decisions);
  const tuning = buildTuning(stats);
  fs.writeFileSync(TUNING_PATH, JSON.stringify(tuning, null, 2));
  console.log(report(stats, tuning));
}

if (require.main === module) main();
module.exports = { analyze, buildTuning, signature };
