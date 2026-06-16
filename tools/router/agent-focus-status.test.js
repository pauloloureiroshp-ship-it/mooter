'use strict';
// Wave 53 Phase B.3 — agent-focus line-3 chip.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildAgentFocusChip, fmtDur, statusLine } = require('./agent-focus-status.js');

const NOW = 1_000_000_000_000;
const snap = (active) => ({ active_count: active.length, active });

// ── pure renderer ──────────────────────────────────────────────────────────
test('no active subagent → silent', () => {
  assert.strictEqual(buildAgentFocusChip(snap([]), NOW), '');
  assert.strictEqual(buildAgentFocusChip(null, NOW), '');
});

test('one active → name + model + duration', () => {
  const out = buildAgentFocusChip(snap([
    { agent_name: 'model-reasoner', tier: 'T2', model: 'sonnet', started_at: NOW - 8000 },
  ]), NOW);
  assert.strictEqual(out, '🤖 model-reasoner (sonnet, 8s)');
});

test('model falls back to tier when model absent', () => {
  const out = buildAgentFocusChip(snap([
    { agent_name: 'cheap-triage', tier: 'T1', model: null, started_at: NOW - 4000 },
  ]), NOW);
  assert.strictEqual(out, '🤖 cheap-triage (T1, 4s)');
});

test('no started_at → duration omitted, no fabrication', () => {
  const out = buildAgentFocusChip(snap([
    { agent_name: 'local-summarizer', model: 'qwen3:30b' },
  ]), NOW);
  assert.strictEqual(out, '🤖 local-summarizer (qwen3:30b)');
});

test('multiple active → longest-running focus + count of rest', () => {
  const out = buildAgentFocusChip(snap([
    { agent_name: 'b', model: 'haiku', started_at: NOW - 5000 },
    { agent_name: 'a', model: 'opus', started_at: NOW - 72000 },   // oldest → focus
    { agent_name: 'c', model: 'sonnet', started_at: NOW - 1000 },
  ]), NOW);
  assert.strictEqual(out, '🤖 a +2 (opus, 1m)');
});

test('entries without agent_name are ignored', () => {
  const out = buildAgentFocusChip(snap([{ model: 'x', started_at: NOW }, { agent_name: 'real', started_at: NOW - 2000 }]), NOW);
  assert.strictEqual(out, '🤖 real (2s)');
});

// ── fmtDur ──────────────────────────────────────────────────────────────────
test('fmtDur: seconds / minutes / hours', () => {
  assert.strictEqual(fmtDur(8000), '8s');
  assert.strictEqual(fmtDur(4 * 60_000), '4m');
  assert.strictEqual(fmtDur(72 * 60_000), '1h12m');
});

// ── statusLine integration (reads the per-session herd state file) ───────────
function herdPath(sid) {
  return path.join(os.tmpdir(), `mooter-herd-${sid}.json`);
}

test('statusLine reads the herd state for the session', () => {
  const sid = 'b3test' + process.pid;
  const p = herdPath(sid);
  fs.writeFileSync(p, JSON.stringify({
    active: { 'm-1': { agent_name: 'model-architect', tier: 'T3', model: 'opus', started_at: Date.now() - 3000 } },
    cumulative: {}, peak_concurrent: 1,
  }));
  try {
    assert.match(statusLine(sid), /^🤖 model-architect \(opus, \ds\)$/);
  } finally {
    fs.rmSync(p, { force: true });
  }
});

test('statusLine honours hidden_chips opt-out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-agfocus-'));
  const prevHome = process.env.HOME;
  process.env.HOME = dir;
  const sid = 'b3hide' + process.pid;
  const p = herdPath(sid);
  fs.mkdirSync(path.join(dir, '.mooter'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.mooter', 'preferences.json'), JSON.stringify({ hidden_chips: ['agent_focus'] }));
  fs.writeFileSync(p, JSON.stringify({ active: { x: { agent_name: 'a', started_at: Date.now() } }, cumulative: {}, peak_concurrent: 1 }));
  try {
    assert.strictEqual(statusLine(sid), '');
  } finally {
    if (prevHome === undefined) delete process.env.HOME; else process.env.HOME = prevHome;
    fs.rmSync(p, { force: true });
  }
});
