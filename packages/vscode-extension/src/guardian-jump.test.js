'use strict';
// guardian-jump.test.js — F3 pure logic: ctx% estimate, F1 pressure ladder (defensive copy),
// jump-offer gate (advise ≥90), and the F2 pre-baked handoff reader.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const GJ = require('./guardian-jump');

test('ctxPctOf: 200k default window', () => {
  assert.equal(GJ.ctxPctOf(100000, 'claude-opus-4-8'), 50);
  assert.equal(GJ.ctxPctOf(20000, 'claude-sonnet-4-6'), 10);
});

test('ctxPctOf: [1m] models use the 1M window', () => {
  assert.equal(GJ.ctxPctOf(100000, 'claude-opus-4-8[1m]'), 10);
  assert.equal(GJ.ctxPctOf(500000, 'claude-opus-4-8[1m]'), 50);
});

test('ctxPctOf: null/clamped', () => {
  assert.equal(GJ.ctxPctOf(null, 'x'), null);
  assert.equal(GJ.ctxPctOf(undefined, 'x'), null);
  assert.equal(GJ.ctxPctOf(9999999, 'x'), 100); // clamped
});

test('pressureRung: F1 thresholds (monitor/mask/prune/advise/emergency)', () => {
  assert.equal(GJ.pressureRung(0), 'monitor');
  assert.equal(GJ.pressureRung(79), 'monitor');
  assert.equal(GJ.pressureRung(80), 'mask');
  assert.equal(GJ.pressureRung(84), 'mask');
  assert.equal(GJ.pressureRung(85), 'prune');
  assert.equal(GJ.pressureRung(89), 'prune');
  assert.equal(GJ.pressureRung(90), 'advise');
  assert.equal(GJ.pressureRung(98), 'advise');
  assert.equal(GJ.pressureRung(99), 'emergency');
  assert.equal(GJ.pressureRung(100), 'emergency');
});

test('shouldOfferJump: only at the delirium threshold (advise ≥90) and beyond', () => {
  assert.equal(GJ.shouldOfferJump(89), false);
  assert.equal(GJ.shouldOfferJump(90), true);
  assert.equal(GJ.shouldOfferJump(99), true);
  // unknown fill → never offer (defensive)
  assert.equal(GJ.shouldOfferJump(null), false);
  assert.equal(GJ.shouldOfferJump({}), false);
});

test('shouldOfferJump: derives ctx% from a row (ctxPct preferred, else ctxTokens+model)', () => {
  assert.equal(GJ.shouldOfferJump({ ctxPct: 92 }), true);
  assert.equal(GJ.shouldOfferJump({ ctxPct: 50 }), false);
  // 185k / 200k = 93% → advise
  assert.equal(GJ.shouldOfferJump({ ctxTokens: 185000, model: 'claude-opus-4-8' }), true);
  // 185k / 1M = 19% (1m window) → no offer
  assert.equal(GJ.shouldOfferJump({ ctxTokens: 185000, model: 'claude-opus-4-8[1m]' }), false);
});

test('prebakedHandoffPath: sanitised _handoff/guardian/<sid>.md', () => {
  const p = GJ.prebakedHandoffPath('/root', 'abc12345');
  assert.ok(p.replace(/\\/g, '/').endsWith('/root/_handoff/guardian/abc12345.md'));
  // path separators are stripped → traversal is impossible (result stays inside the guardian dir)
  const p2 = GJ.prebakedHandoffPath('/root', '../../etc/passwd').replace(/\\/g, '/');
  assert.ok(p2.includes('/_handoff/guardian/'), 'stays under the guardian dir');
  assert.ok(!p2.includes('/etc/'), 'no path-traversal escape');
  assert.ok(p2.endsWith('.md'));
  assert.equal(GJ.prebakedHandoffPath('', 'x'), null);
  assert.equal(GJ.prebakedHandoffPath('/root', ''), null);
});

test('readPrebakedHandoff: reads F2 file, tries roots in order, null when absent — never throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gj-'));
  const sid = 'sess1234';
  // absent → null
  assert.equal(GJ.readPrebakedHandoff(dir, sid), null);
  // present in the SECOND root → found
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gj2-'));
  fs.mkdirSync(path.join(root2, '_handoff', 'guardian'), { recursive: true });
  fs.writeFileSync(path.join(root2, '_handoff', 'guardian', sid + '.md'), '# HANDOFF\nstate', 'utf8');
  const got = GJ.readPrebakedHandoff([dir, root2], sid);
  assert.ok(got && /HANDOFF/.test(got.text));
  // empty/whitespace file is treated as absent
  const root3 = fs.mkdtempSync(path.join(os.tmpdir(), 'gj3-'));
  fs.mkdirSync(path.join(root3, '_handoff', 'guardian'), { recursive: true });
  fs.writeFileSync(path.join(root3, '_handoff', 'guardian', sid + '.md'), '   \n', 'utf8');
  assert.equal(GJ.readPrebakedHandoff(root3, sid), null);
  // bogus root never throws
  assert.doesNotThrow(() => GJ.readPrebakedHandoff('/nonexistent/zzz', sid));
});
