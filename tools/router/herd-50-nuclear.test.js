// Wave 26 (26.H) — "herd nuclear": 50-subagent stress + idempotency for the
// native SubagentStop path on Claude Code v2.1.167.
//
// Wave 23 Phase 0 (WAVE23_PHASE0_V167_SCHEMA.md) already proved the v167
// payload is backward-compatible and the hook records a single live spawn with
// no regression. This test is the SCALE assurance the brief (26.H) asked for —
// SYNTHETIC, never spawns real subagents (so it costs nothing and never trips
// the ">5 live subagents" guardrail).
//
// Honest framing of what is and isn't testable:
//   - The native SubagentStop hook fires at COMPLETION (handle() does an
//     idempotent trackSpawn + trackComplete in one call). On its own it can
//     never observe 50-way concurrency — only one completion at a time.
//   - The 50-way peak is held by the spawn-side recording (PreToolUse / Path-β
//     trackSpawn). So the nuclear contract is two-part:
//       (1) the tracker holds a 50-deep herd: peak_concurrent == 50, correct
//           local/cloud split, and disperses cleanly to 0;
//       (2) the native hook settles all 50 idempotently — racing the spawn
//           side, double-firing, and spawn-less completions never inflate or
//           corrupt the cumulative tally.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const tracker = require('./subagent_tracker.js');
const hook = require('./subagentstop_hook.js');

let _n = 0;
function sid() {
  _n += 1;
  return `nuke-${process.pid}-${Date.now()}-${_n}`;
}

// 50 subagents: 30 local Moos (local-summarizer → T0) + 20 cloud agents
// (model-reasoner → T2). These agent_types resolve through the real
// SUBAGENT_TIER map in post_tool_badge.js, exactly as the live hook would.
const HERD = Array.from({ length: 50 }, (_, i) => {
  const local = i < 30;
  return {
    agent_id: `nuke-agent-${i}`,
    agent_type: local ? 'local-summarizer' : 'model-reasoner',
    tier: local ? 'T0' : 'T2',
    model: local ? 'qwen2.5:3b' : 'claude-sonnet-4-6',
    local,
  };
});

test('nuclear: 50 concurrent spawns hold a 50-deep herd, then disperse to 0', () => {
  const session_id = sid();

  // ── 50 PreToolUse / Path-β spawns, all in flight at once ──
  for (const a of HERD) {
    tracker.trackSpawn({ agent_name: a.agent_type, tier: a.tier, model: a.model, spawn_id: a.agent_id, session_id });
  }

  const peak = tracker.snapshot({ session_id });
  assert.equal(peak.active_count, 50, 'all 50 Moos in flight');
  assert.equal(peak.active_local, 30, '30 local Moos');
  assert.equal(peak.active_cloud, 20, '20 cloud agents');
  assert.equal(peak.peak_concurrent, 50, 'high-water mark is the full herd');

  // ── native SubagentStop fires once per agent (completion side) ──
  for (const a of HERD) {
    const recorded = hook.handle({ agent_type: a.agent_type, agent_id: a.agent_id, session_id });
    assert.equal(recorded, a.agent_type, 'hook attributes the completion');
  }

  const done = tracker.snapshot({ session_id });
  assert.equal(done.active_count, 0, 'herd fully dispersed');
  assert.equal(done.peak_concurrent, 50, 'peak retained after dispersal');
  const total = done.cumulative.reduce((s, r) => s + r.count, 0);
  assert.equal(total, 50, 'cumulative tally == 50, no inflation from the hook re-spawn');

  tracker.reset({ session_id });
});

test('nuclear: double-fired SubagentStop (retry) across all 50 never inflates', () => {
  const session_id = sid();

  for (const a of HERD) {
    tracker.trackSpawn({ agent_name: a.agent_type, tier: a.tier, model: a.model, spawn_id: a.agent_id, session_id });
  }
  // Every SubagentStop fires TWICE (harness retry / double-delivery).
  for (const a of HERD) {
    hook.handle({ agent_type: a.agent_type, agent_id: a.agent_id, session_id });
    hook.handle({ agent_type: a.agent_type, agent_id: a.agent_id, session_id });
  }

  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 0, 'all settled despite duplicate stops');
  const total = snap.cumulative.reduce((s, r) => s + r.count, 0);
  assert.equal(total, 50, 'duplicate SubagentStop is a no-op — tally stays 50');

  tracker.reset({ session_id });
});

test('nuclear: spawn-less completions (Read-only Moos Path-β misses) are caught, counted once', () => {
  const session_id = sid();

  // No Path-β spawn ever arrives — the native hook is the ONLY signal. handle()
  // does trackSpawn+trackComplete itself, so each Moo is recorded exactly once.
  for (const a of HERD) {
    hook.handle({ agent_type: a.agent_type, agent_id: a.agent_id, session_id });
  }

  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 0, 'each spawn-less Moo opened and closed atomically');
  const total = snap.cumulative.reduce((s, r) => s + r.count, 0);
  assert.equal(total, 50, 'all 50 spawn-less completions captured exactly once');

  // by-class aggregation stays correct at scale
  const localRow = snap.cumulative.find((r) => r.agent_name === 'local-summarizer');
  const cloudRow = snap.cumulative.find((r) => r.agent_name === 'model-reasoner');
  assert.equal(localRow.count, 30, '30 local Moos by class');
  assert.equal(cloudRow.count, 20, '20 cloud agents by class');

  tracker.reset({ session_id });
});

test('nuclear: malformed / un-attributable SubagentStop payloads are ignored', () => {
  const session_id = sid();
  // Missing agent_id, missing agent_type, null, garbage — none recorded.
  assert.equal(hook.handle(null), null);
  assert.equal(hook.handle({ session_id }), null, 'no agent_id/type → ignored');
  assert.equal(hook.handle({ agent_type: 'local-summarizer', session_id }), null, 'no agent_id → ignored');
  assert.equal(hook.handle({ agent_id: 'x', session_id }), null, 'no agent_type → ignored');

  const snap = tracker.snapshot({ session_id });
  assert.equal(snap.active_count, 0, 'no phantom Moos from bad payloads');
  assert.deepEqual(snap.cumulative, [], 'tally untouched');

  tracker.reset({ session_id });
});
