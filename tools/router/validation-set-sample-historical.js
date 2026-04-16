#!/usr/bin/env node
/**
 * validation-sample-historical.js — sample high-confidence historical entries
 * from decisions.log and append to validation-set.json under `historical[]`.
 *
 * Trust level: assumed_correct (lower than canonical/adversarial). Used for
 * drift detection — if the current classifier disagrees with a stable high-conf
 * past decision, that's a signal worth investigating.
 *
 * Strategy: stratified sample across T0/T1/T2/T3, confidence >= 0.9, no arbiter
 * override (those are the clearest signal), prompts >= 20 chars, dedup by
 * prompt_preview.
 *
 * Usage:
 *   node validation-sample-historical.js             # add 40 entries (default)
 *   node validation-sample-historical.js --n 80      # custom count
 *   node validation-sample-historical.js --dry-run   # show what would be added
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const LOG_PATH = path.join(ROUTER_DIR, 'decisions.log');
const VSET_PATH = path.join(ROUTER_DIR, 'validation-set.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const nIdx = args.indexOf('--n');
const targetN = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) : 40;
const minConfidence = 0.9;

function loadClassified() {
  const lines = fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.event !== 'classified') continue;
      if (typeof e.confidence !== 'number' || e.confidence < minConfidence) continue;
      if (!e.tier || !e.task_category) continue;
      if (e.arbiter_honored) continue; // arbiter-decided cases are less clean
      if (!e.prompt_preview || e.prompt_preview.trim().length < 20) continue;
      out.push(e);
    } catch (_) { /* skip malformed */ }
  }
  return out;
}

function stratifiedSample(entries, perTier) {
  const buckets = { T0: [], T1: [], T2: [], T3: [] };
  for (const e of entries) {
    if (buckets[e.tier]) buckets[e.tier].push(e);
  }
  const out = [];
  const seen = new Set();
  for (const tier of Object.keys(buckets)) {
    // Shuffle deterministically by ts_ms
    buckets[tier].sort((a, b) => (a.ts_ms || 0) - (b.ts_ms || 0));
    for (const e of buckets[tier]) {
      const key = (e.prompt_preview || '').trim().slice(0, 80).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.filter(x => x.tier === tier).length >= perTier) break;
    }
  }
  return out;
}

function toValidationEntry(e) {
  return {
    prompt: (e.prompt_preview || '').trim(),
    expected_tier: e.tier,
    expected_category: e.task_category,
    expected_backend: e.recommended_backend || null,
    trust: 'assumed_correct',
    confidence_source: 'historical_high_conf',
    notes: `Sampled from decisions.log ts=${e.ts} conf=${e.confidence} (classifier v=${e.classifier_version || 'unknown'})`
  };
}

function main() {
  if (!fs.existsSync(LOG_PATH)) {
    console.error('decisions.log not found at', LOG_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(VSET_PATH)) {
    console.error('validation-set.json not found at', VSET_PATH);
    process.exit(1);
  }

  const classified = loadClassified();
  const perTier = Math.ceil(targetN / 4);
  const sampled = stratifiedSample(classified, perTier).slice(0, targetN);

  console.log(`Found ${classified.length} classified events with confidence >= ${minConfidence}`);
  console.log(`Sampled ${sampled.length} entries (target ${targetN}, stratified by tier)`);

  const byTier = sampled.reduce((acc, e) => {
    acc[e.tier] = (acc[e.tier] || 0) + 1; return acc;
  }, {});
  console.log('Distribution:', byTier);

  if (dryRun) {
    console.log('\n--- DRY RUN — first 3 entries ---');
    sampled.slice(0, 3).forEach((e, i) => {
      console.log(`\n[${i}]`, toValidationEntry(e));
    });
    return;
  }

  const vset = JSON.parse(fs.readFileSync(VSET_PATH, 'utf8'));
  vset.historical = sampled.map(toValidationEntry);
  vset._updated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(VSET_PATH, JSON.stringify(vset, null, 2) + '\n');
  console.log(`\nWrote ${vset.historical.length} historical entries to validation-set.json`);
}

main();
