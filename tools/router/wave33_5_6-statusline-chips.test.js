'use strict';
// Wave 33.5 A.6/A.7 + Wave 33.6 P3/P5/P6 — statusline chip modules
// (terminal-name · workflow-progress · conductor lock count).
const { test } = require('node:test');
const assert = require('node:assert');

const { buildWorkflowProgressChip, progressDots } = require('./workflow-progress-status.js');
const { resolveLabel } = require('./terminal-name-status.js');
const { buildConductorChip, isLive } = require('./conductor-status.js');

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

// Wave 33.6 P5 — $MOOTER_TERMINAL_NAME is priority #1, above the prefs override.
test('resolveLabel: MOOTER_TERMINAL_NAME wins over override and everything else', () => {
  assert.deepStrictEqual(
    resolveLabel({ env: { MOOTER_TERMINAL_NAME: 'wave-term', ZELLIJ_SESSION_NAME: 'z1' }, cwd: '/x', override: 'pref' }),
    { name: 'wave-term', source: 'env' },
  );
  // blank env var falls through to the override
  assert.strictEqual(resolveLabel({ env: { MOOTER_TERMINAL_NAME: '   ' }, cwd: '/x', override: 'pref' }).source, 'override');
  // unset env var → unchanged legacy behaviour
  assert.strictEqual(resolveLabel({ env: {}, cwd: '/x', override: 'pref' }).source, 'override');
});

// Wave 33.6 P3 — conductor lock-count chip.
test('buildConductorChip: silent at 0 live locks, plural/singular, names a lone holder', () => {
  const live = { resource: 'git-a', terminal_name: 'wave33_6', acquired_at_ms: NOW - 1000, ttl_seconds: 60 };
  const live2 = { resource: 'tag', terminal_name: 'other', acquired_at_ms: NOW - 1000, ttl_seconds: 60 };
  const unknown = { resource: 'x', terminal_name: 'unknown', acquired_at_ms: NOW - 1000, ttl_seconds: 60 };

  assert.strictEqual(buildConductorChip([], NOW), '');
  assert.strictEqual(buildConductorChip([live], NOW), '🔒 conductor: 1 lock (wave33_6)');
  assert.strictEqual(buildConductorChip([unknown], NOW), '🔒 conductor: 1 lock');
  assert.strictEqual(buildConductorChip([live, live2], NOW), '🔒 conductor: 2 locks');
});

test('buildConductorChip + isLive: TTL-stale holders are excluded', () => {
  const live = { resource: 'git-a', terminal_name: 'wave33_6', acquired_at_ms: NOW - 1000, ttl_seconds: 60 };
  const stale = { resource: 'old', terminal_name: 'dead', acquired_at_ms: NOW - 120000, ttl_seconds: 60 };
  assert.strictEqual(isLive(live, NOW), true);
  assert.strictEqual(isLive(stale, NOW), false);
  assert.strictEqual(buildConductorChip([stale], NOW), '');
  assert.ok(buildConductorChip([live, stale], NOW).startsWith('🔒 conductor: 1 lock'));
  // malformed locks never throw
  assert.strictEqual(buildConductorChip([null, {}, { acquired_at_ms: 'nope' }], NOW), '');
});
