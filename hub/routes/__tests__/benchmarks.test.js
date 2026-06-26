// Wave 5 (Rankings-as-proof) — /v1/benchmarks: curated public snapshot + handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBenchmarksBody, handleBenchmarks, BENCHMARK_SNAPSHOT } from '../benchmarks.js';

test('buildBenchmarksBody returns the curated snapshot with a generated_at', () => {
  const b = buildBenchmarksBody(0);
  assert.match(b.source, /curated|public/i);
  assert.ok(Array.isArray(b.cells) && b.cells.length === BENCHMARK_SNAPSHOT.length);
  assert.equal(typeof b.generated_at, 'string');
});

test('every cell carries model/category/source/as_of and measured (Option B honesty)', () => {
  for (const c of BENCHMARK_SNAPSHOT) {
    assert.equal(typeof c.model, 'string');
    assert.equal(typeof c.category, 'string');
    assert.equal(typeof c.source, 'string');
    assert.equal(typeof c.as_of, 'string');
    assert.equal(typeof c.measured, 'boolean');
    // score is a finite [0,1] number OR null (qualitative) — NEVER a fabricated value.
    assert.ok(c.score === null || (typeof c.score === 'number' && c.score >= 0 && c.score <= 1));
  }
});

test('no proprietary aggregate is redistributed (Option B: only cite-able public benches)', () => {
  for (const c of BENCHMARK_SNAPSHOT) {
    assert.doesNotMatch(c.source, /artificial analysis|proprietary/i);
  }
});

test('handleBenchmarks serves 200 JSON on GET', async () => {
  const res = await handleBenchmarks(new Request('https://x/v1/benchmarks'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.cells.some((c) => c.source.includes('SWE-bench')));
});

test('handleBenchmarks rejects non-GET with 405', async () => {
  const res = await handleBenchmarks(new Request('https://x/v1/benchmarks', { method: 'POST' }), {});
  assert.equal(res.status, 405);
});
