'use strict';

// inject_context.js is a hook *script* (executes on load, reads the hook
// payload from stdin, prints the <router-hint> to stdout). It can't be
// required for unit testing, so these tests drive it as a subprocess — feeding
// a JSON payload on stdin and asserting on the emitted hint. Focus: the
// MOOTER_PIN_MODEL Anthropic-pin path added in Sessão A T-03.
//
// NOTE: assertions target the pin's own fields (recommended_model,
// suggested_subagent, USER_OVERRIDE marker) rather than the top-line `tier:`.
// The active-mode block (beast/zen) downstream can floor the displayed tier to
// T3 regardless of the pin, so a tier assertion would be environment-sensitive.
// The pin's model/subagent are mode-independent and are the real contract.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, 'inject_context.js');

/** Run inject_context.js with a prompt + optional MOOTER_PIN_MODEL; return combined output. */
function runHook(prompt, pinModel) {
  const env = Object.assign({}, process.env);
  delete env.MOOTER_PIN_MODEL;
  if (pinModel !== undefined) env.MOOTER_PIN_MODEL = pinModel;
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, session_id: 'test-inject-pin' }),
    encoding: 'utf8',
    timeout: 15000,
    env,
  });
  return (res.stdout || '') + (res.stderr || '');
}

test('MOOTER_PIN_MODEL=claude-opus-4-6 → honored pin to Opus (model-architect)', () => {
  const out = runHook('explain what a javascript closure is in two sentences', 'claude-opus-4-6');
  assert.match(out, /USER_OVERRIDE: honored — pinned to claude-opus-4-6/);
  assert.match(out, /override_kind: mooter-pin-skill/);
  assert.match(out, /recommended_model: claude-opus-4-6/);
  assert.match(out, /suggested_subagent: model-architect/);
});

test('MOOTER_PIN_MODEL=claude-haiku-4-5 → honored pin to Haiku (cheap-triage)', () => {
  const out = runHook('explain what a javascript closure is in two sentences', 'claude-haiku-4-5');
  assert.match(out, /USER_OVERRIDE: honored — pinned to claude-haiku-4-5/);
  assert.match(out, /recommended_model: claude-haiku-4-5/);
  assert.match(out, /suggested_subagent: cheap-triage/);
});

test('no MOOTER_PIN_MODEL → no mooter pin in hint (baseline)', () => {
  const out = runHook('review the architecture and deploy to production');
  assert.ok(!/override_kind: mooter-pin-skill/.test(out), 'baseline must not carry a mooter pin');
  assert.ok(!/honored — pinned to claude-/.test(out), 'baseline must not show a honored pin');
});

test('MOOTER_PIN_MODEL=garbage → fail-safe, no pin', () => {
  const out = runHook('explain what a javascript closure is in two sentences', 'totally-not-a-model');
  assert.ok(!/override_kind: mooter-pin-skill/.test(out), 'invalid pin must be ignored');
});

test('pin-down on HIGH_RISK prompt is REFUSED (haiku on deploy/push)', () => {
  const out = runHook('deploy to production and push the release now', 'claude-haiku-4-5');
  assert.match(out, /USER_OVERRIDE: REFUSED/);
  assert.ok(!/honored — pinned to claude-haiku-4-5/.test(out), 'high-risk downgrade must not be honored');
});
