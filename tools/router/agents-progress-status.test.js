'use strict';
// Wave 58 batch 2 (A.1) — 🤖 agents-progress line-3 chip. Hermetic: pure
// buildAgentsProgressChip with injected sources + `now`; temp MOOTER_HOME/HOME for
// the opt-in gate and the active-run pointer read.

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mod = require('./agents-progress-status.js');
const {
  buildAgentsProgressChip, readActiveWorkflow, currentAgent, activeNamed,
  fmtElapsed, fmtTokens, optedIn, statusLine,
} = mod;

const NOW = 1_000_000_000_000;
const wf = (over = {}) => ({ id: 'r1', done: 3, total: 7, tokens: 0, status: 'running', ts: NOW - 72000, ...over });
const snap = (active) => ({ active_count: active.length, active });

// ── buildAgentsProgressChip (pure) ───────────────────────────────────────────

test('no run and no live agent → honest 🤖 ?', () => {
  assert.equal(buildAgentsProgressChip(null, null, NOW), '🤖 ?');
  assert.equal(buildAgentsProgressChip(null, snap([]), NOW), '🤖 ?');
});

test('full chip: done/total · elapsed · tokens · current', () => {
  const out = buildAgentsProgressChip(
    wf({ tokens: 42300 }),
    snap([{ agent_name: 'model-reasoner', started_at: NOW - 5000 }]),
    NOW,
  );
  assert.equal(out, '🤖 3/7 done · 1m 12s · ↓42.3k tok · current: model-reasoner');
});

test('tokens omitted when the pointer carries none (Wave 28 writes none) — no fabrication', () => {
  const out = buildAgentsProgressChip(wf({ tokens: 0 }), snap([]), NOW);
  assert.equal(out, '🤖 3/7 done · 1m 12s');
});

// Wave 58.4 Block C — "K running" segment (≥2 in flight).
test('two+ in-flight agents → "K running" segment after done/total', () => {
  const out = buildAgentsProgressChip(
    wf({ tokens: 42300 }),
    snap([
      { agent_name: 'model-reasoner', started_at: NOW - 5000 },
      { agent_name: 'cheap-triage', started_at: NOW - 3000 },
    ]),
    NOW,
  );
  assert.equal(out, '🤖 3/7 done · 2 running · 1m 12s · ↓42.3k tok · current: model-reasoner');
});

test('single in-flight agent → no "running" segment (current: names it)', () => {
  const out = buildAgentsProgressChip(wf({ tokens: 0 }), snap([{ agent_name: 'cheap-triage', started_at: NOW - 3000 }]), NOW);
  assert.doesNotMatch(out, /running/);
  assert.equal(out, '🤖 3/7 done · 1m 12s · current: cheap-triage');
});

test('activeNamed counts named records, ignores nameless / null snap', () => {
  assert.equal(activeNamed(snap([{ agent_name: 'a', started_at: 1 }, { agent_name: '', started_at: 2 }, { started_at: 3 }])).length, 1);
  assert.equal(activeNamed(null).length, 0);
});

test('current agent omitted when no subagent is in flight', () => {
  assert.equal(buildAgentsProgressChip(wf(), null, NOW), '🤖 3/7 done · 1m 12s');
});

test('elapsed falls back to the current agent started_at when the run has no ts', () => {
  const out = buildAgentsProgressChip(
    wf({ ts: null, done: 0, total: 0 }),
    snap([{ agent_name: 'cheap-triage', started_at: NOW - 9000 }]),
    NOW,
  );
  // no counts → "running"; elapsed from the agent; current named
  assert.equal(out, '🤖 running · 9s · current: cheap-triage');
});

test('no counts and no ts and no agent details still avoids fabrication', () => {
  // running pointer, zero counts, no ts, and only a nameless active record
  const out = buildAgentsProgressChip(
    { id: 'r1', done: 0, total: 0, tokens: 0, status: 'running', ts: null },
    snap([{ model: 'x', started_at: NOW }]),
    NOW,
  );
  assert.equal(out, '🤖 running');
});

test('only a live agent (no run pointer) → current + its elapsed', () => {
  const out = buildAgentsProgressChip(null, snap([{ agent_name: 'local-summarizer', started_at: NOW - 3000 }]), NOW);
  assert.equal(out, '🤖 3s · current: local-summarizer');
});

test('sub-1000 token count rendered verbatim', () => {
  const out = buildAgentsProgressChip(wf({ tokens: 812, ts: NOW }), snap([]), NOW);
  assert.equal(out, '🤖 3/7 done · 0s · ↓812 tok');
});

// ── currentAgent ─────────────────────────────────────────────────────────────

test('currentAgent picks the longest-running and ignores nameless records', () => {
  const c = currentAgent(snap([
    { agent_name: 'b', started_at: NOW - 5000 },
    { model: 'x', started_at: NOW - 99999 },          // nameless → ignored
    { agent_name: 'a', started_at: NOW - 72000 },     // oldest named → focus
  ]));
  assert.equal(c.agent_name, 'a');
  assert.equal(currentAgent(snap([])), null);
  assert.equal(currentAgent(null), null);
});

// ── fmtElapsed / fmtTokens ───────────────────────────────────────────────────

