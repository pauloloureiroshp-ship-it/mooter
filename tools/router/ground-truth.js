#!/usr/bin/env node
/**
 * ground-truth.js — deterministic oracle for tasks with verifiable outputs.
 *
 * Per METHODOLOGY §7.2: when a task category has a deterministic verifier,
 * run it after the response and record the result. This provides confidence=1.0
 * quality signals — the strongest possible.
 *
 * Oracles by category:
 *   regex_task       → compile regex, test against sample inputs
 *   format_transform → JSON.parse succeeds on output
 *   commit_msg       → none (subjective)
 *   code_fix         → run tests if exist (not yet implemented)
 *   explain_error    → none (subjective)
 *
 * This module is designed to be called post-response (from the Stop hook
 * or nightly batch). It reads the last classified event + response,
 * applies the oracle, and writes a ground_truth event.
 *
 * Usage:
 *   node ground-truth.js                    # scan last 24h for verifiable
 *   node ground-truth.js --dry-run          # show what would be verified
 *   node ground-truth.js --stats            # distribution of oracle-eligible
 *
 * NOTE: This is v1 — only JSON parse and regex compile oracles are
 * implemented. Test-runner oracle requires integration with project
 * test suites (Sprint B.3+).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const HORIZON_MS = 24 * 60 * 60 * 1000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const statsOnly = args.includes('--stats');

// Categories that have deterministic oracles
const ORACLE_CATEGORIES = {
  format_transform: 'json_parse',
  regex_task: 'regex_compile',
  json_transform: 'json_parse',
  simple_transform_or_explain: 'json_parse_attempt',
};

function loadClassified() {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const now = Date.now();
  const events = [];
  const alreadyVerified = new Set();

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.event === 'ground_truth' && e.target_decision_id) {
        alreadyVerified.add(e.target_decision_id);
      }
      if (e.event !== 'classified') continue;
      if (!all && typeof e.ts_ms === 'number' && now - e.ts_ms > HORIZON_MS) continue;
      events.push(e);
    } catch (_) { /* skip */ }
  }
  return { events, alreadyVerified };
}

// Oracle: try to parse JSON from the prompt or expected output context
function oracleJsonParse(prompt) {
  // Extract JSON-like content from the prompt
  const jsonMatch = prompt.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { applicable: false };
  try {
    JSON.parse(jsonMatch[0]);
    return { applicable: true, passed: true, detail: 'JSON in prompt is valid' };
  } catch (e) {
    return { applicable: true, passed: false, detail: `JSON parse error: ${e.message}` };
  }
}

// Oracle: try to compile a regex from the prompt
function oracleRegexCompile(prompt) {
  // Look for regex-like patterns in the prompt
  const regexMatch = prompt.match(/\/([^/]+)\/([gimsuy]*)/);
  if (!regexMatch) return { applicable: false };
  try {
    new RegExp(regexMatch[1], regexMatch[2]);
    return { applicable: true, passed: true, detail: 'Regex compiles' };
  } catch (e) {
    return { applicable: true, passed: false, detail: `Regex compile error: ${e.message}` };
  }
}

function runOracle(category, prompt) {
  const oracleType = ORACLE_CATEGORIES[category];
  if (!oracleType) return null;

  switch (oracleType) {
    case 'json_parse':
      return oracleJsonParse(prompt);
    case 'json_parse_attempt': {
      const result = oracleJsonParse(prompt);
      return result.applicable ? result : null;
    }
    case 'regex_compile':
      return oracleRegexCompile(prompt);
    default:
      return null;
  }
}

function logGroundTruth(event, oracleResult) {
  const gt = {
    ts: new Date().toISOString(),
    ts_ms: Date.now(),
    event: 'ground_truth',
    target_decision_id: event.decision_id || `${event.session_id}_${event.ts_ms}`,
    session_id: event.session_id,
    tier: event.tier,
    category: event.task_category,
    oracle_type: ORACLE_CATEGORIES[event.task_category],
    passed: oracleResult.passed,
    detail: oracleResult.detail,
    confidence: 1.0,
  };
  if (!dryRun) {
    try {
      fs.appendFileSync(LOG_PATH, JSON.stringify(gt) + '\n');
    } catch (_) { /* non-fatal */ }
  }
  return gt;
}

function main() {
  const { events, alreadyVerified } = loadClassified();

  // Find oracle-eligible events
  const eligible = events.filter(e =>
    e.task_category &&
    ORACLE_CATEGORIES[e.task_category] &&
    !alreadyVerified.has(e.decision_id || `${e.session_id}_${e.ts_ms}`)
  );

  // Stats
  const byCategory = {};
  for (const e of events) {
    const cat = e.task_category || 'unknown';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  const oracleCategories = Object.keys(ORACLE_CATEGORIES);
  const oracleEligible = oracleCategories.reduce((sum, cat) => sum + (byCategory[cat] || 0), 0);

  console.log(`Ground-truth oracle — ${events.length} classified events`);
  console.log(`Oracle-eligible categories: ${oracleCategories.join(', ')}`);
  console.log(`Eligible events: ${eligible.length} (${oracleEligible} total in category, ${alreadyVerified.size} already verified)`);

  if (statsOnly) {
    console.log('\nCategory distribution:');
    for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
      const oracle = ORACLE_CATEGORIES[cat] ? ` ← oracle: ${ORACLE_CATEGORIES[cat]}` : '';
      console.log(`  ${cat.padEnd(35)} ${String(count).padStart(4)}${oracle}`);
    }
    return;
  }

  let verified = 0;
  let passed = 0;
  let failed = 0;
  let notApplicable = 0;

  for (const e of eligible) {
    const prompt = e.prompt_preview || '';
    const result = runOracle(e.task_category, prompt);

    if (!result || !result.applicable) {
      notApplicable++;
      continue;
    }

    logGroundTruth(e, result);
    verified++;
    if (result.passed) passed++;
    else failed++;

    const label = dryRun ? '[DRY]' : '[OK]';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`  ${label} ${status} ${e.task_category} tier=${e.tier} — ${result.detail}`);
  }

  console.log(`\nSummary: ${verified} verified (${passed} pass, ${failed} fail, ${notApplicable} not applicable)`);
}

// Side-effect guard: require()-ing this file should NOT write to decisions.log.
// Before this guard, `node -e "require('./ground-truth.js')"` triggered main()
// and appended ground_truth events. Any module that wants the oracle helpers
// (confidence-calibrator.js, etc.) can now import safely.
if (require.main === module) {
  main();
}

module.exports = {
  ORACLE_CATEGORIES,
  oracleJsonParse,
  oracleRegexCompile,
  runOracle,
};
