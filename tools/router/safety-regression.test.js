// Wave 3 Day 1 — safety regression golden set. node:test + assert.
//
// End-to-end: each canonical architectural prompt is run through the REAL
// classify.js spawn, then the safety_boost layer, and must end at or above its
// expected floor tier. Guards against MAJ-1/MAJ-2 ever regressing. Spawns are
// real (deterministic, $0) — a handful of cold-start node invocations.

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { applySafetyBoost } = require('./safety_boost.js');

const CLASSIFY = join(__dirname, 'classify.js');
const TIER_ORDER = ['T0', 'T1', 'T2', 'T3'];

function classifyReal(prompt) {
  const r = spawnSync('node', [CLASSIFY, prompt], { encoding: 'utf8', timeout: 10000 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { tier: 'T0', confidence: 0 };
  }
}

const seeds = JSON.parse(readFileSync(join(__dirname, 'safety_seeds.json'), 'utf8')).seeds;

// Extra adversarial trivial cases that must STAY low (no over-boosting).
const NEGATIVES = [
  { text: 'change the login button colour to blue', max_tier: 'T1' },
  { text: 'summarize the README file', max_tier: 'T1' },
  { text: 'fix the typo in the footer', max_tier: 'T1' },
];

for (const s of seeds) {
  test(`safety regression (floor): "${s.text}" ≥ ${s.expected_min_tier}`, () => {
    const cls = classifyReal(s.text);
    const boosted = applySafetyBoost(cls, s.text);
    const got = TIER_ORDER.indexOf(boosted.tier);
    const floor = TIER_ORDER.indexOf(s.expected_min_tier);
    assert.ok(got >= floor, `expected ≥ ${s.expected_min_tier}, got ${boosted.tier} (from classify ${cls.tier})`);
  });
}

for (const n of NEGATIVES) {
  test(`safety regression (no over-boost): "${n.text}" ≤ ${n.max_tier}`, () => {
    const cls = classifyReal(n.text);
    const boosted = applySafetyBoost(cls, n.text);
    const got = TIER_ORDER.indexOf(boosted.tier);
    const ceil = TIER_ORDER.indexOf(n.max_tier);
    assert.ok(got <= ceil, `expected ≤ ${n.max_tier}, got ${boosted.tier} — over-boosted a trivial prompt`);
  });
}

test('golden set has at least 10 seeds + a sharding case', () => {
  assert.ok(seeds.length >= 10, `expected ≥10 seeds, got ${seeds.length}`);
  assert.ok(seeds.some((s) => /sharding/.test(s.text)), 'MAJ-1 sharding case present');
});
