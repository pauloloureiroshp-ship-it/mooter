#!/usr/bin/env node
/**
 * validation-set.test.js — schema/shape validation of validation-set.json.
 *
 * Does NOT test classifier accuracy (that's replay.js --gold-labels). This
 * file only ensures the dataset itself is well-formed.
 *
 * Run: node validation-set.test.js
 * Exit: 0 ok, 1 any failure.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const VSET_PATH = path.join(__dirname, 'validation-set.json');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function assertEntry(entry, section, idx) {
  const loc = `${section}[${idx}]`;
  assert(typeof entry === 'object' && entry !== null, `${loc} must be an object`);

  if (section === 'historical' && entry._note) return; // placeholder comment entry

  assert(typeof entry.prompt === 'string' && entry.prompt.length > 0,
    `${loc}.prompt must be a non-empty string`);
  assert(entry.prompt.length <= 1000,
    `${loc}.prompt must be <= 1000 chars (got ${entry.prompt.length})`);
  assert(['T0', 'T1', 'T2', 'T3'].includes(entry.expected_tier),
    `${loc}.expected_tier must be T0|T1|T2|T3 (got ${entry.expected_tier})`);

  if (entry.expected_category !== undefined) {
    assert(typeof entry.expected_category === 'string' && entry.expected_category.length > 0,
      `${loc}.expected_category must be a non-empty string if present`);
  }
  if (entry.expected_backend !== undefined && entry.expected_backend !== null) {
    assert(typeof entry.expected_backend === 'string',
      `${loc}.expected_backend must be a string if present`);
  }
  assert(['ground_truth', 'assumed_correct', 'low'].includes(entry.trust),
    `${loc}.trust must be ground_truth|assumed_correct|low (got ${entry.trust})`);
  // Valid sources: the original 4 + any `mooter_review_N` entry added by the
  // mooter-review pipeline (which appends canonical labels with an incremental
  // review-cycle suffix — e.g. mooter_review_1, mooter_review_2).
  const validSource =
    ['canonical', 'adversarial', 'historical_high_conf', 'manual'].includes(entry.confidence_source) ||
    /^mooter_review_\d+$/.test(entry.confidence_source);
  assert(validSource,
    `${loc}.confidence_source is invalid (got ${entry.confidence_source})`);
  assert(typeof entry.notes === 'string',
    `${loc}.notes must be a string (docs why this label is correct)`);
}

function main() {
  assert(fs.existsSync(VSET_PATH), 'validation-set.json does not exist');

  const raw = fs.readFileSync(VSET_PATH, 'utf8');
  let vset;
  try {
    vset = JSON.parse(raw);
  } catch (e) {
    console.error('FAIL: validation-set.json is not valid JSON:', e.message);
    process.exit(1);
  }

  assert(typeof vset._version === 'number', '_version must be a number');
  assert(vset._version >= 1, '_version must be >= 1');
  assert(typeof vset._reference_model === 'string', '_reference_model must be a string');
  assert(typeof vset._description === 'string', '_description must be a string');

  assert(Array.isArray(vset.canonical), 'canonical must be an array');
  assert(Array.isArray(vset.adversarial), 'adversarial must be an array');
  assert(Array.isArray(vset.historical), 'historical must be an array');

  assert(vset.canonical.length >= 10,
    `canonical must have >= 10 entries (got ${vset.canonical.length})`);
  assert(vset.adversarial.length >= 20,
    `adversarial must have >= 20 entries (got ${vset.adversarial.length})`);

  vset.canonical.forEach((e, i) => assertEntry(e, 'canonical', i));
  vset.adversarial.forEach((e, i) => assertEntry(e, 'adversarial', i));
  vset.historical.forEach((e, i) => assertEntry(e, 'historical', i));

  // Tier distribution sanity — canonical+adversarial should cover all 4 tiers
  const labeled = [...vset.canonical, ...vset.adversarial].filter((e) => !e._note);
  const tiers = new Set(labeled.map((e) => e.expected_tier));
  assert(tiers.size === 4, `canonical+adversarial must cover all 4 tiers (got ${[...tiers].join(',')})`);

  // No duplicate prompts within the labeled sections
  const seen = new Set();
  for (const e of labeled) {
    const key = e.prompt.trim().toLowerCase();
    assert(!seen.has(key), `duplicate prompt detected: "${e.prompt.slice(0, 60)}..."`);
    seen.add(key);
  }

  const total = vset.canonical.length + vset.adversarial.length + vset.historical.length;
  console.log(`OK — validation-set.json is well-formed`);
  console.log(`  canonical   ${vset.canonical.length}`);
  console.log(`  adversarial ${vset.adversarial.length}`);
  console.log(`  historical  ${vset.historical.length}`);
  console.log(`  total       ${total}`);
  console.log(`  tiers       ${[...tiers].sort().join(', ')}`);
}

main();
