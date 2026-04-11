#!/usr/bin/env node
/**
 * stats.js — analyze decisions.log and print router efficiency report.
 *
 * Usage:
 *   node ~/.claude/tools/router/stats.js
 *   node ~/.claude/tools/router/stats.js --since 2026-04-06
 *   node ~/.claude/tools/router/stats.js --json
 *
 * Reads JSONL from ~/.claude/tools/router/decisions.log and computes:
 *   - distribution by tier
 *   - distribution by category
 *   - estimated tokens saved vs naive Opus baseline
 *   - top low-confidence prompts (tuning candidates)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.claude', 'tools', 'router', 'decisions.log'
);

// Cost computation — delegated to pricing.js (single source of truth).
// Previously stats.js had its own (broken) cost math: it multiplied
// AVG_OUTPUT_TOK × INPUT_PRICE which understated savings. Now uses
// pricing.estimateTurnCost which correctly accounts for input + output.
const pricing = require('./pricing');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const sinceIdx = args.indexOf('--since');
const since = sinceIdx >= 0 ? new Date(args[sinceIdx + 1]) : null;

if (!fs.existsSync(LOG)) {
  console.error(`No decisions log at ${LOG}`);
  console.error('The router has not classified any prompts yet, or telemetry is disabled.');
  process.exit(1);
}

const lines = fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean);
const entries = lines
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean)
  .filter((e) => e.event === 'classified')
  .filter((e) => !since || new Date(e.ts) >= since);

if (entries.length === 0) {
  console.error('No classified entries in log.');
  process.exit(1);
}

// distributions
const byTier = {};
const byCategory = {};
const byBackend = {};
let savedTokOpus = 0;
let actualCostUSD = 0;
let naiveOpusCostUSD = 0;
const lowConf = [];

for (const e of entries) {
  byTier[e.tier] = (byTier[e.tier] || 0) + 1;
  byCategory[e.task_category] = (byCategory[e.task_category] || 0) + 1;
  byBackend[e.recommended_backend] = (byBackend[e.recommended_backend] || 0) + 1;

  const promptLen = e.prompt_length || e.prompt_len || 200;
  actualCostUSD += pricing.estimateTurnCost(e.tier, promptLen);
  naiveOpusCostUSD += pricing.naiveOpusCost(promptLen);
  if (e.tier !== 'T3') savedTokOpus += pricing.AVG_OUTPUT_TOK[e.tier] || 500;

  if (e.confidence < 0.6) {
    lowConf.push({ ts: e.ts, conf: e.confidence, preview: e.prompt_preview });
  }
}

const total = entries.length;
const savings = naiveOpusCostUSD - actualCostUSD;
const savingsPct = naiveOpusCostUSD > 0 ? (savings / naiveOpusCostUSD) * 100 : 0;

if (wantJson) {
  console.log(JSON.stringify({
    total_decisions: total,
    by_tier: byTier,
    by_category: byCategory,
    by_backend: byBackend,
    actual_cost_usd: +actualCostUSD.toFixed(4),
    naive_opus_cost_usd: +naiveOpusCostUSD.toFixed(4),
    savings_usd: +savings.toFixed(4),
    savings_pct: +savingsPct.toFixed(1),
    low_confidence_count: lowConf.length,
  }, null, 2));
  process.exit(0);
}

// pretty print
const bar = (n, max, w = 30) => '█'.repeat(Math.round((n / max) * w)) + '░'.repeat(w - Math.round((n / max) * w));
const max = (o) => Math.max(...Object.values(o));

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║        Claude Code Router — Efficiency Report             ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`Total decisions classified: ${total}`);
if (since) console.log(`Since: ${since.toISOString()}`);
console.log('');

console.log('Distribution by tier:');
for (const t of ['T0', 'T1', 'T2', 'T3']) {
  const n = byTier[t] || 0;
  const pct = ((n / total) * 100).toFixed(1);
  console.log(`  ${t}  ${bar(n, max(byTier))} ${String(n).padStart(4)} (${pct}%)`);
}
console.log('');

console.log('Top categories:');
const cats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 6);
for (const [c, n] of cats) {
  const pct = ((n / total) * 100).toFixed(1);
  console.log(`  ${c.padEnd(30)} ${String(n).padStart(4)} (${pct}%)`);
}
console.log('');

console.log('Backend mix:');
for (const [b, n] of Object.entries(byBackend)) {
  const pct = ((n / total) * 100).toFixed(1);
  console.log(`  ${b.padEnd(20)} ${String(n).padStart(4)} (${pct}%)`);
}
console.log('');

console.log('💰 Cost (estimated, output tokens only):');
console.log(`  Mediator path:   $${actualCostUSD.toFixed(4)}`);
console.log(`  Naive Opus path: $${naiveOpusCostUSD.toFixed(4)}`);
console.log(`  Savings:         $${savings.toFixed(4)}  (${savingsPct.toFixed(1)}%)`);
console.log('');

if (lowConf.length > 0) {
  console.log(`⚠  ${lowConf.length} low-confidence classifications (tuning candidates):`);
  for (const e of lowConf.slice(-5)) {
    console.log(`  [${e.conf}] ${e.preview}`);
  }
  console.log('');
}

console.log('Run with --json for machine-readable output.');
console.log('');
