'use strict';
// Wave 53 Phase D.2 — emoji_lint denylist (anti-hype) gate.
const test = require('node:test');
const assert = require('node:assert');
const { scanText, FORBIDDEN } = require('../lint/emoji_lint.js');

test('clean text → no hits', () => {
  assert.deepStrictEqual(scanText('🐮 Mooter · ✅ done · ☁ sonnet T2 · ⇄ 2 sisters'), []);
});

test('💎 is NOT forbidden (intentional model glyph)', () => {
  assert.deepStrictEqual(scanText('model 💎 local T0'), []);
});

test('forbidden hype emoji is flagged with line/col', () => {
  const hits = scanText('all good\nship it 🚀 now');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].emoji, '🚀');
  assert.strictEqual(hits[0].line, 2);
  assert.strictEqual(hits[0].col, 9);
});

test('every forbidden emoji is detected', () => {
  for (const f of FORBIDDEN) {
    const hits = scanText(`x ${f.ch} y`);
    assert.strictEqual(hits.length, 1, `expected to flag ${f.ch}`);
    assert.strictEqual(hits[0].emoji, f.ch);
  }
});

test('multiple occurrences on one line are all reported', () => {
  const hits = scanText('🎉 wow 🎉 yay 💯');
  assert.strictEqual(hits.length, 3);
});

test('forbidden set excludes legitimate glyphs (💎 🐉 🐮 🔥)', () => {
  const chars = FORBIDDEN.map((f) => f.ch);
  for (const ok of ['💎', '🐉', '🐮', '🔥', '🦙', '⚡']) {
    assert.ok(!chars.includes(ok), `${ok} must not be forbidden`);
  }
});
