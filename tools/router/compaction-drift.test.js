'use strict';

const test = require('node:test');
const assert = require('node:assert');
const D = require('./compaction-drift.js');

test('cosineDistance — identical → 0, orthogonal → 1, opposite → 2, bad shape → null', () => {
  assert.ok(Math.abs(D.cosineDistance([1, 0, 0], [1, 0, 0])) < 1e-9);
  assert.ok(Math.abs(D.cosineDistance([1, 0], [0, 1]) - 1) < 1e-9);
  assert.ok(Math.abs(D.cosineDistance([1, 0], [-1, 0]) - 2) < 1e-9);
  assert.strictEqual(D.cosineDistance([1, 0], [1, 0, 0]), null);
  assert.strictEqual(D.cosineDistance([0, 0], [1, 1]), null); // zero vector
  assert.strictEqual(D.cosineDistance('x', [1]), null);
});

test('updateCentroid — running mean; seeds on shape mismatch', () => {
  // mean of [0,0] and [2,2] with count=1 → [1,1]
  assert.deepStrictEqual(D.updateCentroid([0, 0], [2, 2], 1), [1, 1]);
  // shape mismatch → take the new vec
  assert.deepStrictEqual(D.updateCentroid([0], [9, 9], 3), [9, 9]);
  // empty vec → keep centroid
  assert.deepStrictEqual(D.updateCentroid([1, 2], [], 1), [1, 2]);
});

test('percentileThreshold — null below MIN_SAMPLES, else interpolated p90', () => {
  assert.strictEqual(D.percentileThreshold([0.1, 0.2, 0.3]), null); // < 5 samples
  const xs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const p90 = D.percentileThreshold(xs, 0.9);
  assert.ok(p90 >= 0.9 && p90 <= 1.0, `p90=${p90}`);
  assert.ok(D.percentileThreshold(xs, 0.5) < p90); // p50 < p90
});

test('stage2Drift — first embedding seeds the centroid (no fire)', () => {
  const r = D.stage2Drift(null, [1, 0, 0]);
  assert.strictEqual(r.fired, false);
  assert.strictEqual(r.reason, 'seeded');
  assert.deepStrictEqual(r.state.centroid, [1, 0, 0]);
  assert.strictEqual(r.state.count, 1);
});

test('stage2Drift — no embedding → no signal, state unchanged', () => {
  const s = { centroid: [1, 0], count: 3, distances: [0.1] };
  const r = D.stage2Drift(s, null);
  assert.strictEqual(r.fired, false);
  assert.strictEqual(r.reason, 'no_embedding');
  assert.strictEqual(r.state, s);
});

test('stage2Drift — within-topic stays, a far pivot fires once the percentile is known', () => {
  // Build a session of near-identical "topic A" turns to populate distances + threshold.
  let s = D.stage2Drift(null, [1, 0, 0]).state;
  for (let i = 0; i < 8; i++) {
    // tiny jitter around topic A → small distances
    s = D.stage2Drift(s, [1, 0.01 * (i % 3), 0]).state;
  }
  // a within-topic turn should NOT fire
  const near = D.stage2Drift(s, [1, 0.005, 0]);
  assert.strictEqual(near.fired, false, `near drift=${near.drift} thr=${near.threshold}`);
  // a hard pivot to an orthogonal topic B should fire (distance ~1 >> p90 of ~0.0x)
  const pivot = D.stage2Drift(near.state, [0, 1, 0]);
  assert.strictEqual(pivot.fired, true, `pivot drift=${pivot.drift} thr=${pivot.threshold}`);
  assert.strictEqual(pivot.reason, 'drift_fired');
});

test('stage2Drift — distances window is bounded (no unbounded growth)', () => {
  let s = D.stage2Drift(null, [1, 0]).state;
  for (let i = 0; i < 120; i++) s = D.stage2Drift(s, [Math.cos(i), Math.sin(i)]).state;
  assert.ok(s.distances.length <= D.MAX_DISTANCES, `len=${s.distances.length}`);
});

// --- Fase 3: qwen arbiter (pure helpers) ---
test('needsArbiter — true only in the borderline band around the threshold', () => {
  assert.strictEqual(D.needsArbiter(0.5, 0.5), true);   // exactly on
  assert.strictEqual(D.needsArbiter(0.55, 0.5), true);  // +10% within 25%
  assert.strictEqual(D.needsArbiter(0.5, 0.4), true);   // |0.5-0.4|/0.4 = 0.25 edge
  assert.strictEqual(D.needsArbiter(1.0, 0.4), false);  // far above
  assert.strictEqual(D.needsArbiter(0.1, 0.4), false);  // far below
  assert.strictEqual(D.needsArbiter(null, 0.4), false);
  assert.strictEqual(D.needsArbiter(0.5, null), false);
  assert.strictEqual(D.needsArbiter(0.5, 0), false);    // bad threshold
});

test('parseArbiterVerdict — tolerant SAME/NEW (last occurrence wins; word-bounded)', () => {
  assert.strictEqual(D.parseArbiterVerdict('SAME'), 'SAME');
  assert.strictEqual(D.parseArbiterVerdict('new'), 'NEW');
  assert.strictEqual(D.parseArbiterVerdict('A resposta é: NEW.'), 'NEW');
  assert.strictEqual(D.parseArbiterVerdict('SAME or NEW? → NEW'), 'NEW');
  assert.strictEqual(D.parseArbiterVerdict('não sei'), null);
  assert.strictEqual(D.parseArbiterVerdict(''), null);
  assert.strictEqual(D.parseArbiterVerdict('renewable sameness'), null); // no bare SAME/NEW
});

test('arbiterPrompt — embeds both messages and forces a one-word answer', () => {
  const p = D.arbiterPrompt('fix the auth bug', 'now write the README');
  assert.ok(p.includes('fix the auth bug') && p.includes('now write the README'));
  assert.ok(/\bSAME\b/.test(p) && /\bNEW\b/.test(p));
});
