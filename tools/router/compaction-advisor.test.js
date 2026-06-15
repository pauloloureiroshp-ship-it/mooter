'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Isolate breadcrumb IO to a temp MOOTER_HOME so we never touch a live ~/.mooter
// that a parallel session may be reading.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-compact-'));
process.env.MOOTER_HOME = TMP;

const A = require('./compaction-advisor.js');

test('pressureLadder — thresholds + graceful unknown', () => {
  assert.strictEqual(A.pressureLadder(null), 'monitor');
  assert.strictEqual(A.pressureLadder(undefined), 'monitor');
  assert.strictEqual(A.pressureLadder(50), 'monitor');
  assert.strictEqual(A.pressureLadder(80), 'mask');
  assert.strictEqual(A.pressureLadder(85), 'prune');
  assert.strictEqual(A.pressureLadder(90), 'advise');
  assert.strictEqual(A.pressureLadder(99), 'emergency');
});

test('commitTestPRSignal — detects EN + PT work-boundary language', () => {
  for (const s of ['just committed the fix', 'all tests pass now', 'opened a PR', 'merged to main',
    'fiz commit do fix', 'os testes passaram', 'abri um PR']) {
    assert.ok(A.commitTestPRSignal(s), `should fire: ${s}`);
  }
  assert.ok(!A.commitTestPRSignal('add a new button'));
  assert.ok(!A.commitTestPRSignal(''));
});

test('stage1Boundary — no prior state → score 0', () => {
  const r = A.stage1Boundary(null, { category: 'x', prompt: 'hi' }, Date.now());
  assert.strictEqual(r.score, 0);
  assert.ok(r.signals.includes('no_prior_state'));
});

test('stage1Boundary — a commit signal alone is a strong boundary', () => {
  const prev = { category: 'code_generation', cwd: '/a', ts: Date.now() };
  const r = A.stage1Boundary(prev, { category: 'code_generation', cwd: '/a', prompt: 'committed it' }, Date.now());
  assert.ok(r.score >= A.STRONG, `score ${r.score}`);
  assert.ok(r.signals.includes('commit_test_pr'));
});

test('stage1Boundary — category transition + focus change accumulate', () => {
  const prev = { category: 'code_generation', cwd: '/a', ts: Date.now() };
  const r = A.stage1Boundary(prev, { category: 'debugging', cwd: '/b', prompt: 'why does x fail' }, Date.now());
  assert.ok(r.signals.some((s) => s.startsWith('category:')));
  assert.ok(r.signals.includes('focus_change'));
  assert.ok(r.score >= A.STRONG);
});

test('stage1Boundary — user-away temporal gap fires', () => {
  const t0 = 1_000_000;
  const prev = { category: 'docs', cwd: '/a', ts: t0 };
  const r = A.stage1Boundary(prev, { category: 'docs', cwd: '/a', prompt: 'continue' }, t0 + A.GAP_MS + 1);
  assert.ok(r.signals.includes('user_away_gap'));
});

test('stage1Boundary — same everything, no gap → continuous (no boundary)', () => {
  const t = Date.now();
  const prev = { category: 'docs', cwd: '/a', ts: t };
  const r = A.stage1Boundary(prev, { category: 'docs', cwd: '/a', prompt: 'keep going' }, t + 1000);
  assert.strictEqual(r.score, 0);
  assert.deepStrictEqual(r.signals, ['continuous']);
});

test('compactionDecision — branches', () => {
  assert.strictEqual(A.compactionDecision({ boundary: 0.1, pressure: 'monitor' }), 'HOLD');
  assert.strictEqual(A.compactionDecision({ boundary: 0.6, pressure: 'monitor', cacheCold: 'hot' }), 'PREP_SNAPSHOT');
  assert.strictEqual(A.compactionDecision({ boundary: 0.6, pressure: 'monitor', cacheCold: 'cold' }), 'ADVISE_NOW');
  assert.strictEqual(A.compactionDecision({ boundary: 0.6, pressure: 'monitor', cacheCold: 'unknown' }), 'ADVISE_NOW');
  assert.strictEqual(A.compactionDecision({ boundary: 0.1, pressure: 'advise' }), 'ADVISE_NOW');
  assert.strictEqual(A.compactionDecision({ boundary: 0.1, pressure: 'emergency' }), 'ADVISE_NOW');
});

test('compactionDecision — NEVER advises mid-HIGH_RISK', () => {
  // Even a strong boundary + emergency pressure must HOLD when risk is high.
  assert.strictEqual(A.compactionDecision({ boundary: 1, pressure: 'emergency', cacheCold: 'cold', risk_level: 'high' }), 'HOLD');
});

test('buildSnapshot — restorable, deterministic, JSON-safe', () => {
  const s = { session_id: 's1', category: 'debugging', cwd: '/repo', turns: 7, last_event: 'commit_test_pr', file_index: ['a.js', 'b.js'] };
  const snap = A.buildSnapshot(s);
  const round = JSON.parse(JSON.stringify(snap));
  assert.deepStrictEqual(round, snap);
  assert.strictEqual(snap.category, 'debugging');
  assert.strictEqual(snap.turns, 7);
  assert.ok(snap.previously_on.includes('debugging') && snap.previously_on.includes('/repo'));
});

test('breadcrumb — write/read round-trips, stale ignored', () => {
  const sid = 'sess-A';
  assert.strictEqual(A.readState(sid), null);
  const now = 5_000_000_000;
  A.writeState(sid, { category: 'code_generation', cwd: '/a' }, now);
  const back = A.readState(sid, now + 1000);
  assert.strictEqual(back.category, 'code_generation');
  // stale (older than the window) → null
  assert.strictEqual(A.readState(sid, now + 13 * 60 * 60 * 1000), null);
});

test('advise — accumulates turns across calls and returns a decision', () => {
  const sid = 'sess-turns';
  const t = 6_000_000_000;
  const r1 = A.advise(sid, { category: 'code_generation', cwd: '/a', prompt: 'write x' }, t);
  assert.strictEqual(r1.turns, 1);
  const r2 = A.advise(sid, { category: 'debugging', cwd: '/a', prompt: 'why fail' }, t + 2000);
  assert.strictEqual(r2.turns, 2);
  assert.ok(['HOLD', 'PREP_SNAPSHOT', 'ADVISE_NOW'].includes(r2.decision));
});

test('advise — path traversal in session id is neutralized', () => {
  A.advise('../../evil', { category: 'x', cwd: '/a', prompt: 'hi' }, Date.now());
  // safeId strips path separators (/ \ → _), so every state file resolves INSIDE
  // the compaction dir — no escape. Literal dots in the name are harmless.
  const compactDir = path.resolve(path.join(TMP, 'compaction'));
  for (const f of fs.readdirSync(compactDir)) {
    assert.ok(!f.includes('/') && !f.includes('\\'), `separator survived: ${f}`);
    assert.ok(path.resolve(compactDir, f).startsWith(compactDir), `escaped dir: ${f}`);
  }
});
