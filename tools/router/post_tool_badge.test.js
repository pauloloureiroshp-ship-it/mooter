// Wave 10 · A.4 — per-tool-call model badge (PostToolUse hook).
// node:test + assert, matching the repo's existing badge tests.

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  buildPostToolBadge, badgeEnabled, shortModel,
  herdVisibility, herdAnnotationEnabled, buildHerdLine, herdAnnotationFor,
  recordSpawn,
} = require('./post_tool_badge.js');
const tracker = require('./subagent_tracker.js');
const fs = require('fs');

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

// ── Wave 13 "Show the Herd" — per-agent annotation ──────────────────────

test('herdVisibility: env wins, then prefs, then default standard', () => {
  const prev = process.env.MOOTER_HERD_VISIBILITY;
  delete process.env.MOOTER_HERD_VISIBILITY;
  try {
    assert.equal(herdVisibility({}), 'standard', 'default');
    assert.equal(herdVisibility({ herd_visibility: 'quiet' }), 'quiet', 'from prefs');
    assert.equal(herdVisibility({ herd_visibility: 'bogus' }), 'standard', 'invalid prefs → default');
    process.env.MOOTER_HERD_VISIBILITY = 'verbose';
    assert.equal(herdVisibility({ herd_visibility: 'quiet' }), 'verbose', 'env overrides prefs');
    process.env.MOOTER_HERD_VISIBILITY = 'SILENT';
    assert.equal(herdVisibility({}), 'silent', 'case-insensitive');
  } finally {
    if (prev === undefined) delete process.env.MOOTER_HERD_VISIBILITY;
    else process.env.MOOTER_HERD_VISIBILITY = prev;
  }
});

test('herdAnnotationEnabled: only standard + verbose render the line', () => {
  assert.equal(herdAnnotationEnabled('standard'), true);
  assert.equal(herdAnnotationEnabled('verbose'), true);
  assert.equal(herdAnnotationEnabled('quiet'), false);
  assert.equal(herdAnnotationEnabled('silent'), false);
});

test('buildHerdLine: local agent wears 🐄, shows model + measured avg', () => {
  const out = buildHerdLine({ agent_name: 'local-summarizer', count: 3, avg_ms: 240, local: true, model: 'qwen2.5:3b' }, { verbosity: 'standard' });
  assert.match(out, /🐄 local-summarizer × 3/);
  assert.match(out, /qwen2\.5/);
  assert.match(out, /avg 240ms/);
  assert.doesNotMatch(out, /☁/);
});

test('buildHerdLine: cloud agent wears ☁ (not a Moo)', () => {
  const out = buildHerdLine({ agent_name: 'model-reasoner', count: 2, avg_ms: 0, local: false, model: 'claude-sonnet-4-6' }, { verbosity: 'standard' });
  assert.match(out, /☁ model-reasoner × 2/);
  assert.match(out, /sonnet/);
  assert.doesNotMatch(out, /🐄/);
});

test('buildHerdLine: no invented latency when avg_ms is 0', () => {
  const out = buildHerdLine({ agent_name: 'local-transformer', count: 5, avg_ms: 0, local: true }, { verbosity: 'standard' });
  assert.doesNotMatch(out, /ms/, 'no fabricated latency');
  assert.match(out, /🐄 local-transformer × 5/);
});

test('buildHerdLine: verbose adds the tier next to the model', () => {
  const out = buildHerdLine({ agent_name: 'local-summarizer', count: 1, avg_ms: 200, local: true, model: 'qwen2.5:3b', tier: 'T0' }, { verbosity: 'verbose' });
  assert.match(out, /qwen2\.5 T0/);
});

test('buildHerdLine: suppressed at quiet/silent, and on empty/zero rows', () => {
  assert.equal(buildHerdLine({ agent_name: 'local-summarizer', count: 3, local: true }, { verbosity: 'quiet' }), '');
  assert.equal(buildHerdLine({ agent_name: 'local-summarizer', count: 3, local: true }, { verbosity: 'silent' }), '');
  assert.equal(buildHerdLine(null, { verbosity: 'standard' }), '');
  assert.equal(buildHerdLine({ agent_name: 'x', count: 0 }, { verbosity: 'standard' }), '', 'zero count → nothing');
  assert.equal(buildHerdLine({ count: 3 }, { verbosity: 'standard' }), '', 'no agent name → nothing');
});

test('herdAnnotationFor: picks the just-completed agent class from the snapshot', () => {
  const snap = {
    cumulative: [
      { agent_name: 'local-summarizer', count: 8, avg_ms: 240, local: true, model: 'qwen2.5:3b' },
      { agent_name: 'model-architect', count: 1, avg_ms: 0, local: false, model: 'opus' },
    ],
  };
  assert.match(herdAnnotationFor('local-summarizer', snap, 'standard'), /🐄 local-summarizer × 8/);
  assert.match(herdAnnotationFor('model-architect', snap, 'standard'), /☁ model-architect × 1/);
  assert.equal(herdAnnotationFor('not-spawned', snap, 'standard'), '', 'unknown agent → nothing');
  assert.equal(herdAnnotationFor(null, snap, 'standard'), '', 'no agent → nothing');
  assert.equal(herdAnnotationFor('local-summarizer', null, 'standard'), '', 'no snapshot → nothing');
});

