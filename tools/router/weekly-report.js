#!/usr/bin/env node
// weekly-report.js — consolidated 7-day mooter report.
//
// Aggregates the past week from decisions.log + execution.log into a
// readable summary: spend, savings, mode-time breakdown, autopilot
// flips, tier distribution, daily sparkline.
//
// Usage:
//   node tools/router/weekly-report.js
//   node tools/router/weekly-report.js --markdown  → markdown output
//   node tools/router/weekly-report.js --days 30   → custom window

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const RESET  = '\x1b[0m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const BRAND  = '\x1b[38;2;194;95;101m';
const GREEN  = '\x1b[38;2;50;220;120m';
const TEAL   = '\x1b[38;2;78;201;176m';
const BLUE   = '\x1b[38;2;86;156;214m';
const GOLD   = '\x1b[38;2;220;220;170m';
const RED    = '\x1b[38;2;227;70;70m';

const TIER_COLOR = { T0: BRAND, T1: TEAL, T2: BLUE, T3: RED };

const ROUTER_ROOT = path.join(os.homedir(), '.claude', 'tools', 'router');
const DECISIONS_LOG = path.join(ROUTER_ROOT, 'decisions.log');
const FLIP_LOG = path.join(ROUTER_ROOT, '.autopilot-flips.log');

const args = process.argv.slice(2);
const MARKDOWN = args.includes('--markdown') || args.includes('--md');
const daysIdx = args.indexOf('--days');
const WINDOW_DAYS = daysIdx >= 0 ? Math.max(1, parseInt(args[daysIdx + 1]) || 7) : 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 3600 * 1000;

function c(color, s) { return MARKDOWN ? s : `${color}${s}${RESET}`; }
function b(s) { return MARKDOWN ? `**${s}**` : `${BOLD}${s}${RESET}`; }
function dim(s) { return MARKDOWN ? `*${s}*` : `${DIM}${s}${RESET}`; }
function h(level, s) {
  if (MARKDOWN) return '\n' + '#'.repeat(level) + ' ' + s + '\n';
  const prefix = '  '.repeat(Math.max(0, level - 1));
  return `\n${prefix}${BRAND}${BOLD}${s}${RESET}\n`;
}

function readLogTail(p, maxBytes) {
  try {
    if (!fs.existsSync(p)) return [];
    const stat = fs.statSync(p);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8').split('\n').filter(Boolean);
  } catch { return []; }
}

function parseJsonLine(l) {
  try { return JSON.parse(l); } catch { return null; }
}

function inferProvider(recommendedBackend, tier) {
  const bkd = String(recommendedBackend || '').toLowerCase();
  if (bkd.includes('ollama') || bkd.includes('local')) return 'local';
  if (bkd.includes('claude') || bkd.includes('anthropic')) return 'anthropic';
  if (bkd.includes('openai') || bkd.includes('gpt')) return 'openai';
  if (bkd.includes('gemini') || bkd.includes('google')) return 'google';
  if (bkd.includes('grok') || bkd.includes('xai')) return 'xai';
  if (bkd.includes('mistral')) return 'mistral';
  if (tier === 'T0') return 'local';
  return 'anthropic';
}

function aggregate() {
  let pricing;
  try { pricing = require('./pricing'); } catch { pricing = null; }

  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const DAY_MS = 24 * 3600 * 1000;
  const dayBuckets = new Array(WINDOW_DAYS).fill(0);

  const tierCounts = { T0: 0, T1: 0, T2: 0, T3: 0 };
  const providerCounts = {};
  const providerCosts = {};
  let totalSpent = 0;
  let totalWouldHaveSpent = 0;
  let totalCalls = 0;

  // decisions.log
  const lines = readLogTail(DECISIONS_LOG, 8 * 1024 * 1024);
  for (const l of lines) {
    const d = parseJsonLine(l);
    if (!d || d.event !== 'classified') continue;
    if (d.source === 'mooter-tester') continue;
    const ts = d.ts_ms || (d.ts ? new Date(d.ts).getTime() : 0);
    if (!ts || ts < cutoff) continue;
    const tier = d.tier;
    if (!tier) continue;
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    totalCalls++;

    const promptLen = d.prompt_len || d.prompt_length || 200;
    if (pricing) {
      const cost = pricing.estimateTurnCost(tier, promptLen);
      const opus = pricing.naiveOpusCost(promptLen);
      totalSpent += cost;
      totalWouldHaveSpent += opus;
      const provider = inferProvider(d.recommended_backend, tier);
      providerCounts[provider] = (providerCounts[provider] || 0) + 1;
      providerCosts[provider] = (providerCosts[provider] || 0) + cost;
      const daysBack = Math.floor((now - ts) / DAY_MS);
      const bucketIdx = WINDOW_DAYS - 1 - daysBack;
      if (bucketIdx >= 0 && bucketIdx < WINDOW_DAYS) dayBuckets[bucketIdx] += cost;
    }
  }

  // flips
  const flipLines = readLogTail(FLIP_LOG, 256 * 1024);
  const flips = flipLines
    .map(parseJsonLine)
    .filter(f => f && f.ts >= cutoff);

  const savedUsd = Math.max(0, totalWouldHaveSpent - totalSpent);
  const savedPct = totalWouldHaveSpent > 0
    ? Math.round((savedUsd / totalWouldHaveSpent) * 100)
    : 0;

  return {
    totalCalls,
    totalSpent,
    totalWouldHaveSpent,
    savedUsd,
    savedPct,
    tierCounts,
    providerCounts,
    providerCosts,
    dayBuckets,
    flips,
    cutoff,
    now,
  };
}

function sparkline(buckets) {
  const chars = '▁▂▃▄▅▆▇█';
  const peak = Math.max(...buckets);
  if (peak <= 0) return '▁'.repeat(buckets.length);
  return buckets.map(v => {
    const lvl = Math.min(7, Math.floor((v / peak) * 7));
    return chars[lvl];
  }).join('');
}

function render(agg) {
  const lines = [];
  const dateFmt = (ms) => new Date(ms).toISOString().slice(0, 10);

  if (MARKDOWN) {
    lines.push(`# 🐮 mooter weekly report`);
    lines.push(`*${dateFmt(agg.cutoff)} → ${dateFmt(agg.now)} (${WINDOW_DAYS} days)*`);
  } else {
    lines.push('');
    lines.push(`${BRAND}${BOLD}🐮 mooter weekly report${RESET}`);
    lines.push(dim(`${dateFmt(agg.cutoff)} → ${dateFmt(agg.now)} (${WINDOW_DAYS} days)`));
  }

  // Headline
  lines.push(h(2, 'Headline'));
  lines.push(`  ${b(agg.totalCalls.toString())} routed turns`);
  lines.push(`  ${b('$' + agg.savedUsd.toFixed(2))} saved  ${dim('(' + agg.savedPct + '% vs all-Opus baseline)')}`);
  lines.push(`  ${b('$' + agg.totalSpent.toFixed(2))} actual spend  ${dim('($' + agg.totalWouldHaveSpent.toFixed(2) + ' naive baseline)')}`);

  // Tier distribution
  lines.push(h(2, 'Tier distribution'));
  const total = Math.max(1, agg.totalCalls);
  for (const tier of ['T0', 'T1', 'T2', 'T3']) {
    const n = agg.tierCounts[tier] || 0;
    const pct = Math.round((n / total) * 100);
    const barLen = Math.round((n / total) * 30);
    const bar = c(TIER_COLOR[tier], '█'.repeat(barLen)) + dim('░'.repeat(30 - barLen));
    lines.push(`  ${c(TIER_COLOR[tier], tier)} ${bar} ${b(pct + '%')} ${dim('(' + n + ')')}`);
  }

  // Providers
  if (Object.keys(agg.providerCounts).length) {
    lines.push(h(2, 'By provider'));
    const providers = Object.entries(agg.providerCosts).sort((a, b) => b[1] - a[1]);
    for (const [p, cost] of providers) {
      const n = agg.providerCounts[p] || 0;
      lines.push(`  ${b(p.padEnd(10))} ${b('$' + cost.toFixed(2))}  ${dim(n + ' calls')}`);
    }
  }

  // Daily sparkline
  lines.push(h(2, 'Daily burn rate'));
  const spark = sparkline(agg.dayBuckets);
  const peak = Math.max(...agg.dayBuckets);
  lines.push(`  ${c(BRAND, spark)}  ${dim('peak $' + peak.toFixed(2) + '/day')}`);
  const dailyBudget = agg.totalSpent / WINDOW_DAYS;
  lines.push(`  daily avg: ${b('$' + dailyBudget.toFixed(2))}  ${dim('projected monthly: $' + (dailyBudget * 30).toFixed(2))}`);

  // Autopilot flips
  lines.push(h(2, 'Autopilot flips'));
  if (!agg.flips.length) {
    lines.push(`  ${dim('(no flips in this window)')}`);
  } else {
    for (const f of agg.flips) {
      const when = dateFmt(f.ts);
      lines.push(`  ${dim(when)}  ${b(f.from)} → ${b(f.to)}  ${dim(f.reason || '')}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

if (require.main === module) {
  const agg = aggregate();
  console.log(render(agg));
}

module.exports = { aggregate, render };
