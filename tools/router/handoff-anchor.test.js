// handoff-anchor.test.js — Live Context Accumulator PASSO 6 (PreCompact/SessionStart anchor).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const anchor = require('./handoff-anchor.js');

test('buildAnchor returns null for empty/blank summary', () => {
  assert.equal(anchor.buildAnchor(null), null);
  assert.equal(anchor.buildAnchor('   '), null);
});

test('buildAnchor labels SessionStart as a resume point', () => {
  const a = anchor.buildAnchor('wiring the accumulator', { event: 'SessionStart' });
  assert.match(a, /resume point/i);
  assert.ok(a.includes('wiring the accumulator'));
});

test('buildAnchor labels PreCompact as preserve-across-compaction', () => {
  const a = anchor.buildAnchor('wiring the accumulator', { event: 'PreCompact' });
  assert.match(a, /compaction/i);
  assert.ok(a.includes('wiring the accumulator'));
});

test('buildAnchor clamps to ANCHOR_MAX', () => {
  const a = anchor.buildAnchor('x'.repeat(5000), { event: 'PreCompact' });
  // body capped at ANCHOR_MAX; the label adds a fixed prefix line
  assert.ok(a.length <= anchor.ANCHOR_MAX + 120);
});

test('buildHookOutput injects additionalContext for the event; null anchor → null', () => {
  assert.equal(anchor.buildHookOutput('SessionStart', null), null);
  const out = anchor.buildHookOutput('PreCompact', 'CTX');
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreCompact');
  assert.equal(out.hookSpecificOutput.additionalContext, 'CTX');
  assert.equal(out.continue, true);
});
