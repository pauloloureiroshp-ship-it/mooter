'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const HOOK = path.join(__dirname, 'SubagentStart-moo-route.js');

function run(payload) {
  const logPath = path.join(os.tmpdir(), `f3hook-${process.pid}-${Math.round(performance.now())}.log`);
  let stdout = '';
  try {
    stdout = execFileSync('node', [HOOK], {
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      env: { ...process.env, MOOTER_DECISIONS_LOG: logPath },
      encoding: 'utf8',
    });
  } catch (e) { stdout = e.stdout ? e.stdout.toString() : ''; }
  let log = '';
  try { log = fs.readFileSync(logPath, 'utf8'); fs.unlinkSync(logPath); } catch { /* none */ }
  let json = null; try { json = JSON.parse(stdout); } catch { /* none */ }
  return { stdout, json, log };
}

test('leaf subagent → additionalContext biases to local + logs decision', () => {
  const r = run({ subagent: { description: 'run the tests and tail the logs', prompt: 'npm test' } });
  assert.match(r.json.hookSpecificOutput.additionalContext, /local/);
  assert.match(r.log, /"event":"subagent_routed"/);
  assert.match(r.log, /"target":"local"/);
});

test('synthesis subagent → biases to cloud', () => {
  const r = run({ subagent: { description: 'synthesize the findings and decide' } });
  assert.match(r.json.hookSpecificOutput.additionalContext, /cloud/);
});

test('no role/task → no-op (no output, no crash)', () => {
  const r = run({ something: 'else' });
  assert.strictEqual(r.json, null);
});

test('unparseable stdin → no-op', () => {
  const r = run('not json');
  assert.strictEqual(r.json, null);
});

test('null payload → fail-open no-op (no crash, no output)', () => {
  const r = run('null');
  assert.strictEqual(r.json, null);
});
