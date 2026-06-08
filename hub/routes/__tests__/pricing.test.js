// Wave 33 (C.3) — /v1/pricing: snapshot body + GET handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPricingBody, handlePricing, PRICING_SNAPSHOT } from '../pricing.js';

test('buildPricingBody returns the canonical snapshot with a generated_at', () => {
  const b = buildPricingBody(0);
  assert.equal(b.source, 'canonical');
  assert.ok(Array.isArray(b.models) && b.models.length === PRICING_SNAPSHOT.length);
  assert.equal(typeof b.generated_at, 'string');
  // every model carries id/tier/input/output
  for (const m of b.models) {
    assert.equal(typeof m.id, 'string');
    assert.match(m.tier, /^T[0-3]$/);
    assert.equal(typeof m.input, 'number');
    assert.equal(typeof m.output, 'number');
  }
});

test('handlePricing serves 200 JSON on GET', async () => {
  const res = await handlePricing(new Request('https://x/v1/pricing'), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.models.some((m) => m.id === 'claude-opus-4-6'));
});

test('handlePricing rejects non-GET with 405', async () => {
  const res = await handlePricing(new Request('https://x/v1/pricing', { method: 'POST' }), {});
  assert.equal(res.status, 405);
});
