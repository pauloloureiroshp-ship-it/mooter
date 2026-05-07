#!/usr/bin/env node
// @ts-check
/**
 * run-routing-accuracy.js — Task #3 of MOOTER_VALIDATION_MASTER.md
 *
 * Runs classify() over every prompt in validation-corpus.jsonl and computes:
 *   - overall tier accuracy (on use_for_accuracy=true subset only)
 *   - confusion matrix (expected × predicted)
 *   - calibration curve (confidence bins vs real accuracy)
 *   - per-class breakdown
 *   - escalation_rule distribution
 *   - suggested_providers distribution
 *
 * HARD FAIL gate: if accuracy < 70%, prints WARN_ACCURACY_LOW and exits 1.
 *
 * Output: accuracy-report.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 1. Load .env so classify() sees the API keys.
require('../../tools/router/providers/_load-env').loadEnv();

const { classify } = require('../../tools/router/classify');

const CORPUS = path.join(__dirname, 'validation-corpus.jsonl');
const OUTPUT = path.join(__dirname, 'accuracy-report.json');

// 2. Clear classify cache to avoid stale results.
const cachePath = path.resolve(__dirname, '../../tools/router/.classify-cache.json');
if (fs.existsSync(cachePath)) {
  fs.unlinkSync(cachePath);
  console.error('Cleared classify cache.');
}

// 3. Read corpus.
const corpus = fs.readFileSync(CORPUS, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
console.error(`Corpus: ${corpus.length} prompts`);

// 4. Classify each.
const results = [];
const t0 = Date.now();
for (const entry of corpus) {
  const r = classify(entry.prompt);
  results.push({
    id: entry.id,
    source: entry.source,
    expected_tier: entry.expected_tier,
    expected_category: entry.expected_category,
    predicted_tier: r.tier,
    predicted_category: r.task_category,
    confidence: r.confidence,
    suggested_subagent: r.suggested_subagent,
    suggested_providers: r.suggested_providers,
    escalation_rule: r.escalation_rule,
    quality_intent: r.quality_intent,
    risk_level: r.risk_level,
    prompt_complexity_score: r.prompt_complexity_score,
    use_for_accuracy: entry.use_for_accuracy,
    class: entry.class,
    language: entry.language,
    tier_correct: entry.use_for_accuracy ? r.tier === entry.expected_tier : null,
    category_correct: entry.use_for_accuracy && entry.expected_category
      ? r.task_category === entry.expected_category
      : null,
    prompt_preview: entry.prompt.slice(0, 80),
  });
}
const elapsed = Date.now() - t0;
console.error(`Classified ${results.length} prompts in ${elapsed}ms (${(elapsed / results.length).toFixed(1)}ms/prompt avg)`);

// ── Metrics ─────────────────────────────────────────────────────────────

const accSubset = results.filter((r) => r.use_for_accuracy);

// Overall tier accuracy
const tierCorrect = accSubset.filter((r) => r.tier_correct).length;
const tierAccuracy = accSubset.length ? tierCorrect / accSubset.length : 0;

// Confusion matrix
const tiers = ['T0', 'T1', 'T2', 'T3'];
const confusion = {};
for (const exp of tiers) {
  confusion[exp] = {};
  for (const pred of tiers) confusion[exp][pred] = 0;
}
for (const r of accSubset) {
  if (tiers.includes(r.expected_tier) && tiers.includes(r.predicted_tier)) {
    confusion[r.expected_tier][r.predicted_tier]++;
  }
}
// Row totals + per-tier accuracy
const perTierAccuracy = {};
for (const t of tiers) {
  const row = confusion[t];
  const total = tiers.reduce((s, p) => s + row[p], 0);
  perTierAccuracy[t] = {
    correct: row[t],
    total,
    accuracy: total ? row[t] / total : null,
  };
}

// Calibration curve
const bins = [
  { name: '0.00-0.40', lo: 0.0, hi: 0.4, count: 0, correct: 0 },
  { name: '0.40-0.60', lo: 0.4, hi: 0.6, count: 0, correct: 0 },
  { name: '0.60-0.80', lo: 0.6, hi: 0.8, count: 0, correct: 0 },
  { name: '0.80-1.00', lo: 0.8, hi: 1.01, count: 0, correct: 0 },
];
for (const r of accSubset) {
  const c = r.confidence ?? 0;
  const bin = bins.find((b) => c >= b.lo && c < b.hi);
  if (bin) {
    bin.count++;
    if (r.tier_correct) bin.correct++;
  }
}
const calibration = bins.map((b) => ({
  bin: b.name,
  count: b.count,
  correct: b.correct,
  accuracy: b.count ? b.correct / b.count : null,
}));

// Per-class breakdown
const byClass = {};
for (const r of accSubset) {
  const c = r.class || 'unknown';
  if (!byClass[c]) byClass[c] = { total: 0, correct: 0 };
  byClass[c].total++;
  if (r.tier_correct) byClass[c].correct++;
}
for (const c of Object.keys(byClass)) {
  byClass[c].accuracy = byClass[c].total ? byClass[c].correct / byClass[c].total : null;
}

// Per-language breakdown
const byLanguage = {};
for (const r of accSubset) {
  const l = r.language || 'unknown';
  if (!byLanguage[l]) byLanguage[l] = { total: 0, correct: 0 };
  byLanguage[l].total++;
  if (r.tier_correct) byLanguage[l].correct++;
}
for (const l of Object.keys(byLanguage)) {
  byLanguage[l].accuracy = byLanguage[l].total ? byLanguage[l].correct / byLanguage[l].total : null;
}

// Escalation rules distribution (over all 60)
const escalationDist = {};
for (const r of results) {
  const e = r.escalation_rule || 'none';
  escalationDist[e] = (escalationDist[e] || 0) + 1;
}

// Suggested providers distribution (over all 60)
const providerDist = {};
for (const r of results) {
  const p = (r.suggested_providers || [])[0] || 'none';
  providerDist[p] = (providerDist[p] || 0) + 1;
}

// Subagent distribution (over all 60)
const subagentDist = {};
for (const r of results) {
  const s = r.suggested_subagent || 'none';
  subagentDist[s] = (subagentDist[s] || 0) + 1;
}

// Category accuracy (for entries with expected_category)
const catSubset = accSubset.filter((r) => r.expected_category);
const catCorrect = catSubset.filter((r) => r.category_correct).length;
const categoryAccuracy = catSubset.length ? catCorrect / catSubset.length : null;

// Wrong predictions detail (for forensics)
const wrongDetail = accSubset.filter((r) => !r.tier_correct).map((r) => ({
  id: r.id,
  source: r.source,
  expected: r.expected_tier,
  predicted: r.predicted_tier,
  confidence: r.confidence,
  escalation: r.escalation_rule,
  prompt_preview: r.prompt_preview,
}));

const report = {
  _meta: {
    generated_at: new Date().toISOString(),
    corpus_total: results.length,
    accuracy_subset_size: accSubset.length,
    classify_avg_ms: +(elapsed / results.length).toFixed(1),
    classify_total_ms: elapsed,
  },
  tier_accuracy: {
    overall: +(tierAccuracy * 100).toFixed(1),
    correct: tierCorrect,
    total: accSubset.length,
    target_pct: 85,
    hard_fail_threshold_pct: 70,
    passes_target: tierAccuracy >= 0.85,
    passes_hard_fail: tierAccuracy >= 0.70,
  },
  category_accuracy: {
    overall_pct: categoryAccuracy !== null ? +(categoryAccuracy * 100).toFixed(1) : null,
    correct: catCorrect,
    total: catSubset.length,
  },
  confusion_matrix: confusion,
  per_tier_accuracy: perTierAccuracy,
  calibration_curve: calibration,
  by_class: byClass,
  by_language: byLanguage,
  escalation_rule_distribution: escalationDist,
  suggested_providers_distribution: providerDist,
  suggested_subagent_distribution: subagentDist,
  wrong_predictions: wrongDetail,
  raw_results: results,
};

fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2));
console.error(`\nWrote accuracy-report.json (${results.length} results, ${accSubset.length} in accuracy subset)\n`);

// ── Summary print ──────────────────────────────────────────────────────

console.log('=== TIER ACCURACY ===');
console.log(`Overall: ${(tierAccuracy * 100).toFixed(1)}% (${tierCorrect}/${accSubset.length})`);
console.log(`Target ≥85%: ${tierAccuracy >= 0.85 ? 'PASS' : 'FAIL'}`);
console.log(`Hard fail ≥70%: ${tierAccuracy >= 0.70 ? 'PASS' : 'WARN_ACCURACY_LOW — STOP'}`);
console.log('\nPer-tier:');
for (const t of tiers) {
  const a = perTierAccuracy[t];
  console.log(`  ${t}: ${a.correct}/${a.total} (${a.accuracy !== null ? (a.accuracy * 100).toFixed(0) + '%' : 'n/a'})`);
}
console.log('\nConfusion matrix (rows=expected, cols=predicted):');
console.log(`     ${tiers.map((t) => t.padStart(4)).join(' ')}`);
for (const exp of tiers) {
  const row = tiers.map((p) => String(confusion[exp][p]).padStart(4));
  console.log(`  ${exp}  ${row.join(' ')}`);
}
console.log('\nCalibration curve:');
for (const b of calibration) {
  const acc = b.accuracy !== null ? (b.accuracy * 100).toFixed(0) + '%' : 'n/a';
  console.log(`  ${b.bin}: ${b.correct}/${b.count} = ${acc}`);
}
console.log('\nEscalation rules:');
for (const [k, v] of Object.entries(escalationDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(3)}  ${k}`);
}
console.log('\nSuggested providers (first):');
for (const [k, v] of Object.entries(providerDist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(3)}  ${k}`);
}
console.log('\nWrong predictions:', wrongDetail.length);
if (wrongDetail.length) {
  for (const w of wrongDetail.slice(0, 15)) {
    console.log(`  ${w.id} [${w.source}] expected=${w.expected} predicted=${w.predicted} conf=${w.confidence} — ${w.prompt_preview}`);
  }
  if (wrongDetail.length > 15) console.log(`  ... and ${wrongDetail.length - 15} more (see accuracy-report.json)`);
}

if (tierAccuracy < 0.70) {
  console.log('\n❌ HARD FAIL — accuracy below 70% threshold. Per master prompt: STOP. Do not invoke providers.');
  process.exit(1);
}
