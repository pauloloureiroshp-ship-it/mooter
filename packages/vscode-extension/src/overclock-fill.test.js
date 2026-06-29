'use strict';
// overclock-fill.test.js — proves the Node-pure idle-fill runner renders an HONEST
// card with ZERO fabrication: missing data → "n/d" (never NaN/undefined/0-guess),
// the slot cap is never exceeded, synthetic probes never count human time, and the
// cloud-avoided counterfactual uses the FROZEN Haiku rate on MEASURED tokens only.
//
// All assertions are GPU/Ollama-free (pure functions) so they run in CI headless.

const { test, before } = require('node:test');
const assert = require('node:assert');

let M; // the ESM module, loaded once (CJS test → dynamic import of the .mjs)
before(async () => { M = await import('./overclock-fill.mjs'); });

test('cloudUsdAvoided: frozen Haiku rate on measured tokens, null when unknown', () => {
  assert.strictEqual(M.cloudUsdAvoided(null, null), null, 'both null → n/d');
  assert.strictEqual(M.cloudUsdAvoided(0, 0), null, 'zero tokens → n/d (never $0 as a real number)');
  // (1000 in × $1 + 1000 out × $5) / 1e6 = 0.006
  assert.strictEqual(M.cloudUsdAvoided(1000, 1000), 0.006);
  // null input is treated as 0 for the present side, never fabricated
  assert.strictEqual(M.cloudUsdAvoided(null, 1000), 0.005);
  assert.strictEqual(M.HAIKU_FROZEN.tier, 'claude-haiku-4-5');
});

test('estimateCapacity: honest default + hard cap, never 0, never OOM-able', () => {
  const nd = M.estimateCapacity({ tempC: null, usedMb: null, totalMb: null });
  assert.strictEqual(nd.gpuSlots, 2, 'vram n/d → conservative default 2');
  assert.match(nd.basis, /n\/d/);

  // 24GB card, ~17GB free → capped at HARD_MAX (6), never higher
  const big = M.estimateCapacity({ tempC: 50, usedMb: 7000, totalMb: 24564 });
  assert.ok(big.gpuSlots >= 1 && big.gpuSlots <= 6, 'within [1,6]');
  assert.strictEqual(big.gpuSlots, 6);

  // almost-full card → at least 1, never 0
  const tight = M.estimateCapacity({ tempC: 70, usedMb: 24000, totalMb: 24564 });
  assert.ok(tight.gpuSlots >= 1 && tight.gpuSlots <= 6);
});

test('pickModel: prefers coder model, null on empty', () => {
  assert.strictEqual(M.pickModel([]), null);
  assert.strictEqual(M.pickModel(['llama3:8b', 'qwen2.5-coder:7b']), 'qwen2.5-coder:7b');
  assert.strictEqual(M.pickModel(['mistral:7b']), 'mistral:7b', 'falls back to first when no preferred');
});

test('summarizeFill: synthetic probe → human time NOT counted, buckets honest', () => {
  const results = [
    { wallSeconds: 2.1, gatePassed: true, promptTokens: 30, evalTokens: 90 },
    { wallSeconds: 2.4, gatePassed: true, promptTokens: 30, evalTokens: 100 },
    { wallSeconds: 0.0, gatePassed: false, skipped: 'ollama-unavailable', promptTokens: null, evalTokens: null },
  ];
  const m = M.summarizeFill(results, { at: 1, project: null, baseModel: 'qwen2.5-coder:7b', gpu: { gpuSlots: 6 } });
  assert.strictEqual(m.measured.jobsRun, 2, 'skipped excluded from jobsRun');
  assert.strictEqual(m.measured.gatePass, 2);
  assert.strictEqual(m.measured.skipped, 1);
  assert.strictEqual(m.estimated.humanMinutesRecovered, 0, 'synthetic probe recovers no human work');
  assert.strictEqual(m.estimated.humanTimeApplicable, false);
  assert.strictEqual(m.measured.usd, 0);
  assert.ok(m.measured.cloudUsdAvoided > 0, 'cloud avoided from measured tokens');
  assert.strictEqual(m.quality.passRate, 1);
  assert.strictEqual(m.secondary.throughputX, null, 'no A/B baseline in button path → n/d');
  assert.strictEqual(m.source, 'idle-fill-button');
});

test('summarizeFill: zero jobs → passRate n/d (null), nothing fabricated', () => {
  const m = M.summarizeFill([], { at: 1, project: null, baseModel: 'n/d', gpu: null });
  assert.strictEqual(m.quality.passRate, null);
  assert.strictEqual(m.measured.localTokens, null);
  assert.strictEqual(m.measured.cloudUsdAvoided, null);
});

test('renderFillCard: clean render — never NaN/undefined, n/d for missing, cap shown', () => {
  const m = M.summarizeFill([], { at: 1, project: null, baseModel: 'n/d', gpu: null });
  const card = M.renderFillCard(m).join('\n');
  assert.ok(!/NaN|undefined/.test(card), 'no NaN/undefined leaks');
  assert.ok(!/\bnull\b/.test(card), 'no raw null literal — must be n/d');
  assert.match(card, /n\/d/, 'missing data rendered n/d');
  assert.match(card, /cap 6/, 'hard cap surfaced');
  assert.match(card, /probe sintético, nunca contado/, 'human time honestly labelled for probes');
  assert.match(card, /\$0 local/);
});

test('renderFillCard: populated GPU run renders util arrow + tokens cleanly', () => {
  const results = [{ wallSeconds: 2.2, gatePassed: true, promptTokens: 40, evalTokens: 110 }];
  const m = M.summarizeFill(results, {
    at: 1, project: 'mooter', baseModel: 'qwen2.5-coder:7b',
    gpu: { utilBefore: 38, utilDuring: 92, utilAfter: 41, tempC: 67, totalMb: 24564, gpuSlots: 6 },
  });
  const card = M.renderFillCard(m).join('\n');
  assert.ok(!/NaN|undefined/.test(card));
  assert.match(card, /38%→92%/, 'idle→saturated util arrow');
  assert.match(card, /67°C/);
  assert.match(card, /Haiku frozen/, 'cloud estimate labelled');
});
