#!/usr/bin/env node
/**
 * mooter-review.js — Real-time review of tester findings.
 *
 * Reads DIRECTLY from mooter-tester-history.jsonl (live data) — no need to
 * wait for the hourly backlog. Works the moment the tester has generated
 * even 1 cycle of data.
 *
 * Usage:
 *   node mooter-review.js                # snapshot summary (always fresh)
 *   node mooter-review.js --report       # detailed markdown for Claude to read
 *   node mooter-review.js --export-gold  # accept misroutings → gold-labels.json
 *   node mooter-review.js --counters     # JSON counters for landing/dashboard
 *
 * Designed to be called by /mooter-review skill in Claude Code.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const HISTORY_PATH = path.join(SCRIPT_DIR, 'mooter-tester-history.jsonl');
const GOLD_LABELS_PATH = path.join(SCRIPT_DIR, 'gold-labels.json');
const STATS_PATH = path.join(SCRIPT_DIR, 'mooter-tester-stats.json');
const QUALITY_MATRIX_PATH = path.join(SCRIPT_DIR, 'mooter-quality-matrix.json');

const args = process.argv.slice(2);
const reportMode = args.includes('--report');
const countersOnly = args.includes('--counters');
const exportGold = args.includes('--export-gold');

// ── Load all events from history ────────────────────────────────────
function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    console.error('No tester history found. Is the mooter-tester running?');
    console.error(`Expected: ${HISTORY_PATH}`);
    console.error('\nStart it with:');
    console.error('  Set-Location "C:\\Users\\Paulo Loureiro\\frugal\\tools\\router"');
    console.error('  node .\\mooter-continuous-tester.js');
    process.exit(1);
  }
  const lines = fs.readFileSync(HISTORY_PATH, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try { events.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return events;
}

// ── Build snapshot from live data ───────────────────────────────────
function buildSnapshot(events) {
  const snapshot = {
    total_events: events.length,
    first_event: events[0]?.ts || null,
    last_event: events[events.length - 1]?.ts || null,

    // Classifications
    classifications: events.filter(e => e.event === 'tester_classification').length,

    // Misroutings
    misroutings: [],

    // Executions
    executions: { total: 0, by_model: {} },

    // A/B model tests
    ab_tests: [],

    // Optimizer A/B
    optimizer_tests: [],

    // Embeddings
    embeddings: events.filter(e => e.event === 'tester_embedding').length,

    // Tier accuracy
    tier_accuracy: {},
  };

  // Existing gold labels (to avoid duplicates)
  let existingGold = new Set();
  try {
    const gl = JSON.parse(fs.readFileSync(GOLD_LABELS_PATH, 'utf8'));
    existingGold = new Set(gl.map(g => g.prompt));
  } catch { /* no gold labels yet */ }

  for (const e of events) {
    switch (e.event) {
      case 'tester_misrouting':
        if (!existingGold.has(e.prompt_preview)) {
          snapshot.misroutings.push({
            prompt: e.prompt_preview,
            expected: e.expected,
            classified: e.classified,
            category: e.category,
            detected_at: e.ts,
          });
        }
        break;

      case 'tester_execution':
        snapshot.executions.total++;
        if (!snapshot.executions.by_model[e.model]) {
          snapshot.executions.by_model[e.model] = { runs: 0, total_latency: 0, errors: 0 };
        }
        snapshot.executions.by_model[e.model].runs++;
        snapshot.executions.by_model[e.model].total_latency += e.latency_ms || 0;
        if (!e.success) snapshot.executions.by_model[e.model].errors++;
        break;

      case 'tester_ab_test':
        snapshot.ab_tests.push({
          model_a: e.model_a, model_b: e.model_b,
          winner: e.winner, category: e.category,
          latency_a: e.latency_a_ms, latency_b: e.latency_b_ms,
        });
        break;

      case 'tester_optimizer_ab':
        snapshot.optimizer_tests.push({
          model: e.model, strategy: e.strategy,
          winner: e.winner, category: e.category,
          latency_raw: e.latency_raw_ms, latency_opt: e.latency_opt_ms,
        });
        break;

      case 'tester_classification':
        if (e.expected_tier) {
          const t = e.expected_tier;
          if (!snapshot.tier_accuracy[t]) snapshot.tier_accuracy[t] = { correct: 0, total: 0 };
          snapshot.tier_accuracy[t].total++;
          if (e.decided_tier === e.expected_tier) snapshot.tier_accuracy[t].correct++;
        }
        break;
    }
  }

  // Deduplicate misroutings by prompt
  const seen = new Set();
  snapshot.misroutings = snapshot.misroutings.filter(m => {
    if (seen.has(m.prompt)) return false;
    seen.add(m.prompt);
    return true;
  });

  return snapshot;
}

