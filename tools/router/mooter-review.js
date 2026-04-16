#!/usr/bin/env node
/**
 * mooter-review.js — Human-in-the-loop review of tester findings.
 *
 * Reads mooter-tester-backlog.json (written hourly by the continuous tester)
 * and presents findings for review. Accepted findings are applied to:
 *   - gold-labels.json (misroutings → new gold labels)
 *   - model-profile.json (model recommendations)
 *   - router-tuning.json (classifier fixes via backtest)
 *   - mooter-tester-stats.json (counters for dashboard/landing)
 *
 * Usage (in a Claude Code terminal):
 *   node mooter-review.js                # show summary
 *   node mooter-review.js --report       # detailed report for Claude to read
 *   node mooter-review.js --apply-all    # accept all pending findings
 *   node mooter-review.js --counters     # just show counters (for landing page)
 *   node mooter-review.js --export-gold  # export accepted misroutings to gold-labels
 *
 * Designed to be called by the /mooter-review skill in Claude Code.
 * Claude reads --report output, suggests which to accept, Paulo confirms.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const BACKLOG_PATH = path.join(SCRIPT_DIR, 'mooter-tester-backlog.json');
const GOLD_LABELS_PATH = path.join(SCRIPT_DIR, 'gold-labels.json');
const MODEL_PROFILE_PATH = path.join(SCRIPT_DIR, 'model-profile.json');
const STATS_PATH = path.join(SCRIPT_DIR, 'mooter-tester-stats.json');

const args = process.argv.slice(2);
const reportMode = args.includes('--report');
const applyAll = args.includes('--apply-all');
const countersOnly = args.includes('--counters');
const exportGold = args.includes('--export-gold');

function loadBacklog() {
  if (!fs.existsSync(BACKLOG_PATH)) {
    console.error('No backlog found. Is the mooter-tester running?');
    console.error(`Expected: ${BACKLOG_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BACKLOG_PATH, 'utf8'));
}

// ── Summary Mode (default) ──────────────────────────────────────────
function showSummary(backlog) {
  const c = backlog.counters || {};
  const f = backlog.findings || {};

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║              🐮 MOOTER REVIEW — Tester Findings                 ║
╚══════════════════════════════════════════════════════════════════╝

  Last updated: ${backlog.updated_at || 'unknown'}

  📊 Counters:
    Prompts generated:  ${c.total_prompts_generated || 0}
    Prompts executed:   ${c.total_prompts_executed || 0}
    A/B model tests:    ${c.total_ab_tests || 0}
    Optimizer A/B:      ${c.total_optimizer_tests || 0} (win rate: ${c.optimizer_win_rate || 'n/a'})
    Embeddings built:   ${c.total_embeddings || 0}
    Models benchmarked: ${c.models_benchmarked || 0}
    Uptime:             ${c.uptime || 'n/a'}
    Cost:               $${c.cost_usd || 0}

  🔍 Pending Findings:
    Misroutings:           ${(f.misroutings || []).filter(m => m.status === 'pending').length} (gold-label candidates)
    Optimizer insights:    ${(f.optimizer_insights || []).filter(m => m.status === 'pending').length} (dialect tuning)
    Model recommendations: ${(f.model_recommendations || []).length} (quality matrix)

  Next steps:
    node mooter-review.js --report        # detailed report for review
    node mooter-review.js --export-gold   # apply misroutings to gold-labels.json
    node mooter-review.js --counters      # counters for landing page
`);
}

// ── Report Mode (for Claude to read and suggest) ────────────────────
function showReport(backlog) {
  const f = backlog.findings || {};

  console.log('# MOOTER TESTER — Review Report');
  console.log(`# Generated: ${new Date().toISOString()}`);
  console.log(`# Backlog updated: ${backlog.updated_at}\n`);

  // Misroutings
  const pending = (f.misroutings || []).filter(m => m.status === 'pending');
  console.log(`## Misroutings (${pending.length} pending — gold-label candidates)\n`);
  if (pending.length === 0) {
    console.log('No pending misroutings.\n');
  } else {
    console.log('| # | Prompt | Expected | Classified | Category | Detected |');
    console.log('|---|--------|----------|------------|----------|----------|');
    pending.forEach((m, i) => {
      console.log(`| ${i + 1} | ${m.prompt_preview.slice(0, 50)}... | ${m.expected} | ${m.classified} | ${m.category || ''} | ${(m.detected_at || '').slice(0, 10)} |`);
    });
    console.log('');
  }

  // Optimizer insights
  const optInsights = (f.optimizer_insights || []).filter(o => o.status === 'pending');
  console.log(`## Optimizer Insights (${optInsights.length} — tropicalization effectiveness)\n`);
  if (optInsights.length === 0) {
    console.log('No optimizer insights yet (need more A/B data).\n');
  } else {
    for (const o of optInsights) {
      console.log(`### ${o.model}`);
      console.log(`  Win rate: ${o.optimizer_win_rate} (${o.total_tests} tests) — ${o.verdict}`);
      if (o.best_strategies && o.best_strategies.length > 0) {
        console.log('  Best strategies:');
        for (const s of o.best_strategies) {
          console.log(`    ${s.strategy}: +${s.wins} -${s.losses}`);
        }
      }
      console.log('');
    }
  }

  // Model recommendations
  const recs = f.model_recommendations || [];
  console.log(`## Model Recommendations (${recs.length} categories)\n`);
  if (recs.length === 0) {
    console.log('No recommendations yet (need more A/B data).\n');
  } else {
    console.log('| Category | Best Model | Win Rate | W/L/T | Avg Latency |');
    console.log('|----------|-----------|----------|-------|-------------|');
    for (const r of recs) {
      console.log(`| ${r.category} | ${r.recommended_model} | ${r.win_rate} | ${r.wins}/${r.losses}/${r.ties} | ${r.avg_latency_ms}ms |`);
    }
    console.log('');
  }

  // Counters
  const c = backlog.counters || {};
  console.log('## Counters (for landing page / dashboard)\n');
  console.log('```json');
  console.log(JSON.stringify(c, null, 2));
  console.log('```\n');
}

// ── Export gold labels ──────────────────────────────────────────────
function doExportGold(backlog) {
  const pending = (backlog.findings.misroutings || []).filter(m => m.status === 'pending');
  if (pending.length === 0) {
    console.log('No pending misroutings to export.');
    return;
  }

  // Load existing gold labels
  let goldLabels = [];
  try {
    goldLabels = JSON.parse(fs.readFileSync(GOLD_LABELS_PATH, 'utf8'));
  } catch { /* empty */ }

  const existingPrompts = new Set(goldLabels.map(g => g.prompt));
  let added = 0;

  for (const m of pending) {
    if (existingPrompts.has(m.prompt_preview)) continue;

    goldLabels.push({
      id: `gl-tester-${goldLabels.length + 1}`,
      prompt: m.prompt_preview,
      expected_tier: m.expected,
      source: 'mooter-tester',
      added: new Date().toISOString().slice(0, 10),
      notes: `was ${m.classified}, detected ${m.detected_at?.slice(0, 10) || 'unknown'}`,
    });
    existingPrompts.add(m.prompt_preview);
    m.status = 'accepted';
    added++;
  }

  if (added > 0) {
    fs.writeFileSync(GOLD_LABELS_PATH, JSON.stringify(goldLabels, null, 2));
    fs.writeFileSync(BACKLOG_PATH, JSON.stringify(backlog, null, 2));
    console.log(`✅ Added ${added} gold labels (total: ${goldLabels.length})`);
    console.log(`   Run: node validate-set.js --strict  to verify accuracy`);
  } else {
    console.log('No new labels to add (all already in gold-labels.json).');
  }
}

