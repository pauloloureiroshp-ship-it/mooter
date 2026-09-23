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
const fs = require('node:fs');
const os = require('node:os');
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

test('privacy (bite): the hook writes the prompt hash, never its text, to decisions.log or anywhere under HOME', (t) => {
  // /privacy (mooter.ai): «We log a SHA-256 hash of each prompt — never the text
  // itself». Until 2026-09-23 the classified event carried prompt.slice(0, 80).
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-privacy-hook-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(path.join(home, '.claude', 'tools', 'router'), { recursive: true });
  const env = Object.assign({}, process.env, { HOME: home, USERPROFILE: home });
  for (const k of ['MOOTER_PIN_MODEL', 'MOOTER_CONTEXT_BRIDGE', 'MOOTER_DECISOR_SHADOW']) delete env[k];
  const phrase = 'zanzibar-quokka-7f3e marmalade teleport ledger oboe';
  const prompt = `explain why ${phrase} keeps failing`;
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, session_id: 'privacy-hook' }), encoding: 'utf8', timeout: 15000, env,
  });
  assert.strictEqual(res.status, 0, res.stderr || res.stdout);

  const sha = require('node:crypto').createHash('sha256').update(prompt, 'utf8').digest('hex');
  const log = fs.readFileSync(path.join(home, '.claude', 'tools', 'router', 'decisions.log'), 'utf8');
  const classified = log.trim().split('\n').map((l) => JSON.parse(l))
    .filter((e) => e.event === 'classified' && e.session_id === 'privacy-hook');
  assert.strictEqual(classified.length, 1);
  assert.strictEqual(classified[0].prompt_sha256, sha);
  assert.ok(!('prompt_preview' in classified[0]), 'no prompt_preview');

  /** @param {string} dir @returns {string[]} */
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((d) => d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
  for (const file of walk(home)) {
    const text = fs.readFileSync(file, 'utf8');
    for (let i = 0; i + 6 <= phrase.length; i++) {
      const chunk = phrase.slice(i, i + 6);
      assert.ok(!text.includes(chunk), `${path.relative(home, file)} leaks "${chunk}"`);
    }
  }
});

test('P0-B — classified mede e identifica os caminhos spawn e cache usados pelo piloto', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-p0b-hook-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const routerHome = path.join(home, '.claude', 'tools', 'router');
  fs.mkdirSync(routerHome, { recursive: true });
  const env = Object.assign({}, process.env, { HOME: home, USERPROFILE: home });
  delete env.MOOTER_PIN_MODEL;
  const prompt = 'resume esta frase curta para provar a telemetria do piloto';
  const run = (sessionId) => spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ prompt, session_id: sessionId }),
    encoding: 'utf8',
    timeout: 15000,
    env,
  });

  const first = run('p0b-hook-spawn');
  assert.strictEqual(first.status, 0, first.stderr || first.stdout);
  const second = run('p0b-hook-cache');
  assert.strictEqual(second.status, 0, second.stderr || second.stdout);

  const events = fs.readFileSync(path.join(routerHome, 'decisions.log'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line))
    .filter((event) => event.event === 'classified' && /^p0b-hook-(spawn|cache)$/.test(event.session_id));
  assert.strictEqual(events.length, 2, JSON.stringify(events));
  assert.strictEqual(events[0].classify_path, 'spawn');
  assert.strictEqual(events[1].classify_path, 'cache');
  for (const event of events) {
    assert.ok(typeof event.classify_ms === 'number' && event.classify_ms > 0,
      'classify_ms tem de ser medido e positivo: ' + JSON.stringify(event));
    assert.strictEqual(event.classify_porque, null,
      'uma medição presente não pode trazer uma razão de ausência');
  }
});
