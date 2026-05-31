// Wave 5 D4 — Bash badge always-on. The badge is now emitted at any confidence
// (the 0.6 router-hint quality gate no longer suppresses it); a `?` glyph marks
// low-confidence (< 0.5) tiers, a safety boost is surfaced, and `mooter quiet`
// prefs (badge_off / badge_threshold) control display. node:test + assert.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { buildBadge, badgeMode, readPrefs } = require('./badge.js');

test('buildBadge: low-confidence (< 0.5) uses the ? glyph, not the tier glyph', () => {
  const badge = buildBadge({ tier: 'T1', recommended_model: 'claude-haiku-4-5', recommended_backend: 'anthropic', confidence: 0.4 });
  assert.match(badge, /^\[\? haiku 0\.40/);
});

test('buildBadge: confidence >= 0.5 keeps the tier glyph', () => {
  const badge = buildBadge({ tier: 'T1', recommended_model: 'claude-haiku-4-5', recommended_backend: 'anthropic', confidence: 0.55 });
  assert.doesNotMatch(badge, /^\[\?/);
  assert.match(badge, /haiku 0\.55/);
});

test('buildBadge: a safety boost is surfaced as `boosted from <tier> · <kind>`', () => {
  const badge = buildBadge({
    tier: 'T3', recommended_model: 'claude-opus-4-8', recommended_backend: 'anthropic', confidence: 0.9,
    safety_boost_applied: true, safety_boost_from: 'T1', safety_boost_reason: 'secrets: matched .env',
  });
  assert.match(badge, /boosted from T1 · secrets/);
});

test('buildBadge: no boost chip when no safety boost', () => {
  const badge = buildBadge({ tier: 'T2', recommended_model: 'claude-sonnet-4-6', recommended_backend: 'anthropic', confidence: 0.84 });
  assert.doesNotMatch(badge, /boosted from/);
});

test('badgeMode: always-on by default (threshold 0, not off)', () => {
  const m = badgeMode({});
  assert.equal(m.off, false);
  assert.equal(m.threshold, 0);
});

test('badgeMode: --badge-off → off=true', () => {
  assert.equal(badgeMode({ badge_off: true }).off, true);
});

test('badgeMode: a custom threshold is honoured', () => {
  assert.equal(badgeMode({ badge_threshold: 0.7 }).threshold, 0.7);
});

test('readPrefs: badge prefs default to always-on (badge_off=false, threshold=0)', () => {
  const p = readPrefs('/nonexistent/preferences.json');
  assert.equal(p.badge_off, false);
  assert.equal(p.badge_threshold, 0);
});
