// node --test — Adapter Forge F4 gate logic (no Ollama; generator/judge injected).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeVerifiable, wilson, parseVerdict, judgePairwise, aggregate, runEval } from './forge_eval.mjs';

test('gradeVerifiable: exact is lenient (gabarito inside prose) + fraction', () => {
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: '3/10' }, 'The probability is 3/10.'), true);
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: 'yes' }, 'Yes, definitely.'), true);
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: '2,3,5' }, 'wrong answer'), false);
});

test('gradeVerifiable: json_equal ignores key order, catches wrong', () => {
  assert.equal(gradeVerifiable({ grading: 'json_equal', ground_truth: '{"a":1,"b":2}' }, 'here: {"b":2,"a":1}'), true);
  assert.equal(gradeVerifiable({ grading: 'json_equal', ground_truth: '{"a":1,"b":2}' }, '{"a":1,"b":3}'), false);
  assert.equal(gradeVerifiable({ grading: 'json_equal', ground_truth: '{"a":1}' }, 'no json here'), false);
});

test('gradeVerifiable: rubric/unknown grading → null (treated as open)', () => {
  assert.equal(gradeVerifiable({ grading: undefined }, 'x'), null);
});

test('gradeVerifiable: hardened exact — no short-substring false-PASS (pre-push nit)', () => {
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: 'no' }, 'I cannot know'), false); // not inside "know"
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: 'no' }, 'No, it does not exist.'), true);
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: 'yes' }, 'no, definitely not'), false); // first-polarity
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: 'DONE' }, 'The word is DONE.'), true); // word-boundary
  assert.equal(gradeVerifiable({ grading: 'exact', ground_truth: '2,3,5' }, 'primes: 2,3,5'), true);
});

test('wilson: edge + midpoint', () => {
  assert.deepEqual(wilson(0, 0), { lo: 0, hi: 0, p: 0 });
  assert.equal(wilson(5, 10).p, 0.5);
  const w = wilson(10, 10); assert.ok(w.lo > 0.6 && w.hi === 1);
});

test('parseVerdict: explicit + fallback', () => {
  assert.equal(parseVerdict('reasoning...\nVERDICT: 2'), '2');
  assert.equal(parseVerdict('they are equal, tie'), 'tie');
  assert.equal(parseVerdict('1 is weak so 2'), '2');
});

// The load-bearing property: order randomization cancels position bias.
test('judgePairwise: a judge that always picks Response 2 → tie (position bias cancelled)', async () => {
  const alwaysSecond = async () => 'VERDICT: 2';
  const r = await judgePairwise('q', 'rubric', 'baseAns', 'candAns', alwaysSecond);
  assert.equal(r.verdict, 'tie');
});

test('judgePairwise: a judge that genuinely prefers the candidate → B across both orders', async () => {
  const preferGOOD = async (prompt) => {
    const m = prompt.match(/--- Response 1 ---\n([\s\S]*?)\n\n--- Response 2 ---\n([\s\S]*?)\n\nWhich/);
    const [r1, r2] = m ? [m[1], m[2]] : ['', ''];
    return r1.includes('GOOD') ? 'VERDICT: 1' : r2.includes('GOOD') ? 'VERDICT: 2' : 'VERDICT: tie';
  };
  const r = await judgePairwise('q', 'rubric', 'BAD base', 'GOOD candidate', preferGOOD);
  assert.equal(r.verdict, 'B');
});

test('aggregate: null-calibration (identical results) → delta 0, gate PASS', () => {
  const rows = [
    { id: '1', capability: 'reasoning', verifiable: true, correctA: true, correctB: true },
    { id: '2', capability: 'format', verifiable: true, correctA: false, correctB: false },
    { id: '3', capability: 'honesty', verifiable: false, verdict: 'tie' },
  ];
  const r = aggregate(rows, { epsilon: 0.0 });
  assert.equal(r.verifiable.delta, 0);
  assert.equal(r.slice_regression, null);
  assert.equal(r.gate.verdict, 'PASS');
});

test('aggregate: a single slice regression → GATE FAIL (per-slice, not mean)', () => {
  const rows = [
    { id: '1', capability: 'reasoning', verifiable: true, correctA: true, correctB: true },
    { id: '2', capability: 'reasoning', verifiable: true, correctA: true, correctB: true },
    { id: '3', capability: 'refuse_dangerous', verifiable: false, verdict: 'A' }, // candidate loses safety slice
  ];
  const r = aggregate(rows, { epsilon: 0.0 });
  assert.equal(r.slice_regression, 'refuse_dangerous');
  assert.equal(r.gate.verdict, 'FAIL'); // mean verifiable is flat, but a slice regressed
});

test('runEval: end-to-end with fakes, base==candidate → delta 0 PASS', async () => {
  const items = [
    { id: 'v1', capability: 'reasoning', verifiable: true, grading: 'exact', ground_truth: '3/10', prompt: 'p1' },
    { id: 'o1', capability: 'honesty', verifiable: false, rubric: 'r', prompt: 'p2' },
  ];
  const generate = async () => ({ text: 'answer is 3/10', error: null });
  const judgeFn = async () => 'VERDICT: tie';
  const r = await runEval(items, { base: 'm', candidate: 'm', generate, judgeFn, epsilon: 0 });
  assert.equal(r.verifiable.delta, 0);
  assert.equal(r.gate.verdict, 'PASS');
});
