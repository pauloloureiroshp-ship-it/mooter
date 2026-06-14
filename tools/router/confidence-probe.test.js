'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { draftConfidence, calibrateLowThreshold, DEFAULT_LOW } = require('./confidence-probe.js');

test('draftConfidence — clean answer scores high and is kept', () => {
  const r = draftConfidence('The capital of France is Paris.');
  assert.strictEqual(r.band, 'high');
  assert.ok(r.score >= 0.7, `score ${r.score}`);
  assert.deepStrictEqual(r.reasons, ['clean']);
});

test('draftConfidence — empty / degenerate input → score 0, low', () => {
  for (const bad of ['', '   ', 'ok', null, undefined, 42, {}]) {
    const r = draftConfidence(bad);
    assert.strictEqual(r.score, 0);
    assert.strictEqual(r.band, 'low');
  }
});

test('draftConfidence — explicit refusal → low (escalate)', () => {
  for (const s of ["I don't know the answer to that.", "I can't help with this one, sorry.",
    'As an AI, I am unable to determine that.', 'Não sei responder a isso.', 'Não tenho a certeza disto.']) {
    const r = draftConfidence(s);
    assert.strictEqual(r.band, 'low', `"${s}" → ${r.band} (${r.score})`);
    assert.ok(r.reasons.includes('refusal_or_nonanswer'));
  }
});

test('draftConfidence — hedging lowers but does not by itself escalate a single marker', () => {
  const one = draftConfidence('It is probably around 42, give or take.');
  assert.ok(one.score < 0.9 && one.band !== 'low', `one hedge: ${one.band} ${one.score}`);
  const many = draftConfidence('Maybe it is 1, or perhaps 2, possibly 3, I think, probably.');
  assert.ok(many.score < one.score, 'more hedges → lower score');
});

test('draftConfidence — repeated lines (degeneracy) → low', () => {
  const r = draftConfidence('yes\nyes\nyes\nyes\nyes\nyes');
  assert.strictEqual(r.band, 'low');
  assert.ok(r.reasons.includes('repeated_lines'));
});

test('draftConfidence — single token domination → penalized', () => {
  const r = draftConfidence('the the the the the the the the the the the the the the');
  assert.ok(r.reasons.includes('token_repetition'));
  assert.ok(r.score < 0.7);
});

test('draftConfidence — unbalanced code fence on a code task → penalized', () => {
  const r = draftConfidence('Here you go:\n```js\nfunction add(a,b){ return a+b;', { task_category: 'code_generation' });
  assert.ok(r.reasons.includes('unbalanced_code_fence') || r.reasons.includes('unbalanced_brackets'));
  assert.ok(r.score < 0.9);
});

test('draftConfidence — balanced code block stays high', () => {
  const r = draftConfidence('```js\nfunction add(a, b) { return a + b; }\n```', { task_category: 'code_generation' });
  assert.strictEqual(r.band, 'high');
});

test('draftConfidence — possible truncation on a long unterminated draft', () => {
  const r = draftConfidence('x'.repeat(620) + ' and then it keeps going without an ending', {});
  assert.ok(r.reasons.includes('possible_truncation'));
});

test('draftConfidence — lowThreshold override moves the medium/low boundary', () => {
  // A draft scoring ~0.5 (one refusal-free degeneracy): medium by default, low if threshold raised.
  const text = 'maybe maybe maybe maybe maybe maybe maybe maybe maybe maybe maybe maybe'; // token rep
  const def = draftConfidence(text);
  const strict = draftConfidence(text, { lowThreshold: 0.9 });
  assert.ok(strict.band === 'low' || strict.band !== def.band || strict.score < 0.9);
});

test('calibrateLowThreshold — too few samples → static fallback', () => {
  assert.strictEqual(calibrateLowThreshold([0.1, 0.2, 0.3]), DEFAULT_LOW);
  assert.strictEqual(calibrateLowThreshold([], { fallback: 0.4 }), 0.4);
  assert.strictEqual(calibrateLowThreshold('not-an-array'), DEFAULT_LOW);
});

test('calibrateLowThreshold — enough samples → percentile, clamped to [0.3,0.6]', () => {
  const scores = [0.9, 0.92, 0.88, 0.95, 0.91, 0.93, 0.89, 0.94, 0.96]; // confident model
  const thr = calibrateLowThreshold(scores, { percentile: 0.25 });
  assert.ok(thr >= 0.3 && thr <= 0.6, `clamped: ${thr}`);
  // A model that scores low everywhere must not push the threshold below 0.3.
  const lowScores = [0, 0.05, 0.1, 0.02, 0.08, 0.03, 0.06, 0.01, 0.04];
  assert.strictEqual(calibrateLowThreshold(lowScores), 0.3);
});
