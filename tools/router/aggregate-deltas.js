#!/usr/bin/env node
/**
 * aggregate-deltas.js — manual aggregator for frugal federated learning (v0.9).
 *
 * Usage:
 *   node aggregate-deltas.js delta-a.json delta-b.json [delta-c.json ...] --output tuning-v1.N.json
 *
 * Reads 2+ anonymized delta JSON files produced by `backtest.js --export-delta`,
 * validates them, groups fingerprints across users, applies hardware_tier
 * weights, and writes a router-tuning.json candidate that can be reviewed and
 * applied via update-router.js.
 *
 * Privacy: only consumes deltas that pass schema validation. Any file with
 * unexpected fields is rejected — this is a defensive guardrail against
 * accidentally ingesting a file with leaked prompt text.
 *
 * Pure stdlib. No network. Zero deps.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MIN_N_PER_DELTA = 3;   // minimum count per-instance before aggregation
const MIN_AGGREGATE_N = 3;   // minimum combined n across instances

// Hardware-tier weights applied to each delta's contribution. High-end GPUs
// get more weight because their usage reflects the target demographic (the
// Paulo is on a 4090 and tuning should lean toward that profile).
const HARDWARE_WEIGHTS = {
  'gpu-high': 1.2,
  'gpu-mid': 1.0,
  'gpu-low': 0.8,
  'cpu-only': 0.8,
  'apple-silicon': 1.0,
};

// Schema fields we accept. Any file with extra top-level fields or extra
// delta fields is rejected (privacy safety net).
const TOP_LEVEL_FIELDS = new Set([
  'frugal_version', 'classifier_version', 'generated_at',
  'instance_id', 'hardware_tier', 'deltas', 'promote_signals',
]);
const DELTA_FIELDS = new Set([
  'delta_type', 'decided_tier', 'correct_tier', 'prompt_len_bucket',
  'has_file_refs', 'has_code_block', 'keyword_signals', 'session_hour', 'n',
]);
const PROMOTE_FIELDS = new Set([
  'delta_type', 'decided_tier', 'correct_tier', 'keyword_signals', 'n',
]);

function validateDelta(data, filePath) {
  if (!data || typeof data !== 'object') {
    throw new Error(`${filePath}: not an object`);
  }
  for (const key of Object.keys(data)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      throw new Error(`${filePath}: unexpected top-level field "${key}"`);
    }
  }
  if (!Array.isArray(data.deltas)) {
    throw new Error(`${filePath}: deltas must be an array`);
  }
  for (const d of data.deltas) {
    for (const key of Object.keys(d)) {
      if (!DELTA_FIELDS.has(key)) {
        throw new Error(`${filePath}: unexpected delta field "${key}" (possible PII leak)`);
      }
    }
  }
  if (data.promote_signals && !Array.isArray(data.promote_signals)) {
    throw new Error(`${filePath}: promote_signals must be an array`);
  }
  for (const p of data.promote_signals || []) {
    for (const key of Object.keys(p)) {
      if (!PROMOTE_FIELDS.has(key)) {
        throw new Error(`${filePath}: unexpected promote_signal field "${key}"`);
      }
    }
  }
  return true;
}

function groupKey(delta) {
  const signals = (delta.keyword_signals || []).slice().sort().join(',');
  return `${delta.decided_tier}|${delta.correct_tier}|${signals}`;
}

function aggregate(files) {
  const demoteGroups = new Map();
  const promoteGroups = new Map();
  const instances = new Set();

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    validateDelta(data, file);

    const weight = HARDWARE_WEIGHTS[data.hardware_tier] || 1.0;
    instances.add(data.instance_id);

    for (const d of data.deltas || []) {
      if (d.n < MIN_N_PER_DELTA) continue;
      const key = groupKey(d);
      const existing = demoteGroups.get(key) || {
        decided_tier: d.decided_tier,
        correct_tier: d.correct_tier,
        keyword_signals: d.keyword_signals,
        n: 0,
        weighted_n: 0,
        instances: new Set(),
      };
      existing.n += d.n;
      existing.weighted_n += d.n * weight;
      existing.instances.add(data.instance_id);
      demoteGroups.set(key, existing);
    }

    for (const p of data.promote_signals || []) {
      if (p.n < MIN_N_PER_DELTA) continue;
      const key = groupKey(p);
      const existing = promoteGroups.get(key) || {
        decided_tier: p.decided_tier,
        correct_tier: p.correct_tier,
        keyword_signals: p.keyword_signals,
        n: 0,
        weighted_n: 0,
        instances: new Set(),
      };
      existing.n += p.n;
      existing.weighted_n += p.n * weight;
      existing.instances.add(data.instance_id);
      promoteGroups.set(key, existing);
    }
  }

  // Filter: keep only groups with enough combined signal.
  const demotes = [...demoteGroups.values()]
    .filter((g) => g.n >= MIN_AGGREGATE_N)
    .map((g) => ({
      ...g,
      instances: g.instances.size,
      weighted_n: Math.round(g.weighted_n * 10) / 10,
    }));
  const promotes = [...promoteGroups.values()]
    .filter((g) => g.n >= MIN_AGGREGATE_N)
    .map((g) => ({
      ...g,
      instances: g.instances.size,
      weighted_n: Math.round(g.weighted_n * 10) / 10,
    }));

  return {
    version: '1.0.0',
    generated_at: new Date().toISOString(),
    contributors: instances.size,
    total_deltas: demotes.length + promotes.length,
    tuning: {
      demote: demotes,
      promote: promotes,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;
  const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--output');

  if (files.length < 1) {
    console.error('usage: node aggregate-deltas.js delta1.json delta2.json [...] --output tuning-v1.N.json');
    process.exit(1);
  }
  if (!outputPath) {
    console.error('error: --output <path> is required');
    process.exit(1);
  }
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`error: ${f} not found`);
      process.exit(1);
    }
  }

  let tuning;
  try {
    tuning = aggregate(files);
  } catch (err) {
    console.error(`aggregate error: ${err.message}`);
    process.exit(2);
  }

  fs.writeFileSync(outputPath, JSON.stringify(tuning, null, 2));
  console.log(`aggregate-deltas: written ${outputPath}`);
  console.log(`  contributors:    ${tuning.contributors}`);
  console.log(`  total_deltas:    ${tuning.total_deltas}`);
  console.log(`  demote groups:   ${tuning.tuning.demote.length}`);
  console.log(`  promote groups:  ${tuning.tuning.promote.length}`);
}

if (require.main === module) main();

module.exports = { aggregate, validateDelta, HARDWARE_WEIGHTS };
