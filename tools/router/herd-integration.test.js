// Wave 13 "Show the Herd" — integration test.
//
// Drives the full hook lifecycle across simulated SEPARATE processes (state is
// file-backed in os.tmpdir(), so a fresh snapshot/render faithfully mimics what
// the real PreToolUse / PostToolUse / Stop hooks see):
//
//   PreToolUse  → trackSpawn  → statusline 🐄×N chip
//   PostToolUse → trackComplete → post_tool_badge per-agent line
//   Stop        → snapshot → digest "Moos that worked" → reset
//
// Plus idempotency under a hook-ordering race (§5).

const { test } = require('node:test');
const assert = require('node:assert/strict');

const tracker = require('./subagent_tracker.js');
const { renderFromContext } = require('./statusline-multi.js');
const { herdAnnotationFor } = require('./post_tool_badge.js');
const { buildHerdSection } = require('./stop_hook.js');

let _n = 0;
function sid() {
  _n += 1;
  return `integ-${process.pid}-${Date.now()}-${_n}`;
}

// A green-ish statusline ctx; the test injects `herd` from the live snapshot,
// exactly as buildContext() does in production.
function ctxWithHerd(session_id) {
  const snap = tracker.snapshot({ session_id });
  return {
    counts: { T0: 2, T1: 0, T2: 1, T3: 0 }, total: 3,
    last: { tier: 'T2', confidence: 0.8, suggested_providers: ['sonnet'] },
    recent: [], savedUsd: 0.18, savedPct: 89, dataMissing: false,
    herd: { active: snap.active_count, local: snap.active_local, cloud: snap.active_cloud, peak: snap.peak_concurrent },
  };
}

test('lifecycle: 3 Moos spawn → live 🐄×3 chip → complete → Stop digest → reset', () => {
  const session_id = sid();

  // ── PreToolUse ×3 (two local Moos + one cloud agent) ──
  const a = tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', model: 'qwen2.5:3b', spawn_id: 'A', session_id });
  const b = tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', model: 'qwen2.5:3b', spawn_id: 'B', session_id });
  const c = tracker.trackSpawn({ agent_name: 'model-reasoner', tier: 'T2', model: 'claude-sonnet-4-6', spawn_id: 'C', session_id });
  assert.deepEqual([a, b, c], ['A', 'B', 'C']);

  // ── statusline (a different process) sees the live count ──
  const line = renderFromContext(ctxWithHerd(session_id));
  assert.ok(line.includes('🐄×3'), `live chip should show all 3 in flight: ${line}`);

  const mid = tracker.snapshot({ session_id });
  assert.equal(mid.active_count, 3);
  assert.equal(mid.active_local, 2, '2 Moos local');
  assert.equal(mid.active_cloud, 1, '1 cloud agent');
  assert.equal(mid.peak_concurrent, 3);

  // ── PostToolUse ×3 (each a separate process) ──
  tracker.trackComplete('A', { duration_ms: 240, session_id });
  tracker.trackComplete('B', { duration_ms: 200, session_id });
  tracker.trackComplete('C', { duration_ms: 1800, session_id });

  // chip falls back to 🐄×0 (dim) once the herd disperses
  const after = renderFromContext(ctxWithHerd(session_id));
  assert.ok(after.includes('🐄×0'), `herd dispersed → 🐄×0: ${after}`);

  // ── PostToolUse per-agent annotation for the class that just finished ──
  const snapDone = tracker.snapshot({ session_id });
  const annot = herdAnnotationFor('local-summarizer', snapDone, 'standard');
  assert.match(annot, /🐄 local-summarizer × 2/, 'aggregated by class, not per spawn');
  assert.match(annot, /avg 220ms/, 'avg of 240 & 200');

  // ── Stop digest: cumulative tally + peak concurrent ──
  const digest = buildHerdSection(snapDone, { verbosity: 'standard' });
  assert.match(digest, /peak concurrent: 3/);
  assert.match(digest, /🐄 local-summarizer\s+× 2\s+avg 220ms/);
  assert.match(digest, /☁ model-reasoner\s+× 1\s+sonnet/);

  // ── Stop resets; the next session starts from an empty pasture ──
  tracker.reset({ session_id });
  const cleared = tracker.snapshot({ session_id });
  assert.equal(cleared.active_count, 0);
  assert.equal(cleared.peak_concurrent, 0);
  assert.deepEqual(cleared.cumulative, []);
});

test('race: duplicate spawn + complete-before-spawn never corrupt the tally', () => {
  const session_id = sid();

  // Duplicate PreToolUse for the same spawn (retry / double-fire).
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'X', session_id });
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'X', session_id });
  assert.equal(tracker.snapshot({ session_id }).active_count, 1, 'duplicate spawn deduped');

  // PostToolUse arrives before PreToolUse for a different spawn (slow-tool race).
  // PostToolUse still knows the agent identity, so it labels the completion.
  tracker.trackComplete('Y', { duration_ms: 150, agent_name: 'local-summarizer', tier: 'T0', session_id });
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'Y', session_id });
  assert.equal(tracker.snapshot({ session_id }).active_count, 1, 'late spawn did not resurrect Y; X still active');

  // Double completion of X is a no-op.
  tracker.trackComplete('X', { duration_ms: 100, session_id });
  tracker.trackComplete('X', { duration_ms: 100, session_id });
  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 0, 'all settled');
  const row = snap.cumulative.find((r) => r.agent_name === 'local-summarizer');
  assert.equal(row.count, 2, 'X once + Y(completed) once — no inflation from duplicates/races');

  tracker.reset({ session_id });
});

test('concurrency: peak reflects the high-water mark even as Moos overlap', () => {
  const session_id = sid();
  // 4 spawn, 2 finish, 1 more spawn → max in flight was 4.
  for (const id of ['1', '2', '3', '4']) tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: id, session_id });
  tracker.trackComplete('1', { duration_ms: 50, session_id });
  tracker.trackComplete('2', { duration_ms: 50, session_id });
  tracker.trackSpawn({ agent_name: 'model-architect', tier: 'T3', model: 'opus', spawn_id: '5', session_id });
  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 3, '3 still in flight');
  assert.equal(snap.peak_concurrent, 4, 'peak retained at the 4-way overlap');
  tracker.reset({ session_id });
});