// ── Counters only ───────────────────────────────────────────────────
function showCounters(backlog) {
  const c = backlog.counters || {};
  // Also merge with stats file if available
  let liveStats = {};
  try {
    liveStats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch { /* no stats yet */ }

  const merged = {
    ...c,
    // Live stats override
    prompts_generated: liveStats.prompts_generated || c.total_prompts_generated || 0,
    prompts_executed: liveStats.prompts_executed || c.total_prompts_executed || 0,
    ab_tests: liveStats.ab_tests_run || c.total_ab_tests || 0,
    models_available: (liveStats.models_available || []).length || c.models_benchmarked || 0,
    cycles: liveStats.cycles || 0,
    uptime: liveStats.uptime_human || c.uptime || 'offline',
    cost: 0,
  };

  console.log(JSON.stringify(merged, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────────
const backlog = loadBacklog();

if (countersOnly) {
  showCounters(backlog);
} else if (reportMode) {
  showReport(backlog);
} else if (exportGold) {
  doExportGold(backlog);
} else if (applyAll) {
  doExportGold(backlog);
  // Future: apply optimizer insights to prompt-optimizer.js
  // Future: apply model recs to model-profile.json
  console.log('\n✅ All applicable findings applied.');
} else {
  showSummary(backlog);
}
