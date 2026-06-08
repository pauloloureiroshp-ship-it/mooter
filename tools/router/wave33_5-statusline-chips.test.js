'use strict';
// Wave 33.5 Block A.6/A.7 — statusline chip modules (terminal-name + workflow-progress).
const { test } = require('node:test');
const assert = require('node:assert');

const { buildWorkflowProgressChip, progressDots } = require('./workflow-progress-status.js');
const { resolveLabel } = require('./terminal-name-status.js');

const NOW = 1_780_000_000_000;

test('progressDots: filled/spinner/empty + width cap', () => {
  assert.strictEqual(progressDots(4, 4, 7, 0), '●●●●'); // complete → no spinner
  assert.strictEqual(progressDots(0, 0, 7, 0), ''); // no total → empty
  const mid = progressDots(2, 4, 7, 0);
  assert.ok(mid.startsWith('●●'), mid);
  assert.ok(mid.length >= 4);
});

test('buildWorkflowProgressChip renders a running run with dots', () => {
  const chip = buildWorkflowProgressChip(
    { run_id: 'wf_abc123def', status: 'running', agents_done: 3, agents_total: 7, ts: NOW - 1000 },
    NOW,
    0,
  );
  assert.ok(chip.includes('🔄'), chip);
  assert.ok(chip.includes('wf-wf_abc12'), chip); // id sliced to 8
  assert.ok(chip.includes('3/7'), chip);
});

test('buildWorkflowProgressChip hides stale + non-running', () => {
  assert.strictEqual(buildWorkflowProgressChip({ status: 'running', ts: NOW - 120000 }, NOW, 0), '');
  assert.strictEqual(buildWorkflowProgressChip({ status: 'done', ts: NOW }, NOW, 0), '');
  assert.strictEqual(buildWorkflowProgressChip(null, NOW, 0), '');
});

test('buildWorkflowProgressChip shows tokens only when present', () => {
  const withTok = buildWorkflowProgressChip(
    { run_id: 'x', status: 'running', agents_done: 1, agents_total: 2, tokens: 4200, ts: NOW },
    NOW,
    0,
  );
  assert.ok(withTok.includes('4.2k tk'), withTok);
  const without = buildWorkflowProgressChip(
    { run_id: 'x', status: 'running', agents_done: 1, agents_total: 2, ts: NOW },
    NOW,
    0,
  );
  assert.ok(!without.includes('tk'), without);
});

test('resolveLabel honours the chain order', () => {
  assert.deepStrictEqual(resolveLabel({ env: {}, cwd: '/x', override: 'mylabel' }), { name: 'mylabel', source: 'override' });
  assert.strictEqual(resolveLabel({ env: { ZELLIJ_SESSION_NAME: 'z1' }, cwd: '/x' }).source, 'zellij');
  assert.strictEqual(resolveLabel({ env: { WEZTERM_PANE: '7' }, cwd: '/x' }).name, 'pane-7');
  assert.strictEqual(resolveLabel({ env: { TMUX_PANE_TITLE: 'tm' }, cwd: '/x' }).name, 'tm');
  // no env, non-git path → basename
  assert.strictEqual(resolveLabel({ env: {}, cwd: '/tmp/some-proj-xyz' }).name, 'some-proj-xyz');
});
