'use strict';
// Wave 22 — Honesty Foundation. One test per sub-feature (22.A–22.F). Real state files
// in os.tmpdir(), no mocks of the tracker internals (test-conventions: observable
// behaviour, real I/O). Each test is self-contained with a unique session id.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sub = require('./subagentstop_hook.js');
const tracker = require('./subagent_tracker.js');
const tokens = require('./token_tracker.js');
const decisions = require('./decisions_v2.js');
const stop = require('./stop_hook.js');
const sl = require('./statusline-multi.js');

// A minimal subagent transcript: 3 Haiku assistant messages with usage (mirrors the
// Day 0 capture — local-summarizer wrapped by claude-haiku-4-5).
function writeHaikuTranscript(p) {
  const rows = [
    { type: 'assistant', timestamp: '2026-06-05T18:00:00.000Z', message: { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 3, output_tokens: 2 } } },
    { type: 'assistant', timestamp: '2026-06-05T18:00:05.000Z', message: { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 3, output_tokens: 66 } } },
    { type: 'assistant', timestamp: '2026-06-05T18:00:11.000Z', message: { model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 5, output_tokens: 43 } } },
  ];
  fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n'));
}

function tmp(name) { return path.join(os.tmpdir(), name); }

// ── 22.A — native SubagentStop handler records the herd ─────────────────────
test('22.A: SubagentStop handle() records a spawn in the herd (idempotent by agent_id)', () => {
  const sid = 'w22a-' + process.pid;
  const tpath = tmp(`w22a-tx-${process.pid}.jsonl`);
  writeHaikuTranscript(tpath);
  try {
    const payload = { session_id: sid, agent_id: 'agent-AAA', agent_type: 'local-summarizer', agent_transcript_path: tpath };
    assert.equal(sub.handle(payload), 'local-summarizer');
    // re-fire (hook retry / Path-β race) must NOT double-count
    sub.handle(payload);
    const snap = tracker.snapshot({ session_id: sid });
    const row = snap.cumulative.find((r) => r.agent_name === 'local-summarizer');
    assert.ok(row, 'local-summarizer recorded');
    assert.equal(row.count, 1, 'idempotent — counted exactly once');
    assert.equal(row.local, true, '🐄 local Moo');
    assert.ok(row.total_ms >= 11000, 'real duration from ts span (≈11s)');
  } finally {
    tracker.reset({ session_id: sid });
    try { fs.unlinkSync(tpath); fs.unlinkSync(tokens.cachePath(sid)); } catch {}
  }
});

// ── 22.B — subagent wrapper tokens captured at their real tier ───────────────
test('22.B: trackSubagentTranscript captures wrapper tokens (T1 haiku) + dedups', () => {
  const sid = 'w22b-' + process.pid;
  const tpath = tmp(`w22b-tx-${process.pid}.jsonl`);
  writeHaikuTranscript(tpath);
  try {
    const first = tokens.trackSubagentTranscript(sid, 'agent-BBB', tpath);
    assert.equal(first, true, 'recorded new tokens');
    const second = tokens.trackSubagentTranscript(sid, 'agent-BBB', tpath);
    assert.equal(second, false, 'idempotent by agent_id — no double count');
    const snap = tokens.snapshot(sid);
    assert.equal(snap.T1.calls, 3, '3 Haiku assistant messages');
    assert.equal(snap.T1.tokens_in, 11, 'real input tokens');
    assert.equal(snap.T1.tokens_out, 111, 'real output tokens');
    assert.equal(snap.T0.tokens_out, 0, 'T0 stays 0 — Ollama was not invoked (honest)');
  } finally {
    try { fs.unlinkSync(tpath); fs.unlinkSync(tokens.cachePath(sid)); } catch {}
  }
});

// ── 22.C — routed-intent vs real-exec divergence segment ────────────────────
test('22.C: buildExecSegment shows ⚠ on divergence and ✓ when intent == reality', () => {
  const sid = 'w22c-' + process.pid;
  const p = tmp(`mooter-lastexec-${sid}.json`);
  try {
    // local-summarizer routed T0 but executed on T1/haiku → divergence
    fs.writeFileSync(p, JSON.stringify({ agent_type: 'local-summarizer', intent_tier: 'T0', exec_tier: 'T1', exec_model: 'haiku', calls: 3 }));
    const div = sl.buildExecSegment(sid, { color: false });
    assert.match(div, /⚠ exec T1 haiku · 3 calls/);
    // matched (true keyless Ollama run)
    fs.writeFileSync(p, JSON.stringify({ agent_type: 'local-summarizer', intent_tier: 'T0', exec_tier: 'T0', exec_model: 'qwen3:30b', calls: 1 }));
    assert.match(sl.buildExecSegment(sid, { color: false }), /✓ exec local/);
    // missing file → empty, never throws
    assert.equal(sl.buildExecSegment('w22c-none-' + process.pid, { color: false }), '');
  } finally {
    try { fs.unlinkSync(p); } catch {}
  }
});

