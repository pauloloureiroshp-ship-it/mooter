// @ts-check
'use strict';
// Tests for session-context.js (Wave 65 Context Bridge). Hermetic: unique session
// ids, cleaned up after. Enables the bridge via the env override.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

process.env.MOOTER_CONTEXT_BRIDGE = '1';
const sc = require('./session-context.js');

const SID = 'mooter-test-' + process.pid + '-1';
const SID2 = 'mooter-test-' + process.pid + '-2';
const cleanup = () => { for (const s of [SID, SID2]) { try { fs.unlinkSync(path.join(sc.DIR, s + '.jsonl')); } catch { /* ignore */ } } };
test.after(cleanup);

test('append + read roundtrip', () => {
  cleanup();
  assert.equal(sc.appendTurn(SID, { role: 'user', text: 'hello world' }), true);
  assert.equal(sc.appendTurn(SID, { role: 'assistant', model: 'claude-opus-4-7', text: 'hi there' }), true);
  const turns = sc.readTurns(SID);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].role, 'user');
  assert.equal(turns[1].role, 'assistant');
  assert.equal(turns[1].model, 'claude-opus-4-7');
});

test('buildContextBlock includes prior turns and excludes the current prompt', () => {
  cleanup();
  sc.appendTurn(SID2, { role: 'user', text: 'first question' });
  sc.appendTurn(SID2, { role: 'assistant', model: 'claude-opus-4-7', text: 'first answer' });
  sc.appendTurn(SID2, { role: 'user', text: 'current prompt' });
  const b = sc.buildContextBlock(SID2, { excludeText: 'current prompt' });
  assert.ok(b, 'block built');
  assert.ok(b.text.includes('first question') && b.text.includes('first answer'), 'has prior turns');
  assert.ok(!b.text.includes('current prompt'), 'current prompt excluded');
  assert.ok(b.approxTokens > 0 && b.turns === 2);
});

test('disabled → all writes/reads are no-ops', () => {
  process.env.MOOTER_CONTEXT_BRIDGE = '0';
  assert.equal(sc.isEnabled(), false);
  assert.equal(sc.appendTurn('whatever', { role: 'user', text: 'x' }), false);
  assert.equal(sc.buildContextBlock('whatever'), null);
  process.env.MOOTER_CONTEXT_BRIDGE = '1';
});

test('current-session pointer roundtrip', () => {
  assert.equal(sc.setCurrentSession(SID), true);
  assert.equal(sc.currentSession(), SID);
});