// ── Wave 20 (20.B) — herd writer: PostToolUse records the spawn ──────────
// Day 1 root cause was that trackSpawn() was NEVER called at runtime (no
// SubagentStart/Stop hook wired). These prove the PostToolUse path now writes it.

test('20.B recordSpawn: a spawn lands in the herd tracker (total accurate)', () => {
  // Wave 21 Day 2: migrated to the real CC v2.1.165 payload schema (agent_id +
  // agent_type top-level on the subagent's inner Bash tool). The old Task/Agent +
  // tool_input.subagent_type heuristic never matched real payloads.
  const session_id = `w20b-${process.pid}-${Date.now()}-a`;
  const agent = recordSpawn({
    tool_name: 'Bash',
    session_id,
    agent_id: 'toolu_w20_1',
    agent_type: 'local-summarizer',
    tool_input: { command: 'bash ollama_call.sh --text ...' },
  }, session_id);
  assert.equal(agent, 'local-summarizer', 'returns the spawned agent name for annotation');
  const snap = tracker.snapshot({ session_id });
  const row = snap.cumulative.find((r) => r.agent_name === 'local-summarizer');
  assert.ok(row && row.count === 1, 'spawn counted exactly once (total spawned is accurate)');
  assert.equal(row.local, true, 'local-summarizer is a 🐄 (T0 local)');
  assert.ok(snap.peak_concurrent >= 1, 'peak reflects the spawn');
  tracker.reset({ session_id });
});

test('20.B recordSpawn: integration — writes the herd cache file, idempotent, cloud vs local', () => {
  const session_id = `w20b-${process.pid}-${Date.now()}-b`;
  // A cloud subagent (model-reasoner → T2 sonnet → ☁). Real-payload schema.
  recordSpawn({ tool_name: 'Bash', session_id, agent_id: 'a-cloud', agent_type: 'model-reasoner', tool_input: { command: '...' } }, session_id);
  // The cache file the statusline reads must now EXIST — Day 1 proof was that it never did.
  assert.ok(fs.existsSync(tracker.statePath(session_id)), 'herd cache file written to tmp');
  // A duplicate PostToolUse for the same agent_id must not double-count.
  recordSpawn({ tool_name: 'Bash', session_id, agent_id: 'a-cloud', agent_type: 'model-reasoner', tool_input: { command: '...' } }, session_id);
  const snap = tracker.snapshot({ session_id });
  const row = snap.cumulative.find((r) => r.agent_name === 'model-reasoner');
  assert.equal(row.count, 1, 'idempotent by agent_id — no inflation');
  assert.equal(row.local, false, 'model-reasoner is ☁ cloud (T2), not a 🐄');
  // A main-loop Bash tool (no agent_id/agent_type) is not a spawn.
  assert.equal(recordSpawn({ tool_name: 'Bash', session_id, tool_input: {} }, session_id), null, 'main-loop Bash is not a spawn');
  tracker.reset({ session_id });
});

test('21.D2 recordSpawn: real CC payload (Bash with agent_type+agent_id) writes herd', () => {
  const session_id = `w21d2-${process.pid}-${Date.now()}`;
  const realPayload = {
    session_id,
    agent_id: 'a2a383659d91ab89a',
    agent_type: 'local-summarizer',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'bash ollama_call.sh --text ...' },
  };
  const agent = recordSpawn(realPayload, session_id);
  assert.equal(agent, 'local-summarizer', 'returns agent name from agent_type');
  const snap = tracker.snapshot({ session_id });
  const row = snap.cumulative.find((r) => r.agent_name === 'local-summarizer');
  assert.ok(row && row.count === 1, 'spawn counted once');
  assert.equal(row.local, true, '🐄 local');
  // Multiple bashes within same spawn (same agent_id) → idempotent
  recordSpawn(realPayload, session_id);
  recordSpawn(realPayload, session_id);
  const snap2 = tracker.snapshot({ session_id });
  const row2 = snap2.cumulative.find((r) => r.agent_name === 'local-summarizer');
  assert.equal(row2.count, 1, 'idempotent by agent_id — multiple inner bashes still count once');
  tracker.reset({ session_id });
});

test('21.D2 recordSpawn: outer Agent tool without agent_id is now skipped (counted via inner Bash instead)', () => {
  const session_id = `w21d2-${process.pid}-${Date.now()}-outer`;
  const outerAgentPayload = {
    session_id, hook_event_name: 'PostToolUse',
    tool_name: 'Agent',
    tool_input: { description: 'Resume X', prompt: 'Lê...' },
  };
  assert.equal(recordSpawn(outerAgentPayload, session_id), null, 'outer Agent without agent_type → skipped');
  tracker.reset({ session_id });
});