test('fmtElapsed: seconds / minutes+seconds / hours', () => {
  assert.equal(fmtElapsed(9000), '9s');
  assert.equal(fmtElapsed(72000), '1m 12s');
  assert.equal(fmtElapsed(4 * 60000), '4m');
  assert.equal(fmtElapsed((1 * 3600 + 4 * 60) * 1000), '1h 4m');
  assert.equal(fmtElapsed(3600 * 1000), '1h');
});

test('fmtTokens: thresholds and empty on zero/garbage', () => {
  assert.equal(fmtTokens(42300), '42.3k tok');
  assert.equal(fmtTokens(812), '812 tok');
  assert.equal(fmtTokens(0), '');
  assert.equal(fmtTokens(NaN), '');
});

// ── readActiveWorkflow ───────────────────────────────────────────────────────

test('readActiveWorkflow: null when absent, parsed when running', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agprog-rd-'));
  const p = path.join(dir, 'active-run.json');
  assert.equal(readActiveWorkflow(p, NOW), null);
  fs.writeFileSync(p, JSON.stringify({ run_id: 'r1', status: 'running', agents_done: 2, agents_total: 5, ts: NOW }));
  const w = readActiveWorkflow(p, NOW);
  assert.equal(w.done, 2);
  assert.equal(w.total, 5);
  assert.equal(w.tokens, 0);
});

test('readActiveWorkflow: null for non-running or stale pointers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agprog-rd2-'));
  const done = path.join(dir, 'done.json');
  fs.writeFileSync(done, JSON.stringify({ run_id: 'r1', status: 'completed', ts: NOW }));
  assert.equal(readActiveWorkflow(done, NOW), null);
  const stale = path.join(dir, 'stale.json');
  fs.writeFileSync(stale, JSON.stringify({ run_id: 'r1', status: 'running', ts: NOW - mod.STALE_MS - 1 }));
  assert.equal(readActiveWorkflow(stale, NOW), null);
});

// ── optedIn gate ─────────────────────────────────────────────────────────────

test('optedIn: default OFF; env or pref turns it ON; hidden_chips wins', () => {
  delete process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS;
  assert.equal(optedIn({}), false);
  assert.equal(optedIn({ statusline_chips: { agents_progress: true } }), true);
  assert.equal(optedIn({ statusline_chips: { agents_progress: true }, hidden_chips: ['agents_progress'] }), false);
  process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS = '1';
  try {
    assert.equal(optedIn({}), true);
  } finally {
    delete process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS;
  }
});

// ── statusLine integration ───────────────────────────────────────────────────

// The opt-in pref lives at os.homedir()/.mooter/preferences.json, which is not
// overridable via $HOME on Windows. The env gate MOOTER_STATUSLINE_AGENTS_PROGRESS
// is the cross-platform half of the same opt-in contract, so we drive these
// integration tests through it (default OFF is verified via optedIn({}) above).

test('statusLine: silent when the env gate is OFF, even with a live run', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agprog-off-'));
  fs.mkdirSync(path.join(home, '.mooter', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(home, '.mooter', 'workflows', 'active-run.json'),
    JSON.stringify({ run_id: 'r1', status: 'running', agents_done: 1, agents_total: 4, ts: Date.now() }));
  const prevActive = process.env.MOOTER_WORKFLOW_ACTIVE;
  const prevGate = process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS;
  delete process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS;
  process.env.MOOTER_WORKFLOW_ACTIVE = path.join(home, '.mooter', 'workflows', 'active-run.json');
  try {
    assert.equal(statusLine('agprog-off-' + process.pid), '');
  } finally {
    restore('MOOTER_WORKFLOW_ACTIVE', prevActive); restore('MOOTER_STATUSLINE_AGENTS_PROGRESS', prevGate);
  }
});

test('statusLine: env-gated ON renders the run chip from the pointer', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agprog-on-'));
  fs.mkdirSync(path.join(home, '.mooter', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(home, '.mooter', 'workflows', 'active-run.json'),
    JSON.stringify({ run_id: 'r1', status: 'running', agents_done: 2, agents_total: 6, ts: Date.now() }));
  const prevActive = process.env.MOOTER_WORKFLOW_ACTIVE;
  const prevGate = process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS;
  process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS = '1';
  process.env.MOOTER_WORKFLOW_ACTIVE = path.join(home, '.mooter', 'workflows', 'active-run.json');
  try {
    // unique session id → empty herd → no `current:`; pointer drives the rest
    assert.match(statusLine('agprog-on-' + process.pid), /^🤖 2\/6 done · \d+s$/);
  } finally {
    restore('MOOTER_WORKFLOW_ACTIVE', prevActive); restore('MOOTER_STATUSLINE_AGENTS_PROGRESS', prevGate);
  }
});

test('statusLine: env-gated ON but no run and no agent → honest 🤖 ?', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agprog-none-'));
  const prevActive = process.env.MOOTER_WORKFLOW_ACTIVE;
  const prevGate = process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS;
  process.env.MOOTER_STATUSLINE_AGENTS_PROGRESS = '1';
  process.env.MOOTER_WORKFLOW_ACTIVE = path.join(home, 'nope.json');
  try {
    assert.equal(statusLine('agprog-none-' + process.pid), '🤖 ?');
  } finally {
    restore('MOOTER_WORKFLOW_ACTIVE', prevActive); restore('MOOTER_STATUSLINE_AGENTS_PROGRESS', prevGate);
  }
});

function restore(key, val) {
  if (val === undefined) delete process.env[key];
  else process.env[key] = val;
}

after(() => { /* temp dirs are best-effort; OS reaps tmp */ });
