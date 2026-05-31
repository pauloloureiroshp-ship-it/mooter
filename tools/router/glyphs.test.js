// Wave 2.6 Day 3 — centralized glyph map. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { glyphFor, moodGlyph, providerBucket, TIER_GLYPHS } = require('./glyphs.js');

test('glyphFor: tier + provider combinations', () => {
  assert.equal(glyphFor({ tier: 'T0', provider: 'local' }), '🐄 🏠');
  assert.equal(glyphFor({ tier: 'T0', modelSize: 'large', provider: 'local' }), '🐃 🏠');
  assert.equal(glyphFor({ tier: 'T1', provider: 'cloud' }), '🐎 ☁');
  assert.equal(glyphFor({ tier: 'T2', provider: 'cloud' }), '🐂 ☁');
  assert.equal(glyphFor({ tier: 'T3', provider: 'max' }), '🦬 ⚡');
});

test('glyphFor: tier only (no provider) omits the provider glyph', () => {
  assert.equal(glyphFor({ tier: 'T0' }), '🐄');
  assert.equal(glyphFor({ tier: 'T3' }), '🦬');
});

test('glyphFor: unknown tier falls back to 🐮', () => {
  assert.equal(glyphFor({ tier: 'T99', provider: 'local' }), '🐮 🏠');
  assert.equal(glyphFor({}), '🐮');
  assert.equal(glyphFor(null), '🐮');
});

test('providerBucket: maps backends to local/cloud/max', () => {
  assert.equal(providerBucket('ollama'), 'local');
  assert.equal(providerBucket('sonnet'), 'cloud');
  assert.equal(providerBucket('opus'), 'cloud');
  assert.equal(providerBucket('openai_api'), 'cloud');
  assert.equal(providerBucket('codex_cli'), 'max');
  assert.equal(providerBucket(''), undefined);
  assert.equal(providerBucket(null), undefined);
});

test('moodGlyph: maps moods, unknown → healthy', () => {
  assert.equal(moodGlyph('healthy'), '🐮');
  assert.equal(moodGlyph('warning'), '🐂');
  assert.equal(moodGlyph('critical'), '🚨');
  assert.equal(moodGlyph('setup'), '🛠');
  assert.equal(moodGlyph(null), '🐮');
  assert.equal(moodGlyph('bogus'), '🐮');
});

test('TIER_GLYPHS: all four tiers present + heavy variant', () => {
  for (const k of ['T0', 'T0_heavy', 'T1', 'T2', 'T3']) {
    assert.equal(typeof TIER_GLYPHS[k], 'string');
    assert.ok(TIER_GLYPHS[k].length > 0);
  }
});
