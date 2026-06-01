// Wave 10 · A.4 — per-tool-call model badge (PostToolUse hook).
// node:test + assert, matching the repo's existing badge tests.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const { buildPostToolBadge, badgeEnabled, shortModel } = require('./post_tool_badge.js');

test('buildPostToolBadge: shows glyph + model + tier for a cloud subagent', () => {
  const out = buildPostToolBadge({ model: 'claude-sonnet-4-6', subagent: 'model-reasoner', tier: 'T2' });
  assert.match(out, /sonnet T2/, 'model short name + tier');
  assert.match(out, /via model-reasoner/, 'names the subagent that handled it');
});

test('buildPostToolBadge: local model maps to the home glyph, no inflated tier', () => {
  const out = buildPostToolBadge({ model: 'qwen2.5:3b', subagent: 'local-summarizer', tier: 'T0' });
  assert.match(out, /qwen2\.5 T0/);
  assert.match(out, /via local-summarizer/);
});

test('buildPostToolBadge: never invents ms or cost (honesty)', () => {
  const out = buildPostToolBadge({ model: 'claude-opus-4-8', subagent: 'model-architect', tier: 'T3' });
  assert.doesNotMatch(out, /ms/, 'no fabricated latency');
  assert.doesNotMatch(out, /\$/, 'no fabricated cost');
});

test('buildPostToolBadge: empty/absent state prints nothing', () => {
  assert.equal(buildPostToolBadge(null), '');
  assert.equal(buildPostToolBadge({}), '');
  assert.equal(buildPostToolBadge({ subagent: 'x' }), '', 'subagent alone is not enough to show a badge');
});

test('buildPostToolBadge: inline executor drops the "via" suffix', () => {
  const out = buildPostToolBadge({ model: 'claude-opus-4-8', subagent: 'inline', tier: 'T3' });
  assert.doesNotMatch(out, /via/);
});

test('badgeEnabled: on by default, off via post_tool_badge/quiet/badge_off', () => {
  assert.equal(badgeEnabled({}), true, 'default on');
  assert.equal(badgeEnabled({ post_tool_badge: false }), false);
  assert.equal(badgeEnabled({ quiet: true }), false);
  assert.equal(badgeEnabled({ badge_off: true }), false);
});

test('shortModel: normalizes provider families', () => {
  assert.equal(shortModel('claude-opus-4-8'), 'opus');
  assert.equal(shortModel('claude-haiku-4-5'), 'haiku');
  assert.equal(shortModel('qwen2.5:3b'), 'qwen2.5');
});