// ── Summary ─────────────────────────────────────────────────────────
function showSummary(snap) {
  const uptime = snap.first_event && snap.last_event
    ? Math.round((new Date(snap.last_event) - new Date(snap.first_event)) / 60000)
    : 0;

  // Model A/B winners
  const modelWins = {};
  for (const ab of snap.ab_tests) {
    const winner = ab.winner === 'A' ? ab.model_a : ab.winner === 'B' ? ab.model_b : null;
    if (winner) { modelWins[winner] = (modelWins[winner] || 0) + 1; }
  }

  // Optimizer stats
  const optWins = snap.optimizer_tests.filter(t => t.winner === 'optimized').length;
  const optTotal = snap.optimizer_tests.length;

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           🐮 MOOTER REVIEW — Live Snapshot                      ║
╚══════════════════════════════════════════════════════════════════╝

  Data: ${snap.first_event?.slice(0, 19) || '?'} → ${snap.last_event?.slice(0, 19) || '?'} (${uptime} min)
  Events: ${snap.total_events}

  📊 Activity:
    Classifications:    ${snap.classifications}
    Model executions:   ${snap.executions.total}
    A/B model tests:    ${snap.ab_tests.length}
    Optimizer A/B:      ${optTotal}${optTotal > 0 ? ` (optimizer wins: ${optWins}/${optTotal} = ${Math.round(optWins / optTotal * 100)}%)` : ''}
    Embeddings:         ${snap.embeddings}

  🔍 Findings:
    Misroutings:        ${snap.misroutings.length} (new gold-label candidates)
    ${snap.misroutings.length > 0 ? 'Run: node mooter-review.js --report    for details' : ''}
    ${snap.misroutings.length > 0 ? '     node mooter-review.js --export-gold  to apply' : ''}
`);

  // Model performance
  const models = Object.entries(snap.executions.by_model);
  if (models.length > 0) {
    console.log('  🏎️ Model Performance:');
    for (const [model, data] of models.sort((a, b) => b[1].runs - a[1].runs)) {
      const avg = data.runs > 0 ? Math.round(data.total_latency / data.runs) : 0;
      const wins = modelWins[model] || 0;
      console.log(`    ${model.padEnd(22)} ${String(data.runs).padStart(3)} runs  ${String(avg).padStart(5)}ms avg  ${wins} A/B wins  ${data.errors} err`);
    }
    console.log('');
  }

  // Tier accuracy
  const tiers = Object.entries(snap.tier_accuracy);
  if (tiers.length > 0) {
    console.log('  🎯 Classifier Accuracy:');
    for (const [tier, data] of tiers.sort()) {
      const pct = data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 'n/a';
      console.log(`    ${tier}: ${pct}% (${data.correct}/${data.total})`);
    }
    console.log('');
  }
}

// ── Report (detailed, for Claude) ───────────────────────────────────
function showReport(snap) {
  console.log('# MOOTER TESTER — Live Review Report');
  console.log(`# Snapshot: ${new Date().toISOString()}`);
  console.log(`# Data range: ${snap.first_event?.slice(0, 19)} → ${snap.last_event?.slice(0, 19)}\n`);

  // Misroutings
  console.log(`## Misroutings (${snap.misroutings.length} — gold-label candidates)\n`);
  if (snap.misroutings.length === 0) {
    console.log('No misroutings found — classifier is accurate on generated prompts.\n');
  } else {
    console.log('| # | Prompt | Expected | Got | Category |');
    console.log('|---|--------|----------|-----|----------|');
    snap.misroutings.forEach((m, i) => {
      console.log(`| ${i + 1} | ${m.prompt.slice(0, 60).replace(/\|/g, '\\|')} | ${m.expected} | ${m.classified} | ${m.category || ''} |`);
    });
    console.log('\nTo add these as gold labels: `node tools/router/mooter-review.js --export-gold`\n');
  }

  // A/B Model Tests
  console.log(`## A/B Model Tests (${snap.ab_tests.length})\n`);
  if (snap.ab_tests.length > 0) {
    // Aggregate by model pair
    const pairStats = {};
    for (const ab of snap.ab_tests) {
      const key = [ab.model_a, ab.model_b].sort().join(' vs ');
      if (!pairStats[key]) pairStats[key] = { wins: {}, ties: 0, total: 0 };
      pairStats[key].total++;
      if (ab.winner === 'A') pairStats[key].wins[ab.model_a] = (pairStats[key].wins[ab.model_a] || 0) + 1;
      else if (ab.winner === 'B') pairStats[key].wins[ab.model_b] = (pairStats[key].wins[ab.model_b] || 0) + 1;
      else pairStats[key].ties++;
    }
    console.log('| Matchup | Results | Tests |');
    console.log('|---------|---------|-------|');
    for (const [pair, data] of Object.entries(pairStats)) {
      const results = Object.entries(data.wins).map(([m, w]) => `${m}: ${w}`).join(', ');
      console.log(`| ${pair} | ${results}${data.ties > 0 ? `, TIE: ${data.ties}` : ''} | ${data.total} |`);
    }
    console.log('');
  }

  // Optimizer effectiveness
  console.log(`## Optimizer (Tropicalization) Tests (${snap.optimizer_tests.length})\n`);
  if (snap.optimizer_tests.length > 0) {
    const optWins = snap.optimizer_tests.filter(t => t.winner === 'optimized').length;
    const rawWins = snap.optimizer_tests.filter(t => t.winner === 'raw').length;
    const ties = snap.optimizer_tests.filter(t => t.winner === 'tie').length;
    console.log(`Overall: optimizer wins ${optWins}, raw wins ${rawWins}, ties ${ties}`);
    console.log(`Win rate: ${(optWins / snap.optimizer_tests.length * 100).toFixed(0)}%\n`);

    // Per model
    const byModel = {};
    for (const t of snap.optimizer_tests) {
      if (!byModel[t.model]) byModel[t.model] = { opt: 0, raw: 0, tie: 0, strategies: {} };
      if (t.winner === 'optimized') byModel[t.model].opt++;
      else if (t.winner === 'raw') byModel[t.model].raw++;
      else byModel[t.model].tie++;
      if (t.strategy) {
        byModel[t.model].strategies[t.strategy] = (byModel[t.model].strategies[t.strategy] || 0) + 1;
      }
    }
    console.log('| Model | Optimizer Wins | Raw Wins | Ties | Best Strategies |');
    console.log('|-------|---------------|----------|------|-----------------|');
    for (const [model, data] of Object.entries(byModel)) {
      const strats = Object.entries(data.strategies).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s}(${c})`).join(', ');
      console.log(`| ${model} | ${data.opt} | ${data.raw} | ${data.tie} | ${strats} |`);
    }
    console.log('');
  }

  // Tier accuracy
  console.log('## Classifier Accuracy by Tier\n');
  console.log('| Tier | Accuracy | Correct/Total |');
  console.log('|------|----------|---------------|');
  for (const [tier, data] of Object.entries(snap.tier_accuracy).sort()) {
    const pct = data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 'n/a';
    console.log(`| ${tier} | ${pct}% | ${data.correct}/${data.total} |`);
  }
  console.log('');

  // Counters
  console.log('## Counters (for landing page)\n');
  console.log('```json');
  console.log(JSON.stringify({
    prompts_tested: snap.classifications,
    models_benchmarked: Object.keys(snap.executions.by_model).length,
    ab_tests_run: snap.ab_tests.length,
    optimizer_tests: snap.optimizer_tests.length,
    misroutings_found: snap.misroutings.length,
    embeddings_built: snap.embeddings,
    cost_usd: 0,
  }, null, 2));
  console.log('```\n');
}

// ── Export gold labels ──────────────────────────────────────────────
function doExportGold(snap) {
  if (snap.misroutings.length === 0) {
    console.log('No misroutings to export. Classifier is accurate on all tested prompts.');
    return;
  }

  let goldLabels = [];
  try { goldLabels = JSON.parse(fs.readFileSync(GOLD_LABELS_PATH, 'utf8')); } catch {}
  const existing = new Set(goldLabels.map(g => g.prompt));
  let added = 0;

  for (const m of snap.misroutings) {
    if (existing.has(m.prompt)) continue;
    goldLabels.push({
      id: `gl-tester-${goldLabels.length + 1}`,
      prompt: m.prompt,
      expected_tier: m.expected,
      source: 'mooter-tester',
      added: new Date().toISOString().slice(0, 10),
      notes: `was ${m.classified}, category: ${m.category || 'unknown'}`,
    });
    existing.add(m.prompt);
    added++;
  }

  if (added > 0) {
    fs.writeFileSync(GOLD_LABELS_PATH, JSON.stringify(goldLabels, null, 2));
    console.log(`✅ Added ${added} gold labels (total: ${goldLabels.length})`);
    console.log('Next steps:');
    console.log('  node tools/router/validate-set.js --strict   # verify accuracy');
    console.log('  node tools/router/backtest.js                # generate tuning');
    console.log('  node tools/router/update-router.js           # apply fixes');
  } else {
    console.log('All misroutings already in gold-labels.json.');
  }
}

// ── Counters (JSON for landing/dashboard) ───────────────────────────
function showCounters(snap) {
  // Also merge with live stats if available
  let live = {};
  try { live = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch {}

  console.log(JSON.stringify({
    prompts_tested: snap.classifications,
    prompts_executed: snap.executions.total,
    models_benchmarked: Object.keys(snap.executions.by_model).length,
    ab_tests: snap.ab_tests.length,
    optimizer_tests: snap.optimizer_tests.length,
    optimizer_win_rate: snap.optimizer_tests.length > 0
      ? (snap.optimizer_tests.filter(t => t.winner === 'optimized').length / snap.optimizer_tests.length * 100).toFixed(1) + '%' : 'n/a',
    misroutings: snap.misroutings.length,
    embeddings: snap.embeddings,
    uptime: live.uptime_human || null,
    cycles: live.cycles || null,
    cost_usd: 0,
    last_updated: new Date().toISOString(),
  }, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────────
const events = loadHistory();
const snap = buildSnapshot(events);

if (countersOnly) showCounters(snap);
else if (reportMode) showReport(snap);
else if (exportGold) doExportGold(snap);
else showSummary(snap);
