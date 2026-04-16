#!/usr/bin/env node
/**
 * validate-set.js — run the live classifier against validation-set.json and
 * report per-section drift (canonical / adversarial / historical).
 *
 * Complements (does NOT replace) replay.js --gold-labels, which runs the flat
 * legacy gold-labels.json. This tool is the structured, trust-level-aware
 * drift detector described in docs/METHODOLOGY.md §16.
 *
 * Exit codes:
 *   0  — overall tier accuracy within targets (canonical 100%, overall >= 85%)
 *   1  — gate fail in --strict mode
 *   2  — validation-set.json missing or malformed
 *
 * Usage:
 *   node validate-set.js                    # human-readable report
 *   node validate-set.js --json out.json    # machine-readable
 *   node validate-set.js --strict           # exit 1 if gates fail
 *   node validate-set.js --section canonical  # only one section
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CLASSIFY = path.join(__dirname, 'classify.js');
const VSET_PATH = path.join(__dirname, 'validation-set.json');

const args = process.argv.slice(2);
const argi = (k) => args.indexOf(k);
const jsonOut = argi('--json') >= 0 ? args[argi('--json') + 1] : null;
const strict = argi('--strict') >= 0;
const sectionFilter = argi('--section') >= 0 ? args[argi('--section') + 1] : null;

// Hot-load classify() the same way replay.js does.
if (!fs.existsSync(CLASSIFY)) {
  console.error(`classify.js not found at ${CLASSIFY}`);
  process.exit(2);
}
const classifySrc = fs.readFileSync(CLASSIFY, 'utf8');
const iifeIdx = classifySrc.search(/\(async \(\) => \{/);
if (iifeIdx < 0) {
  console.error('Failed to locate classify.js IIFE — has the file shape changed?');
  process.exit(2);
}
const classifyBody = classifySrc.slice(0, iifeIdx).replace(/^#!.*\n/, '');
// eslint-disable-next-line no-new-func
const classify = new Function('require', `${classifyBody}\nreturn classify;`)(require);

if (!fs.existsSync(VSET_PATH)) {
  console.error(`validation-set.json not found at ${VSET_PATH}`);
  process.exit(2);
}
const vset = JSON.parse(fs.readFileSync(VSET_PATH, 'utf8'));

const sections = sectionFilter ? [sectionFilter] : ['canonical', 'adversarial', 'historical'];
const results = {};
const misses = [];

for (const section of sections) {
  const entries = (vset[section] || []).filter(
    (e) => e && typeof e.prompt === 'string' && e.expected_tier
  );
  let correctTier = 0;
  let correctCategory = 0;
  let correctBackend = 0;
  let categoryApplicable = 0;
  let backendApplicable = 0;
  for (const e of entries) {
    const d = classify(e.prompt);
    // v0.10.2: measure pre-degradation tier for accuracy.
    // If the classifier correctly identified T1 but infra degraded to T0
    // (no API key), that's an infrastructure issue, not a classifier bug.
    // Same for budget_cap_downgrade. We measure classifier quality here.
    let effectiveTier = d.tier;
    if (d.escalation_rule && d.escalation_rule.includes('haiku_unavailable')) {
      // T1 was degraded to T0 — restore pre-degradation tier
      const ladder = ['T0', 'T1', 'T2', 'T3'];
      const idx = ladder.indexOf(d.tier);
      if (idx >= 0 && idx < 3) effectiveTier = ladder[idx + 1];
    }
    if (d.escalation_rule && d.escalation_rule.includes('budget_cap_downgrade')) {
      const ladder = ['T0', 'T1', 'T2', 'T3'];
      const idx = ladder.indexOf(d.tier);
      if (idx >= 0 && idx < 3) effectiveTier = ladder[idx + 1];
    }
    const tierOk = effectiveTier === e.expected_tier;
    if (tierOk) correctTier++;
    if (e.expected_category) {
      categoryApplicable++;
      if (d.task_category === e.expected_category) correctCategory++;
    }
    if (e.expected_backend) {
      backendApplicable++;
      if (d.recommended_backend === e.expected_backend) correctBackend++;
    }
    if (!tierOk) {
      misses.push({
        section,
        prompt: e.prompt.slice(0, 80),
        expected_tier: e.expected_tier,
        actual_tier: effectiveTier,
        raw_tier: d.tier !== effectiveTier ? d.tier : undefined,
        expected_category: e.expected_category || null,
        actual_category: d.task_category,
        confidence: d.confidence,
        trust: e.trust,
        notes: e.notes || null,
      });
    }
  }
  const n = entries.length;
  results[section] = {
    n,
    tier_accuracy: n > 0 ? +((correctTier / n) * 100).toFixed(1) : 0,
    category_accuracy: categoryApplicable > 0 ? +((correctCategory / categoryApplicable) * 100).toFixed(1) : null,
    backend_accuracy: backendApplicable > 0 ? +((correctBackend / backendApplicable) * 100).toFixed(1) : null,
  };
}

const totalN = sections.reduce((s, k) => s + (results[k].n || 0), 0);
const totalCorrect = sections.reduce((s, k) => {
  const n = results[k].n || 0;
  const acc = (results[k].tier_accuracy || 0) / 100;
  return s + Math.round(n * acc);
}, 0);
const overall = totalN > 0 ? +((totalCorrect / totalN) * 100).toFixed(1) : 0;

const canonical = results.canonical || { tier_accuracy: 0, n: 0 };
const gateFail = [];
if (canonical.n > 0 && canonical.tier_accuracy < 100) {
  gateFail.push(`canonical tier accuracy ${canonical.tier_accuracy}% < 100%`);
}
if (overall < 85) {
  gateFail.push(`overall tier accuracy ${overall}% < 85%`);
}

const report = {
  validation_set_version: vset._version,
  reference_model: vset._reference_model,
  sections: results,
  overall_tier_accuracy: overall,
  total_entries: totalN,
  misses_count: misses.length,
  misses_sample: misses.slice(0, 15),
  gate_fail: gateFail,
  gate_pass: gateFail.length === 0,
  strict,
};

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  console.log(`wrote ${jsonOut} (${totalN} entries evaluated)`);
} else {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  STRUCTURED VALIDATION  —  classifier vs validation-set.json     ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  for (const section of sections) {
    const r = results[section];
    if (!r.n) { console.log(`  ${section.padEnd(12)}  (empty)`); continue; }
    const catStr = r.category_accuracy != null ? ` · cat ${r.category_accuracy}%` : '';
    const backStr = r.backend_accuracy != null ? ` · backend ${r.backend_accuracy}%` : '';
    console.log(`  ${section.padEnd(12)}  n=${String(r.n).padStart(3)}  tier ${String(r.tier_accuracy).padStart(5)}%${catStr}${backStr}`);
  }
  console.log('  ' + '─'.repeat(64));
  console.log(`  overall       n=${String(totalN).padStart(3)}  tier ${String(overall).padStart(5)}%`);
  console.log('');
  if (misses.length > 0) {
    console.log(`  Drift (showing up to 15 of ${misses.length}):`);
    for (const m of misses.slice(0, 15)) {
      console.log(`    [${m.section}] expected ${m.expected_tier} got ${m.actual_tier}  conf=${m.confidence}  "${m.prompt}"`);
    }
    console.log('');
  }
  if (gateFail.length === 0) {
    console.log('  GATE PASS (canonical 100%, overall >= 85%)');
  } else {
    console.log('  GATE ' + (strict ? 'FAIL' : 'DRIFT'));
    for (const msg of gateFail) console.log('    - ' + msg);
  }
  console.log('');
}

process.exit(gateFail.length > 0 && strict ? 1 : 0);
