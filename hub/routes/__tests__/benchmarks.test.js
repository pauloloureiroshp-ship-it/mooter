// Rankings R2 — /v1/benchmarks route + precedence collapse, and the /v1/pricing
// D1 merge. Pure functions + handlers against an inline D1 stub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceRank, buildBenchmarksBody, handleBenchmarks } from '../benchmarks.js';
import { mergeD1Pricing, PRICING_SNAPSHOT, handlePricing } from '../pricing.js';

test('sourceRank: mooter-bench > artificial-analysis > openrouter > other', () => {
  assert.ok(sourceRank('mooter-bench') < sourceRank('artificial-analysis'));
  assert.ok(sourceRank('artificial-analysis') < sourceRank('openrouter'));
  assert.ok(sourceRank('openrouter') < sourceRank('whatever'));
  // prefix: divergent label still ranks as artificial-analysis
  assert.equal(sourceRank('artificial-analysis (or-divergent)'), sourceRank('artificial-analysis'));
});

test('buildBenchmarksBody collapses to one row per cell, highest precedence wins', () => {
  const rows = [
    { model: 'gpt-5', category: 'coding.backend', score: 0.5, source: 'openrouter', as_of: 'x', confidence: 'low' },
    { model: 'gpt-5', category: 'coding.backend', score: 0.55, source: 'artificial-analysis', as_of: 'y', confidence: 'high' },
    { model: 'gpt-5', category: 'reasoning.math', score: 0.7, source: 'artificial-analysis', as_of: 'y', confidence: 'high' },
  ];
  const body = buildBenchmarksBody(rows, 0);
  assert.equal(body.cells.length, 2);
  const backend = body.cells.find((c) => c.category === 'coding.backend');
  assert.equal(backend.source, 'artificial-analysis'); // beat openrouter
  assert.equal(backend.score, 0.55);
});

test('handleBenchmarks: 405 on non-GET, 200 + empty when no DB', async () => {
  const post = await handleBenchmarks(new Request('https://x/v1/benchmarks', { method: 'POST' }), {});
  assert.equal(post.status, 405);
  const res = await handleBenchmarks(new Request('https://x/v1/benchmarks'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.cells, []);
});

test('handleBenchmarks reads rows from D1', async () => {
  const env = {
    DB: {
      prepare: () => ({
        all: async () => ({
          results: [{ model: 'gpt-5', category: 'coding.backend', score: 0.55, source: 'artificial-analysis', as_of: 'y', confidence: 'high' }],
        }),
      }),
    },
  };
  const res = await handleBenchmarks(new Request('https://x/v1/benchmarks'), env);
  const body = await res.json();
  assert.equal(body.cells.length, 1);
  assert.equal(body.cells[0].model, 'gpt-5');
});

test('mergeD1Pricing overrides snapshot prices and appends new models, skips empty', () => {
  const merged = mergeD1Pricing(PRICING_SNAPSHOT, [
    { model: 'claude-opus-4-6', input_per_mtok: 4.5, output_per_mtok: 22, blended_3to1: null },
    { model: 'gpt-5', input_per_mtok: 1.25, output_per_mtok: 10, blended_3to1: 3.44 },
    { model: 'ghost', input_per_mtok: null, output_per_mtok: null, blended_3to1: null }, // skipped
  ]);
  const opus = merged.find((m) => m.id === 'claude-opus-4-6');
  assert.equal(opus.input, 4.5); // overridden
  assert.equal(opus.tier, 'T3'); // tier preserved
  const gpt = merged.find((m) => m.id === 'gpt-5');
  assert.ok(gpt && gpt.input === 1.25 && gpt.tier === 'T?'); // appended, unknown tier
  assert.equal(merged.find((m) => m.id === 'ghost'), undefined); // no price → not added
});

test('handlePricing degrades to canonical snapshot when D1 errors', async () => {
  const env = { DB: { prepare: () => ({ all: async () => { throw new Error('d1 down'); } }) } };
  const res = await handlePricing(new Request('https://x/v1/pricing'), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.source, 'canonical'); // not canonical+d1 — error swallowed
  assert.ok(body.models.some((m) => m.id === 'claude-opus-4-6'));
});

test('handlePricing merges D1 prices when present', async () => {
  const env = {
    DB: {
      prepare: () => ({
        all: async () => ({ results: [{ model: 'gpt-5', input_per_mtok: 1.25, output_per_mtok: 10, blended_3to1: 3.44, source: 'openrouter', as_of: 'z' }] }),
      }),
    },
  };
  const res = await handlePricing(new Request('https://x/v1/pricing'), env);
  const body = await res.json();
  assert.equal(body.source, 'canonical+d1');
  assert.ok(body.models.some((m) => m.id === 'gpt-5' && m.input === 1.25));
});
