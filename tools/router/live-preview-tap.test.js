'use strict';
// live-preview-tap.test.js — Live Preview · MP0 ARM.
// Proves the armed tap end-to-end as a real child process: given a hook name (argv)
// + a CC-shaped payload (stdin), it appends exactly one correct event to the
// per-workspace file-bus, resolves the REAL hook-collector, and stays fail-soft —
// always exit 0, always a benign {continue:true}, never blocking the turn.

const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TAP = path.join(__dirname, 'live-preview-tap.js');

// Run the tap exactly as settings.json wires it: `node live-preview-tap.js <hook>`
// with the payload on stdin. Returns { code, out, events } where events are the
// parsed JSONL lines the tap wrote to <cwd>/_handoff/live-preview/events.jsonl.
function runTap(hookName, payload) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-tap-'));
  const body = { cwd: ws, ...payload };
  const r = spawnSync(process.execPath, [TAP, hookName], {
    input: JSON.stringify(body),
    encoding: 'utf8',
  });
  const busFile = path.join(ws, '_handoff', 'live-preview', 'events.jsonl');
  let events = [];
  if (fs.existsSync(busFile)) {
    events = fs.readFileSync(busFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  }
  fs.rmSync(ws, { recursive: true, force: true });
  return { code: r.status, out: r.stdout || '', events };
}

test('armed tap: UserPromptSubmit -> one reason event on the bus', () => {
  const { code, out, events } = runTap('UserPromptSubmit', {
    session_id: 'sess-arm-1', prompt: 'adiciona o SavingsProof ao hero',
  });
  assert.strictEqual(code, 0, 'tap exits 0');
  assert.match(out, /"continue":true/, 'emits benign passthrough');
  assert.strictEqual(events.length, 1, 'exactly one event appended');
  assert.strictEqual(events[0].kind, 'reason');
  assert.strictEqual(events[0].sid, 'sess-arm-1');
  assert.strictEqual(events[0].summary, 'adiciona o SavingsProof ao hero');
});

test('armed tap: PostToolUse Write -> one file event with the real path', () => {
  const { code, events } = runTap('PostToolUse', {
    tool_name: 'Write',
    tool_input: { file_path: '/repo/landing/app/hero.tsx' },
    session_id: 'sess-arm-2',
  });
  assert.strictEqual(code, 0);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].kind, 'file');
  assert.strictEqual(events[0].tool, 'Write');
  assert.strictEqual(events[0].path, '/repo/landing/app/hero.tsx');
});

test('armed tap: Stop -> one server event', () => {
  const { code, events } = runTap('Stop', { session_id: 'sess-arm-3', reason: 'done' });
  assert.strictEqual(code, 0);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].kind, 'server');
  assert.strictEqual(events[0].summary, 'done');
});

test('armed tap: SubagentStop -> one server event', () => {
  const { code, events } = runTap('SubagentStop', { session_id: 'sess-arm-4' });
  assert.strictEqual(code, 0);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].kind, 'server');
});

test('armed tap: PostToolUse on a non-edit tool writes nothing (collector filters)', () => {
  const { code, out, events } = runTap('PostToolUse', {
    tool_name: 'Bash', tool_input: { command: 'ls' }, session_id: 'sess-arm-5',
  });
  assert.strictEqual(code, 0, 'still exits 0');
  assert.match(out, /"continue":true/);
  assert.strictEqual(events.length, 0, 'no file event for a non-edit tool');
});

test('armed tap: garbage stdin is fail-soft (exit 0, no throw, no event)', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-tap-'));
  const r = spawnSync(process.execPath, [TAP, 'PostToolUse'], {
    input: 'not json at all {{{', encoding: 'utf8', env: { ...process.env, cwd: ws },
  });
  fs.rmSync(ws, { recursive: true, force: true });
  assert.strictEqual(r.status, 0, 'never crashes on bad input');
  assert.match(r.stdout || '', /"continue":true/);
});

test('armed tap: unknown hook name maps to nothing (no event, still exit 0)', () => {
  const { code, events } = runTap('SessionStart', { session_id: 'sess-arm-6' });
  assert.strictEqual(code, 0);
  assert.strictEqual(events.length, 0);
});
