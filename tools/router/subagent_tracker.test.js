// Wave 13 "Show the Herd" — subagent_tracker.js state machine.
// node:test + assert, matching the repo's existing router tests.
//
// State is backed by a per-session file in os.tmpdir(), so each test uses a
// unique session_id and resets afterwards. Because the state survives in the
// file (not a module Map), a fresh snapshot() call faithfully simulates the
// separate-process reads that the real PreToolUse/PostToolUse/Stop hooks do.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const tracker = require('./subagent_tracker.js');
const { isLocalMoo } = tracker;

let _n = 0;
function sid() {
  // Unique per call so tests never share herd state.
  _n += 1;
  return `test-${process.pid}-${Date.now()}-${_n}`;
}

test('isLocalMoo: local agents, local models, and T0 are Moos; cloud is not', () => {
  assert.equal(isLocalMoo({ agent_name: 'local-summarizer' }), true);
  assert.equal(isLocalMoo({ agent_name: 'local-transformer' }), true);
  assert.equal(isLocalMoo({ tier: 'T0' }), true);
  assert.equal(isLocalMoo({ agent_name: 'cheap-triage', model: 'qwen2.5:3b' }), true, 'keyless Haiku fallback to Ollama is local');
  assert.equal(isLocalMoo({ agent_name: 'dora-adapter-mooter-r32' }), false, 'name alone, no model → not in LOCAL_AGENTS');
  assert.equal(isLocalMoo({ model: 'dora-r32' }), true, 'adapter model fragment → local');
  assert.equal(isLocalMoo({ agent_name: 'model-architect', tier: 'T3', model: 'opus' }), false);
  assert.equal(isLocalMoo({ agent_name: 'cheap-triage', tier: 'T1', model: 'claude-haiku-4-5' }), false, 'Haiku cloud → not a Moo');
  assert.equal(isLocalMoo({}), false, 'empty → cloud by default');
});

test('trackSpawn: returns an id, increments active, grows peak', () => {
  const session_id = sid();
  const a = tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', model: 'qwen2.5:3b', session_id });
  const b = tracker.trackSpawn({ agent_name: 'model-reasoner', tier: 'T2', model: 'sonnet', session_id });
  assert.ok(a && b && a !== b, 'distinct spawn ids');

  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 2);
  assert.equal(snap.active_local, 1, 'only the Moo counts as local');
  assert.equal(snap.active_cloud, 1);
  assert.equal(snap.peak_concurrent, 2);

  tracker.reset({ session_id });
});

test('trackSpawn: idempotent by spawn_id (duplicate is a no-op)', () => {
  const session_id = sid();
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'fixed-1', session_id });
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'fixed-1', session_id });
  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 1, 'duplicate spawn_id did not double-count');
  assert.equal(snap.peak_concurrent, 1);
  tracker.reset({ session_id });
});

test('trackComplete: moves active → cumulative, decrements active, records avg', () => {
  const session_id = sid();
  const id = tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', model: 'qwen2.5:3b', session_id });
  tracker.trackComplete(id, { duration_ms: 240, session_id });

  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 0, 'no longer active');
  assert.equal(snap.peak_concurrent, 1, 'peak is retained after completion');
  const row = snap.cumulative.find((c) => c.agent_name === 'local-summarizer');
  assert.ok(row, 'cumulative row exists');
  assert.equal(row.count, 1);
  assert.equal(row.avg_ms, 240);
  assert.equal(row.local, true);
  tracker.reset({ session_id });
});

test('trackComplete: idempotent (second completion is a no-op)', () => {
  const session_id = sid();
  const id = tracker.trackSpawn({ agent_name: 'local-transformer', tier: 'T0', session_id });
  tracker.trackComplete(id, { duration_ms: 100, session_id });
  const second = tracker.trackComplete(id, { duration_ms: 100, session_id });
  assert.equal(second, false, 'second completion returns false');
  const row = tracker.snapshot({ session_id }).cumulative.find((c) => c.agent_name === 'local-transformer');
  assert.equal(row.count, 1, 'count not inflated by duplicate completion');
  tracker.reset({ session_id });
});

test('race guard: PostToolUse before PreToolUse — late spawn does not resurrect', () => {
  const session_id = sid();
  // Completion arrives first (rare cross-tool race, §5).
  tracker.trackComplete('race-1', { duration_ms: 200, session_id });
  // The matching spawn arrives late — must be a no-op, not a new active entry.
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'race-1', session_id });

  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 0, 'late spawn did not resurrect a completed id');
  assert.equal(snap.cumulative.find((c) => c.agent_name === 'unknown').count, 1, 'completion still recorded once');
  tracker.reset({ session_id });
});

test('cumulative carries model + tier (for the Stop digest cloud labels)', () => {
  const session_id = sid();
  const id = tracker.trackSpawn({ agent_name: 'model-reasoner', tier: 'T2', model: 'claude-sonnet-4-6', session_id });
  tracker.trackComplete(id, { duration_ms: 300, session_id });
  const row = tracker.snapshot({ session_id }).cumulative.find((c) => c.agent_name === 'model-reasoner');
  assert.equal(row.model, 'claude-sonnet-4-6');
  assert.equal(row.tier, 'T2');
  assert.equal(row.local, false);
  tracker.reset({ session_id });
});

test('trackError: records an error against the agent class', () => {
  const session_id = sid();
  const id = tracker.trackSpawn({ agent_name: 'model-architect', tier: 'T3', model: 'opus', session_id });
  tracker.trackError(id, { error_class: 'timeout', session_id });
  const row = tracker.snapshot({ session_id }).cumulative.find((c) => c.agent_name === 'model-architect');
  assert.equal(row.count, 1);
  assert.equal(row.errors, 1);
  assert.equal(row.local, false);
  tracker.reset({ session_id });
});

test('cross-process persistence: state survives in the file between calls', () => {
  const session_id = sid();
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 's1', session_id });
  // Simulate a SEPARATE hook process by reading via a fresh snapshot only.
  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 1, 'a different process can see the spawn');
  assert.equal(snap.by_agent['local-summarizer'].count, 1);
  tracker.reset({ session_id });
});

test('peak_concurrent: reflects the high-water mark, not the current count', () => {
  const session_id = sid();
  const a = tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'p1', session_id });
  const b = tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'p2', session_id });
  const c = tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', spawn_id: 'p3', session_id });
  tracker.trackComplete(a, { duration_ms: 50, session_id });
  tracker.trackComplete(b, { duration_ms: 50, session_id });
  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 1, 'only p3 still active');
  assert.equal(snap.peak_concurrent, 3, 'peak retained at 3');
  tracker.trackComplete(c, { duration_ms: 50, session_id });
  tracker.reset({ session_id });
});

test('reset: clears all state for the session', () => {
  const session_id = sid();
  tracker.trackSpawn({ agent_name: 'local-summarizer', tier: 'T0', session_id });
  tracker.reset({ session_id });
  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 0);
  assert.equal(snap.peak_concurrent, 0);
  assert.equal(snap.cumulative.length, 0);
});

test('snapshot: best-effort — unknown/empty session yields an empty herd', () => {
  const snap = tracker.snapshot({ session_id: sid() });
  assert.equal(snap.active_count, 0);
  assert.equal(snap.active_local, 0);
  assert.equal(snap.active_cloud, 0);
  assert.deepEqual(snap.cumulative, []);
  assert.equal(snap.peak_concurrent, 0);
});
