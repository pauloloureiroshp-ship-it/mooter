#!/usr/bin/env node
/**
 * mooter-review.js — Delta-based review of tester findings.
 *
 * v2: Snapshot-delta model. Each invocation reads only NEW events since the
 * last review (watermark). Previous findings are "closed" — already applied
 * or rejected. Cumulative stats are still shown for context.
 *
 * Watermark stored in mooter-review-state.json:
 *   { last_review_at, last_event_index, review_count, reviews[] }
 *
 * Usage:
 *   node mooter-review.js                # delta summary (new since last review)
 *   node mooter-review.js --report       # detailed delta report for Claude
 *   node mooter-review.js --export-gold  # accept delta misroutings → gold-labels.json
 *   node mooter-review.js --counters     # JSON counters (cumulative, for dashboard)
 *   node mooter-review.js --full         # ignore watermark, show everything
 *   node mooter-review.js --history      # show past review summaries
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
const REVIEW_STATE_PATH = path.join(SCRIPT_DIR, 'mooter-review-state.json');

const args = process.argv.slice(2);
const reportMode = args.includes('--report');
const countersOnly = args.includes('--counters');
const exportGold = args.includes('--export-gold');
const fullMode = args.includes('--full');
const historyMode = args.includes('--history');

// ── Watermark state ────────────────────────────────────────────────
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(REVIEW_STATE_PATH, 'utf8'));
  } catch {
    return { last_review_at: null, last_event_index: 0, review_count: 0, reviews: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(REVIEW_STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Load events from history ───────────────────────────────────────
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

// ── Build snapshot from events ─────────────────────────────────────
function buildSnapshot(events) {
  const snapshot = {
    total_events: events.length,
    first_event: events[0]?.ts || null,
    last_event: events[events.length - 1]?.ts || null,
    classifications: events.filter(e => e.event === 'tester_classification').length,
    misroutings: [],
    executions: { total: 0, by_model: {} },
    ab_tests: [],
    optimizer_tests: [],
    embeddings: events.filter(e => e.event === 'tester_embedding').length,
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
function showSummary(deltaSnap, allSnap, state, totalEvents) {
  const isFirstReview = state.review_count === 0;
  const deltaLabel = isFirstReview ? 'First review (all data)' : `Since review #${state.review_count}`;
  const deltaRange = deltaSnap.first_event && deltaSnap.last_event
    ? `${deltaSnap.first_event.slice(0, 19)} → ${deltaSnap.last_event.slice(0, 19)}`
    : 'no new data';

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           🐮 MOOTER REVIEW — Delta Snapshot #${state.review_count + 1}${' '.repeat(Math.max(0, 19 - String(state.review_count + 1).length))}║
╚══════════════════════════════════════════════════════════════════╝

  ${deltaLabel}
  Delta range: ${deltaRange}
  Delta events: ${deltaSnap.total_events} (of ${totalEvents} total)
`);

  if (deltaSnap.total_events === 0) {
    console.log('  No new tester data since last review. Tester may be stopped.');
    console.log('  Use --full to see all-time data.\n');
    return;
  }

  // Delta findings
  console.log('  📊 New Activity (delta):');
  console.log(`    Classifications:    ${deltaSnap.classifications}`);
  console.log(`    Model executions:   ${deltaSnap.executions.total}`);
  console.log(`    A/B model tests:    ${deltaSnap.ab_tests.length}`);
  console.log(`    Optimizer A/B:      ${deltaSnap.optimizer_tests.length}`);
  console.log(`    Embeddings:         ${deltaSnap.embeddings}`);
  console.log('');

  console.log('  🔍 New Findings (delta):');
  console.log(`    Misroutings:        ${deltaSnap.misroutings.length} (new gold-label candidates)`);
  if (deltaSnap.misroutings.length > 0) {
    console.log('    Run: node mooter-review.js --report    for details');
    console.log('         node mooter-review.js --export-gold  to apply');
  }
  console.log('');

  // Delta tier accuracy
  const tiers = Object.entries(deltaSnap.tier_accuracy);
  if (tiers.length > 0) {
    console.log('  🎯 Classifier Accuracy (delta):');
    for (const [tier, data] of tiers.sort()) {
      const pct = data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 'n/a';
      console.log(`    ${tier}: ${pct}% (${data.correct}/${data.total})`);
    }
    console.log('');
  }

  // Cumulative context (always all-time)
  console.log('  📈 Cumulative (all-time):');
  console.log(`    Total classifications: ${allSnap.classifications}`);
  console.log(`    Total A/B tests:       ${allSnap.ab_tests.length}`);
  console.log(`    Total misroutings:     ${allSnap.misroutings.length} (after gold-label dedup)`);
  console.log(`    Reviews completed:     ${state.review_count}`);
  console.log('');

  // Model performance (delta)
  const models = Object.entries(deltaSnap.executions.by_model);
  if (models.length > 0) {
    console.log('  🏎️ Model Performance (delta):');
    for (const [model, data] of models.sort((a, b) => b[1].runs - a[1].runs)) {
      const avg = data.runs > 0 ? Math.round(data.total_latency / data.runs) : 0;
      console.log(`    ${model.padEnd(22)} ${String(data.runs).padStart(3)} runs  ${String(avg).padStart(5)}ms avg  ${data.errors} err`);
    }
    console.log('');
  }
}

// ── Report (detailed, for Claude) ───────────────────────────────────
function showReport(deltaSnap, allSnap, state, totalEvents) {
  const isFirstReview = state.review_count === 0;
  const reviewNum = state.review_count + 1;

  console.log(`# MOOTER TESTER — Delta Review #${reviewNum}`);
  console.log(`# Snapshot: ${new Date().toISOString()}`);
  console.log(`# Delta: ${deltaSnap.first_event?.slice(0, 19) || 'n/a'} → ${deltaSnap.last_event?.slice(0, 19) || 'n/a'}`);
  console.log(`# Events: ${deltaSnap.total_events} new (${totalEvents} total)`);
  if (!isFirstReview) {
    console.log(`# Last review: ${state.last_review_at} (review #${state.review_count})`);
  }
  console.log('');

  if (deltaSnap.total_events === 0) {
    console.log('No new tester data since last review.\n');
    console.log('Use `--full` to see all-time report.\n');
    return;
  }

  // Delta Misroutings
  console.log(`## New Misroutings (${deltaSnap.misroutings.length} — gold-label candidates)\n`);
  if (deltaSnap.misroutings.length === 0) {
    console.log('No new misroutings — classifier is accurate on all new prompts.\n');
  } else {
    console.log('| # | Prompt | Expected | Got | Category |');
    console.log('|---|--------|----------|-----|----------|');
    deltaSnap.misroutings.forEach((m, i) => {
      console.log(`| ${i + 1} | ${m.prompt.slice(0, 60).replace(/\|/g, '\\|')} | ${m.expected} | ${m.classified} | ${m.category || ''} |`);
    });
    console.log('\nTo add these as gold labels: `node tools/router/mooter-review.js --export-gold`\n');
  }

  // Delta A/B Model Tests
  console.log(`## New A/B Model Tests (${deltaSnap.ab_tests.length})\n`);
  if (deltaSnap.ab_tests.length > 0) {
    const pairStats = {};
    for (const ab of deltaSnap.ab_tests) {
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
  } else {
    console.log('No new A/B tests.\n');
  }

  // Delta Optimizer
  console.log(`## New Optimizer Tests (${deltaSnap.optimizer_tests.length})\n`);
  if (deltaSnap.optimizer_tests.length > 0) {
    const optWins = deltaSnap.optimizer_tests.filter(t => t.winner === 'optimized').length;
    const rawWins = deltaSnap.optimizer_tests.filter(t => t.winner === 'raw').length;
    const ties = deltaSnap.optimizer_tests.filter(t => t.winner === 'tie').length;
    console.log(`Delta: optimizer wins ${optWins}, raw wins ${rawWins}, ties ${ties}`);
    console.log(`Win rate: ${(optWins / deltaSnap.optimizer_tests.length * 100).toFixed(0)}%\n`);

    const byModel = {};
    for (const t of deltaSnap.optimizer_tests) {
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
  } else {
    console.log('No new optimizer tests.\n');
  }

  // Delta Tier accuracy
  console.log('## Classifier Accuracy (delta)\n');
  const deltaTiers = Object.entries(deltaSnap.tier_accuracy);
  if (deltaTiers.length > 0) {
    console.log('| Tier | Accuracy | Correct/Total |');
    console.log('|------|----------|---------------|');
    for (const [tier, data] of deltaTiers.sort()) {
      const pct = data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 'n/a';
      console.log(`| ${tier} | ${pct}% | ${data.correct}/${data.total} |`);
    }
  } else {
    console.log('No tier classification data in delta.');
  }
  console.log('');

  // Cumulative accuracy (all-time context)
  console.log('## Classifier Accuracy (cumulative — all-time)\n');
  const allTiers = Object.entries(allSnap.tier_accuracy);
  if (allTiers.length > 0) {
    console.log('| Tier | Accuracy | Correct/Total |');
    console.log('|------|----------|---------------|');
    for (const [tier, data] of allTiers.sort()) {
      const pct = data.total > 0 ? (data.correct / data.total * 100).toFixed(1) : 'n/a';
      console.log(`| ${tier} | ${pct}% | ${data.correct}/${data.total} |`);
    }
  }
  console.log('');

  // Cumulative counters
  console.log('## Counters (cumulative — for landing page)\n');
  console.log('```json');
  console.log(JSON.stringify({
    prompts_tested: allSnap.classifications,
    models_benchmarked: Object.keys(allSnap.executions.by_model).length,
    ab_tests_run: allSnap.ab_tests.length,
    optimizer_tests: allSnap.optimizer_tests.length,
    misroutings_found: allSnap.misroutings.length,
    embeddings_built: allSnap.embeddings,
    reviews_completed: state.review_count,
    cost_usd: 0,
  }, null, 2));
  console.log('```\n');
}

// ── Export gold labels (delta only) ─────────────────────────────────
function doExportGold(deltaSnap) {
  if (deltaSnap.misroutings.length === 0) {
    console.log('No new misroutings to export. Classifier is accurate on all new prompts.');
    return;
  }

  let goldLabels = [];
  try { goldLabels = JSON.parse(fs.readFileSync(GOLD_LABELS_PATH, 'utf8')); } catch {}
  const existing = new Set(goldLabels.map(g => g.prompt));
  let added = 0;

  for (const m of deltaSnap.misroutings) {
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
    console.log('All delta misroutings already in gold-labels.json.');
  }
}

// ── Counters (JSON for landing/dashboard — always cumulative) ───────
function showCounters(allSnap, state) {
  let live = {};
  try { live = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')); } catch {}

  console.log(JSON.stringify({
    prompts_tested: allSnap.classifications,
    prompts_executed: allSnap.executions.total,
    models_benchmarked: Object.keys(allSnap.executions.by_model).length,
    ab_tests: allSnap.ab_tests.length,
    optimizer_tests: allSnap.optimizer_tests.length,
    optimizer_win_rate: allSnap.optimizer_tests.length > 0
      ? (allSnap.optimizer_tests.filter(t => t.winner === 'optimized').length / allSnap.optimizer_tests.length * 100).toFixed(1) + '%' : 'n/a',
    misroutings: allSnap.misroutings.length,
    embeddings: allSnap.embeddings,
    reviews_completed: state.review_count,
    uptime: live.uptime_human || null,
    cycles: live.cycles || null,
    cost_usd: 0,
    last_updated: new Date().toISOString(),
  }, null, 2));
}

// ── Review history ──────────────────────────────────────────────────
function showHistory(state) {
  if (state.reviews.length === 0) {
    console.log('No reviews completed yet. Run: node mooter-review.js --report');
    return;
  }

  console.log(`\n  📜 Review History (${state.reviews.length} reviews)\n`);
  console.log('  | # | Date | Delta Events | Misroutings | Gold Added |');
  console.log('  |---|------|-------------|-------------|------------|');
  for (const r of state.reviews) {
    console.log(`  | ${r.review_num} | ${r.reviewed_at.slice(0, 16)} | ${r.delta_events} | ${r.delta_misroutings} | ${r.gold_added || 0} |`);
  }
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────
const state = loadState();
const allEvents = loadHistory();

// Split events: delta (new since last review) vs all
const watermark = fullMode ? 0 : (state.last_event_index || 0);
const deltaEvents = allEvents.slice(watermark);

const allSnap = buildSnapshot(allEvents);
const deltaSnap = buildSnapshot(deltaEvents);

if (historyMode) {
  showHistory(state);
} else if (countersOnly) {
  // Counters are always cumulative, don't advance watermark
  showCounters(allSnap, state);
} else if (reportMode) {
  showReport(deltaSnap, allSnap, state, allEvents.length);
  // Advance watermark
  state.last_review_at = new Date().toISOString();
  state.last_event_index = allEvents.length;
  state.review_count++;
  state.reviews.push({
    review_num: state.review_count,
    reviewed_at: state.last_review_at,
    delta_events: deltaEvents.length,
    delta_misroutings: deltaSnap.misroutings.length,
    delta_ab_tests: deltaSnap.ab_tests.length,
    delta_classifications: deltaSnap.classifications,
  });
  // Keep only last 50 reviews in history
  if (state.reviews.length > 50) state.reviews = state.reviews.slice(-50);
  saveState(state);
} else if (exportGold) {
  doExportGold(deltaSnap);
  // Record gold export in last review entry
  if (state.reviews.length > 0) {
    state.reviews[state.reviews.length - 1].gold_added = deltaSnap.misroutings.length;
    saveState(state);
  }
} else {
  showSummary(deltaSnap, allSnap, state, allEvents.length);
  // Summary also advances watermark (user saw the data)
  state.last_review_at = new Date().toISOString();
  state.last_event_index = allEvents.length;
  state.review_count++;
  state.reviews.push({
    review_num: state.review_count,
    reviewed_at: state.last_review_at,
    delta_events: deltaEvents.length,
    delta_misroutings: deltaSnap.misroutings.length,
    delta_ab_tests: deltaSnap.ab_tests.length,
    delta_classifications: deltaSnap.classifications,
  });
  if (state.reviews.length > 50) state.reviews = state.reviews.slice(-50);
  saveState(state);
}
