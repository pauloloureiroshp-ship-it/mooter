// Wave 28 (Phase H) — statusline line 3 for an active workflow run.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { buildWorkflowStatusLine, readActiveRun, STALE_MS } = require('./workflow-status.js');

const NOW = 1_717_999_200_000;

// ── buildWorkflowStatusLine (pure) ────────────────────────────────────────────

test('formats a running run with phase + agent counts', () => {
  const line = buildWorkflowStatusLine(
    { run_id: 'r1', workflow_name: 'audit-unused-exports', status: 'running', phase: 2, num_phases: 4, agents_done: 12, agents_total: 50, ts: NOW },
    NOW,
  );
  assert.equal(line, '🔄 workflow: audit-unused-exports · phase 2/4 · 12/50 agents');
});

test('falls back to run_id and omits absent phase/agent fields', () => {
  const line = buildWorkflowStatusLine({ run_id: 'solo', status: 'running', ts: NOW }, NOW);
  assert.equal(line, '🔄 workflow: solo');
});

test('hides the line for a non-running run', () => {
  assert.equal(buildWorkflowStatusLine({ run_id: 'r1', status: 'completed', ts: NOW }, NOW), null);
});

test('hides the line for a stale pointer (crashed run)', () => {
  const line = buildWorkflowStatusLine({ run_id: 'r1', status: 'running', ts: NOW - STALE_MS - 1 }, NOW);
  assert.equal(line, null);
});

test('returns null for missing/garbage input', () => {
  assert.equal(buildWorkflowStatusLine(null, NOW), null);
  assert.equal(buildWorkflowStatusLine('nope', NOW), null);
});

// ── readActiveRun + CLI ───────────────────────────────────────────────────────

test('readActiveRun parses a pointer file, null on absence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-status-'));
  const p = path.join(dir, 'active-run.json');
  assert.equal(readActiveRun(p), null);
  fs.writeFileSync(p, JSON.stringify({ run_id: 'r1', status: 'running', ts: Date.now() }));
  assert.equal(readActiveRun(p).run_id, 'r1');
});

test('CLI prints the line when a fresh running pointer exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-status-cli-'));
  const p = path.join(dir, 'active-run.json');
  fs.writeFileSync(p, JSON.stringify({ run_id: 'r1', workflow_name: 'demo', status: 'running', phase: 1, num_phases: 2, agents_done: 3, agents_total: 8, ts: Date.now() }));
  const out = execFileSync('node', [path.join(__dirname, 'workflow-status.js')], {
    env: { ...process.env, MOOTER_WORKFLOW_ACTIVE: p },
    encoding: 'utf8',
  });
  assert.match(out, /🔄 workflow: demo · phase 1\/2 · 3\/8 agents/);
});

test('CLI prints nothing when there is no active run', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-status-empty-'));
  const out = execFileSync('node', [path.join(__dirname, 'workflow-status.js')], {
    env: { ...process.env, MOOTER_WORKFLOW_ACTIVE: path.join(dir, 'nope.json') },
    encoding: 'utf8',
  });
  assert.equal(out, '');
});