// ── 22.D — Stop session report renders all five sections ────────────────────
test('22.D: buildSessionReport renders TOKENS/CHOICE/PER-TASK/HERD/SAVINGS', () => {
  const d = {
    durationMs: 12000,
    tokens: { T0: { calls: 1, tokens_in: 100, tokens_out: 50 }, T1: { calls: 3, tokens_in: 11, tokens_out: 111 }, T2: { calls: 0, tokens_in: 0, tokens_out: 0 }, T3: { calls: 2, tokens_in: 5000, tokens_out: 8000 } },
    records: [
      { ts: '2026-06-05T18:00:00.000Z', op: 'trivial_local', tier: 'T0', llm: 'qwen3:30b', via: 'local-summarizer', reason: 'none' },
      { ts: '2026-06-05T18:00:12.000Z', op: 'architecture_or_critical', tier: 'T3', llm: 'opus', via: 'model-architect', reason: 'none' },
    ],
    hardware: { model: 'qwen3:30b', adapter: { name: 'baseline', trained: 188 } },
    herd: tracker.snapshot({ session_id: 'w22d-none' }), // empty herd is fine
    context: {},
  };
  // give the herd one real Moo so the HERD section renders
  d.herd = { active_count: 0, active_local: 0, active_cloud: 0, active: [], by_agent: {}, peak_concurrent: 1,
    cumulative: [{ agent_name: 'local-summarizer', count: 5, total_ms: 25000, avg_ms: 5000, errors: 0, local: true, model: 'qwen3:30b', tier: 'T0' }] };
  const out = stop.buildSessionReport(d);
  for (const section of ['TOKENS BY TIER', 'CHOICE REASONS', 'PER-TASK BREAKDOWN', 'HERD', 'SAVINGS']) {
    assert.ok(out.includes(section), `report must include ${section}:\n${out}`);
  }
  assert.ok(out.includes('local-summarizer'), 'HERD names the Moo');
});

// ── 22.E — no user-facing "frugal" brand strings remain in CLI output ───────
test('22.E: rebranded CLI tools emit "mooter", not "frugal", in user-facing output', () => {
  for (const f of ['hub-push.js', 'hub-pull.js', 'hub-status.js', 'setup-profile.js', 'onboarding.js']) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    for (const line of src.split('\n')) {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('*')) continue;       // comments may keep history
      if (/\/frugal|frugal\/|FRUGAL_|require\(/.test(line)) continue; // paths / env / modules
      if (/(console\.(log|error|warn)|(stdout|stderr)\.write)\s*\(/.test(line)) {
        assert.ok(!/\bfrugal\b(?!-\w)/.test(line), `user-facing brand leftover in ${f}: ${line.trim()}`);
      }
    }
  }
});

// ── 22.F — "trained on N" reflects the live corpus, not stale tuning-state ──
test('22.F: decisions_v2.recordCount() counts the live corpus (matches wc -l)', () => {
  const logp = tmp(`w22f-decisions-${process.pid}.jsonl`);
  const lines = [
    JSON.stringify({ ts: '2026-06-05T18:00:00.000Z', tier: 'T0', llm: 'qwen3:30b' }),
    JSON.stringify({ ts: '2026-06-05T18:00:01.000Z', tier: 'T3', llm: 'opus' }),
    JSON.stringify({ ts: '2026-06-05T18:00:02.000Z', tier: 'T1', llm: 'haiku' }),
  ];
  fs.writeFileSync(logp, lines.join('\n') + '\n');
  try {
    assert.equal(decisions.recordCount({ logPath: logp }), 3, 'live count matches line count');
    fs.unlinkSync(logp);
    assert.equal(decisions.recordCount({ logPath: logp }), 0, 'unreadable log → 0 (best-effort)');
  } finally {
    try { fs.unlinkSync(logp); } catch {}
  }
});
