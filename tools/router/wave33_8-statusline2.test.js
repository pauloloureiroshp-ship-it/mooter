'use strict';
/**
 * wave33_8-statusline2.test.js — Wave 33.8 Statusline 2.0.
 *
 * Covers the new/changed chips: MLWR empty-state (G), user identity (E),
 * cross-terminal session count (B), workflow locks segment + bridge (C), and the
 * Line 1/Line 2 model-explicit rendering (F). Pure functions only — no home dir,
 * no network — so the suite stays inside the ≤10ms statusline contract.
 */

const test = require('node:test');
const assert = require('node:assert');

// ── Block G — MLWR empty state ───────────────────────────────────────────────
test('Block G: MLWR chip falls back to a run-benchmark nudge when no snapshot', () => {
  const mlwr = require('./mlwr-status.js');
  assert.equal(mlwr.buildMlwrChip(null), null, 'pure builder still returns null for no data');
  assert.equal(mlwr.emptyMlwrChip(), '📊 MLWR · run benchmark');
  assert.equal(mlwr.buildMlwrChip({ mlwr: { overall: 1 } }), '📊 MLWR 100% local');
});

// ── Block E — user identity chip (opaque hash, never a fabricated handle) ─────
test('Block E: user chip shows hash prefix when logged in, silent logged out', () => {
  const u = require('./user-status.js');
  assert.equal(u.buildUserChip({ user_id_hash: 'f50b36ca0764bbb4' }), '👤 user f50b36ca');
  assert.equal(u.buildUserChip(null), '', 'logged out → silent (privacy default)');
  assert.equal(u.buildUserChip({}), '', 'no hash → silent');
  assert.equal(u.buildUserChip({ user_id_hash: 'not a hash!!' }), '', 'malformed hash → silent');
});

// ── Block B — cross-terminal live-session count ──────────────────────────────
test('Block B: counts only fresh heartbeats; suffix appears at ≥2', () => {
  const tn = require('./terminal-name-status.js');
  const now = 1_000_000_000_000;
  const fresh = (off) => ({ last_heartbeat_ms: now - off });
  assert.equal(tn.countLiveSessions([], now), 0);
  assert.equal(tn.countLiveSessions([fresh(0)], now), 1, 'solo session');
  assert.equal(tn.countLiveSessions([fresh(0), fresh(5000), fresh(80_000)], now), 3);
  assert.equal(tn.countLiveSessions([fresh(0), fresh(200_000)], now), 1, 'stale heartbeat excluded');
  assert.equal(tn.countLiveSessions('nope', now), 0, 'non-array safe');
});

// ── Block C — workflow locks segment ─────────────────────────────────────────
test('Block C: workflow progress chip renders held locks', () => {
  const wf = require('./workflow-progress-status.js');
  assert.equal(wf.buildLocksSegment(['git', 'notion']), ' 🔒 git+notion');
  assert.equal(wf.buildLocksSegment([]), '', 'no locks → no segment');
  assert.equal(wf.buildLocksSegment(undefined), '', 'absent → no segment (never fabricated)');
  assert.equal(wf.buildLocksSegment(['git', '', '  ']), ' 🔒 git', 'blanks dropped');

  const now = 1_000_000;
  const chip = wf.buildWorkflowProgressChip(
    { run_id: 'abc12345', status: 'running', agents_done: 3, agents_total: 7, locks_held: ['git', 'notion'], ts: now },
    now,
    0,
  );
  assert.match(chip, /^🔄 wf-abc12345 3\/7 /);
  assert.match(chip, /🔒 git\+notion/);
});

// ── Block C — locks bridge (host-side stamp into the breadcrumb) ──────────────
test('Block C: bridge merges + drops locks, deduped + order-stable', () => {
  const b = require('./workflow-locks-bridge.js');
  assert.deepEqual(b.mergeLocks({ run_id: 'x' }, ['git', 'notion']).locks_held, ['git', 'notion']);
  assert.deepEqual(
    b.mergeLocks({ run_id: 'x', locks_held: ['git'] }, ['git', 'deploy']).locks_held,
    ['git', 'deploy'],
    'dedupes against existing',
  );
  assert.equal(b.mergeLocks(null, ['git']), null, 'no snapshot → nothing to stamp');
  assert.deepEqual(b.dropLocks({ run_id: 'x', locks_held: ['git', 'notion'] }, ['git']).locks_held, ['notion']);
  assert.equal(
    Object.prototype.hasOwnProperty.call(b.dropLocks({ run_id: 'x', locks_held: ['git'] }, ['git']), 'locks_held'),
    false,
    'emptying removes the key entirely',
  );
});

// ── Block F — Line 1 versioned model + Line 2 token-chip model annotations ────
test('Block F: shortModelTag versions cloud models, passes locals through', () => {
  const sl = require('./statusline-multi.js');
  // shortModelTag is internal; assert through the public surface where possible.
  // buildTokenChip(models:true) annotates only non-zero tiers.
  const snap = { T0: { tokens_in: 100, tokens_out: 50 }, T1: {}, T2: {}, T3: { tokens_in: 200000, tokens_out: 63800 } };
  const plain = sl.buildTokenChip(snap, { color: false });
  const annotated = sl.buildTokenChip(snap, { color: false, models: true });
  assert.equal(plain, '🪙 T0:150 tkns · T1:0 · T2:0 · T3:263.8k', 'default off → byte-identical');
  assert.match(annotated, /T0:150 \(local\) tkns/, 'T0 annotated with local');
  assert.match(annotated, /T3:263\.8k \(opus-4\.6\)/, 'T3 annotated with versioned opus');
  assert.match(annotated, /T1:0 · T2:0/, 'zero tiers stay unannotated (no noise)');
});

test('Block F: Line 1 lastLabel carries the routed model version', () => {
  const sl = require('./statusline-multi.js');
  // A green state whose last decision logged recommended_model gets the version.
  const ctx = {
    counts: { T0: 0, T1: 0, T2: 0, T3: 1 }, total: 1,
    recent: [{ tier: 'T3', confidence: 0.9 }],
    last: { tier: 'T3', confidence: 0.9, recommended_model: 'claude-opus-4-6' },
    savedUsd: 1.0, savedPct: 90,
  };
  const s = sl.pickState(ctx);
  assert.match(s.lastLabel, /T3 opus-4\.6 · conf 0\.90/, 'versioned model replaces bare "opus"');
});
