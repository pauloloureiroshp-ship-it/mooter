#!/usr/bin/env node
/**
 * update-metrics.js — reads decisions.log and writes metrics-snapshot.json
 *
 * Solves the "1,437 forever" problem: the corpus count in README/docs was
 * a manual snapshot from 2026-04-09. This script derives the REAL current
 * count from the actual decisions.log on the machine and writes a JSON file
 * that can be consumed by:
 *   - backtest.js (calls at end of each run)
 *   - savings-tracker.js (adds /corpus endpoint)
 *   - README badge update scripts
 *   - mooter-hub (POST to /submit-events)
 *
 * Output: ~/.claude/tools/router/metrics-snapshot.json
 *
 * Usage:
 *   node update-metrics.js              # writes snapshot
 *   node update-metrics.js --print      # pretty-prints to stdout only
 *   node update-metrics.js --readme     # also patches README.md corpus count
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const SNAPSHOT_PATH = path.join(ROUTER_DIR, 'metrics-snapshot.json');
const GOLD_LABELS_PATH = path.join(ROUTER_DIR, 'gold-labels.json');

// Attempt to find repo README to patch corpus count
const REPO_README_CANDIDATES = [
  path.join(os.homedir(), 'frugal', 'README.md'),
  path.join(os.homedir(), 'Documents', 'frugal', 'README.md'),
  path.join(process.cwd(), 'README.md'),
];

const args = process.argv.slice(2);
const PRINT_ONLY = args.includes('--print');
const PATCH_README = args.includes('--readme');

// ── Load decisions ──────────────────────────────────────────────────────────

function loadDecisions() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

// ── Load gold labels ─────────────────────────────────────────────────────────

function loadGoldLabels() {
  if (!fs.existsSync(GOLD_LABELS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(GOLD_LABELS_PATH, 'utf8'));
  } catch { return []; }
}

// ── Analyse ──────────────────────────────────────────────────────────────────

function analyse(decisions) {
  // Only classification events (not turn_end, not hub events)
  const classified = decisions.filter(d =>
    d.event === 'classified' || (!d.event && d.tier)
  );

  // By tier
  const byTier = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const byModel = {};
  const confidences = [];
  const tierChanges = { tuned_demote: 0, tuned_promote: 0, low_conf_escalation: 0, budget_cap: 0 };

  for (const d of classified) {
    const tier = d.tier || 'T0';
    if (byTier[tier] !== undefined) byTier[tier]++;
    else byTier[tier] = 1;

    const model = d.recommended_model || d.model || 'unknown';
    byModel[model] = (byModel[model] || 0) + 1;

    if (d.confidence != null) confidences.push(d.confidence);

    const rule = d.escalation_rule || '';
    if (rule.includes('tuned_demote')) tierChanges.tuned_demote++;
    if (rule.includes('tuned_promote')) tierChanges.tuned_promote++;
    if (rule.includes('low_conf')) tierChanges.low_conf_escalation++;
    if (rule.includes('budget')) tierChanges.budget_cap++;
  }

  const total = classified.length;
  const avgConf = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : null;

  // Date range
  const timestamps = classified
    .map(d => d.ts)
    .filter(Boolean)
    .sort();
  const firstTs = timestamps[0] || null;
  const lastTs = timestamps[timestamps.length - 1] || null;

  // Naive vs real cost estimation (simple model)
  const COST = { T0: 0, T1: 0.001, T2: 0.010, T3: 0.050 };
  const NAIVE = 0.050; // Opus cost
  let realCost = 0;
  let naiveCost = 0;
  for (const d of classified) {
    const promptLen = d.prompt_len || 200;
    const tier = d.tier || 'T0';
    const factor = promptLen / 200;
    realCost += (COST[tier] || 0) * factor;
    naiveCost += NAIVE * factor;
  }
  const savedUsd = naiveCost - realCost;
  const savedPct = naiveCost > 0 ? (savedUsd / naiveCost) * 100 : 0;

  return {
    corpus_size: total,
    by_tier: byTier,
    by_tier_pct: Object.fromEntries(
      Object.entries(byTier).map(([t, n]) => [t, total > 0 ? Math.round(n / total * 1000) / 10 : 0])
    ),
    by_model: byModel,
    avg_confidence: avgConf != null ? Math.round(avgConf * 1000) / 1000 : null,
    tier_changes: tierChanges,
    cost: {
      naive_usd: Math.round(naiveCost * 100) / 100,
      real_usd: Math.round(realCost * 100) / 100,
      saved_usd: Math.round(savedUsd * 100) / 100,
      saved_pct: Math.round(savedPct * 10) / 10,
    },
    date_range: { first: firstTs, last: lastTs },
    generated_at: new Date().toISOString(),
  };
}

// ── Gold label accuracy ───────────────────────────────────────────────────────

function goldAccuracy(labels) {
  if (!labels.length) return null;
  // gold-labels.json format: [{ prompt, expected_tier }, ...]
  // We can't re-run classify here without spawning, so just report count
  return {
    count: labels.length,
    note: 'Run: node replay.js --gold-labels for live accuracy'
  };
}

// ── Patch README ──────────────────────────────────────────────────────────────

function patchReadme(corpusSize) {
  let readmePath = null;
  for (const candidate of REPO_README_CANDIDATES) {
    if (fs.existsSync(candidate)) { readmePath = candidate; break; }
  }
  if (!readmePath) {
    console.warn('[update-metrics] README not found, skipping patch');
    return false;
  }

  let content = fs.readFileSync(readmePath, 'utf8');
  const before = content;

  // Replace patterns like "1,437 real prompts" or "1,437 prompts" or "1437 prompts"
  content = content.replace(
    /(\d{1,3}(?:,\d{3})*)\s+(real\s+)?prompt(s)?/g,
    (_match, _num, real, plural) => {
      const formatted = corpusSize.toLocaleString('en-US');
      return `${formatted} ${real || ''}prompt${plural || ''}`;
    }
  );

  if (content === before) {
    console.log('[update-metrics] README: no corpus count found to patch');
    return false;
  }

  fs.writeFileSync(readmePath, content, 'utf8');
  console.log(`[update-metrics] README patched → corpus: ${corpusSize.toLocaleString()}`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const decisions = loadDecisions();
  const gold = loadGoldLabels();
  const stats = analyse(decisions);
  const goldStats = goldAccuracy(gold);

  const snapshot = {
    ...stats,
    gold_labels: goldStats,
  };

  if (PRINT_ONLY) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  // Write snapshot
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');

  // Human-readable summary
  const { corpus_size, by_tier_pct, cost, avg_confidence } = snapshot;
  console.log('');
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  frugal — metrics-snapshot.json                     │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log(`│  Corpus (decisions.log):  ${String(corpus_size).padEnd(26)}│`);
  console.log(`│  T0: ${String(by_tier_pct.T0 + '%').padEnd(6)}  T1: ${String(by_tier_pct.T1 + '%').padEnd(6)}  T2: ${String(by_tier_pct.T2 + '%').padEnd(6)}  T3: ${String(by_tier_pct.T3 + '%').padEnd(4)}│`);
  console.log(`│  Avg confidence:          ${String(avg_confidence || 'n/a').padEnd(26)}│`);
  console.log(`│  Naive cost:              $${String(cost.naive_usd).padEnd(25)}│`);
  console.log(`│  Real cost:               $${String(cost.real_usd).padEnd(25)}│`);
  console.log(`│  Saved:                   $${cost.saved_usd} (${cost.saved_pct}%)${' '.repeat(Math.max(0, 16 - String(cost.saved_usd).length - String(cost.saved_pct).length))}│`);
  console.log(`│  Gold labels:             ${String(gold.length + ' curados').padEnd(26)}│`);
  console.log('└─────────────────────────────────────────────────────┘');
  console.log(`\n  Written: ${SNAPSHOT_PATH}`);

  if (PATCH_README) {
    patchReadme(corpus_size);
  }
}

main();
