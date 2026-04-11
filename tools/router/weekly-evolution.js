#!/usr/bin/env node
/**
 * weekly-evolution.js — Weekly self-improvement report.
 *
 * Runs the full analysis pipeline and outputs a structured report:
 *   1. Stress test (regression gate)
 *   2. Backtest (savings analysis)
 *   3. UX insights (friction signals)
 *   4. Evolution snapshot (if improvements found)
 *   5. Improvement suggestions
 *
 * Usage:
 *   node weekly-evolution.js           → full report
 *   node weekly-evolution.js --json    → machine-readable JSON
 *
 * Designed to be called by a scheduled Claude Code trigger.
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const EVOLUTION_DIR = path.join(process.cwd(), '.evolution');
const jsonMode = process.argv.includes('--json');

const report = {
  timestamp: new Date().toISOString(),
  version: 'auto',
  sections: {},
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout || 30000,
    cwd: opts.cwd || ROUTER_DIR,
  });
  return { stdout: r.stdout || '', stderr: r.stderr || '', ok: r.status === 0 };
}

// ── 1. Stress Test ──────────────────────────────────────────────
const stress = run('node', [path.join(ROUTER_DIR, 'stress-test.js'), '--json']);
try {
  report.sections.stress_test = JSON.parse(stress.stdout);
} catch {
  report.sections.stress_test = { error: 'failed to parse', raw: stress.stdout.slice(0, 200) };
}

// ── 2. Backtest ─────────────────────────────────────────────────
const backtest = run('node', [path.join(ROUTER_DIR, 'backtest.js')], { timeout: 60000 });
report.sections.backtest = { raw: backtest.stdout.slice(0, 500) };

// ── 3. UX Insights ──────────────────────────────────────────────
const ux = run('node', [path.join(ROUTER_DIR, 'ux-insights.js'), '--json', '--append']);
try {
  report.sections.ux_insights = JSON.parse(ux.stdout);
} catch {
  report.sections.ux_insights = { error: 'failed to parse' };
}

// ── 4. Decisions.log stats ──────────────────────────────────────
const logPath = path.join(ROUTER_DIR, 'decisions.log');
if (fs.existsSync(logPath)) {
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const events = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const tiers = { T0: 0, T1: 0, T2: 0, T3: 0 };
  events.forEach(e => { if (e.tier) tiers[e.tier]++; });
  const total = Object.values(tiers).reduce((a, b) => a + b, 0);

  report.sections.log_stats = {
    total_decisions: events.length,
    classified: total,
    tiers,
    free_pct: +((tiers.T0 + tiers.T1) / total * 100).toFixed(1),
    t3_pct: +(tiers.T3 / total * 100).toFixed(1),
  };
}

// ── 5. Improvement suggestions ──────────────────────────────────
const suggestions = [];

// From stress test
const st = report.sections.stress_test;
if (st && st.accuracy_adjusted < 90) {
  suggestions.push({
    area: 'classifier',
    action: `Accuracy dropped to ${st.accuracy_adjusted}%. Run stress test failures analysis and add patterns.`,
  });
}

// From UX insights
const uxData = report.sections.ux_insights;
if (uxData && uxData.suggestions) {
  uxData.suggestions.filter(s => s.priority === 'high').forEach(s => {
    suggestions.push({ area: s.area, action: s.suggestion });
  });
}

// From tier distribution
const stats = report.sections.log_stats;
if (stats) {
  if (stats.t3_pct > 12) {
    suggestions.push({
      area: 'patterns',
      action: `T3 at ${stats.t3_pct}%. Analyze T3 prompts for demotion candidates.`,
    });
  }
  if (stats.free_pct < 70) {
    suggestions.push({
      area: 'classifier',
      action: `Free tier at ${stats.free_pct}%. More prompts should be T0/T1.`,
    });
  }
}

// UX/UI suggestions based on data
suggestions.push({
  area: 'landing',
  action: `Update live counters: ${stats?.total_decisions || '?'} prompts, ${stats?.free_pct || '?'}% free, ~${stats?.savings_pct ?? '?'}% savings.`,
});

if (uxData?.friction_signals?.quality_intent?.pct > 10) {
  suggestions.push({
    area: 'ui',
    action: 'Many quality-intent signals. Make /frugal-beast more discoverable — add hint in statusline when quality phrases detected.',
  });
}

report.suggestions = suggestions;

// ── Output ──────────────────────────────────────────────────────
if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('═══════════════════════════════════════');
  console.log('  frugal — Weekly Evolution Report');
  console.log('  ' + report.timestamp.slice(0, 10));
  console.log('═══════════════════════════════════════\n');

  // Stress test
  if (st && !st.error) {
    const icon = st.accuracy_adjusted >= 85 ? '✓' : '✗';
    console.log(`${icon} Stress test: ${st.exact_pass}/${st.total} exact, ${st.adjusted_pass}/${st.total} adjusted`);
  }

  // Log stats
  if (stats) {
    console.log(`  Decisions: ${stats.total_decisions} | Free: ${stats.free_pct}% | T3: ${stats.t3_pct}%`);
  }

  // Suggestions
  if (suggestions.length) {
    console.log('\nSuggestions:');
    suggestions.forEach(s => console.log(`  [${s.area}] ${s.action}`));
  }

  console.log('\n═══════════════════════════════════════');
}
