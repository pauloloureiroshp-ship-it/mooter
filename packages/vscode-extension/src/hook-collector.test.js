'use strict';
// hook-collector.test.js — Live Preview · MP0 Foundation.
// Proves the file-bus contract: mapEvent covers every kind + returns null on junk (never
// throws), and appendEvent is fail-soft (missing dir, corrupted file, partial payload) with
// a working size cap. Honesty: fields absent from the payload stay null.

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hc = require('./hook-collector.js');

const SCHEMA_KEYS = ['ts', 'sid', 'kind', 'tool', 'path', 'summary', 'tier', 'model', 'cost', 'local'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function assertShape(e) {
  assert.ok(e && typeof e === 'object', 'event is an object');
  assert.deepStrictEqual(Object.keys(e).sort(), SCHEMA_KEYS.slice().sort(), 'exactly the 10 schema keys');
  assert.match(e.ts, ISO_RE, 'ts is ISO8601');
}

// ── mapEvent: one assertion per kind ────────────────────────────────────────────────

test('UserPromptSubmit -> reason', () => {
  const e = hc.mapEvent('UserPromptSubmit', { session_id: 'sess-1', prompt: 'muda a cor do botão' });
  assertShape(e);
  assert.strictEqual(e.kind, 'reason');
  assert.strictEqual(e.sid, 'sess-1');
  assert.strictEqual(e.summary, 'muda a cor do botão');
  // nothing about tier/model/cost/local in the payload → all null (no fabrication)
  assert.strictEqual(e.tier, null);
  assert.strictEqual(e.model, null);
  assert.strictEqual(e.cost, null);
  assert.strictEqual(e.local, null);
});

test('PostToolUse Write -> file (path from tool_input)', () => {
  const e = hc.mapEvent('PostToolUse', {
    tool_name: 'Write', tool_input: { file_path: '/repo/src/x.ts' }, session_id: 'sess-2',
  });
  assertShape(e);
  assert.strictEqual(e.kind, 'file');
  assert.strictEqual(e.tool, 'Write');
  assert.strictEqual(e.path, '/repo/src/x.ts');
});

test('PreToolUse Edit -> file', () => {
  const e = hc.mapEvent('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: '/repo/a.js' } });
  assertShape(e);
  assert.strictEqual(e.kind, 'file');
  assert.strictEqual(e.tool, 'Edit');
  assert.strictEqual(e.path, '/repo/a.js');
});

test('PostToolUse Bash -> null (not an edit tool)', () => {
  assert.strictEqual(hc.mapEvent('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
});

test('FileChanged -> file', () => {
  const e = hc.mapEvent('FileChanged', { path: '/repo/README.md' });
  assertShape(e);
  assert.strictEqual(e.kind, 'file');
  assert.strictEqual(e.path, '/repo/README.md');
});

test('TaskCreated / TaskCompleted -> task', () => {
  const a = hc.mapEvent('TaskCreated', { subagent_type: 'local-summarizer', description: 'resume x' });
  assertShape(a);
  assert.strictEqual(a.kind, 'task');
  assert.strictEqual(a.tool, 'local-summarizer');
  assert.strictEqual(a.summary, 'resume x');

  const b = hc.mapEvent('TaskCompleted', {});
  assertShape(b);
  assert.strictEqual(b.kind, 'task');
  assert.strictEqual(b.summary, 'completed'); // fallback label, not fabricated data
});

test('Stop -> server', () => {
  const e = hc.mapEvent('Stop', { session_id: 'sess-3' });
  assertShape(e);
  assert.strictEqual(e.kind, 'server');
  assert.strictEqual(e.summary, 'stop');
});

test('honest passthrough: tier/model/cost/local only when present in payload', () => {
  const e = hc.mapEvent('UserPromptSubmit', {
    prompt: 'x', tier: 't3', model: 'claude-opus-4-8', cost: 0.12, local: false,
  });
  assert.strictEqual(e.tier, 'T3'); // normalized upper-case, validated
  assert.strictEqual(e.model, 'claude-opus-4-8');
  assert.strictEqual(e.cost, 0.12);
  assert.strictEqual(e.local, false); // real false survives (not coerced to null)
});

test('garbage in -> null out, never throws', () => {
  assert.strictEqual(hc.mapEvent('Nonsense', {}), null);
  assert.strictEqual(hc.mapEvent(null, null), null);
  assert.strictEqual(hc.mapEvent(undefined, undefined), null);
  assert.strictEqual(hc.mapEvent('PostToolUse', null), null); // no tool → null
  // non-object payload must not throw; UserPromptSubmit still yields a shaped event
  const e = hc.mapEvent('UserPromptSubmit', 12345);
  assertShape(e);
  assert.strictEqual(e.summary, null);
  // invalid tier dropped to null (not fabricated)
  assert.strictEqual(hc.mapEvent('Stop', { tier: 'T9' }).tier, null);
});

// ── appendEvent: fail-soft file-bus ─────────────────────────────────────────────────

let DIR;
before(() => { DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-hookbus-')); });
after(() => { try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {} });

test('appendEvent creates a missing dir and round-trips one line', () => {
  const ws = path.join(DIR, 'fresh-workspace'); // does not exist yet
  const evt = hc.mapEvent('UserPromptSubmit', { session_id: 's', prompt: 'hello' });
  assert.strictEqual(hc.appendEvent(ws, evt), true);

  const file = hc.eventsPath(ws);
  assert.ok(fs.existsSync(file), 'events.jsonl was created');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(JSON.parse(lines[0]), evt); // exact round-trip
});

test('appendEvent returns false for null/garbage evt (no write)', () => {
  const ws = path.join(DIR, 'null-evt');
  assert.strictEqual(hc.appendEvent(ws, null), false);
  assert.strictEqual(hc.appendEvent(ws, 42), false);
  assert.strictEqual(hc.appendEvent(ws, 'nope'), false);
  assert.ok(!fs.existsSync(hc.eventsPath(ws)), 'nothing was written');
});

test('appendEvent tolerates a pre-corrupted file and a partial payload', () => {
  const ws = path.join(DIR, 'corrupted');
  const file = hc.eventsPath(ws);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '}{ this is not json at all\n\x00\x01garbage');

  // a partial event (only some schema fields) must still append
  const partial = { ts: new Date().toISOString(), kind: 'file', path: '/x', sid: null };
  assert.strictEqual(hc.appendEvent(ws, partial), true);

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  // last line is our valid JSON; the earlier garbage is left untouched (append-only)
  assert.deepStrictEqual(JSON.parse(lines[lines.length - 1]), partial);
});

test('size cap: bus is trimmed to ~EVENTS_CAP lines', () => {
  const ws = path.join(DIR, 'capped');
  const N = hc.EVENTS_CAP + 50;
  for (let i = 0; i < N; i++) {
    const evt = hc.mapEvent('UserPromptSubmit', {
      session_id: 'sess-cap',
      prompt: 'event number ' + i + ' — padding to a realistic line size for the cap gate',
    });
    hc.appendEvent(ws, evt);
  }
  const lines = fs.readFileSync(hc.eventsPath(ws), 'utf8').split('\n').filter(Boolean);
  assert.ok(lines.length <= hc.EVENTS_CAP, 'never exceeds the cap: ' + lines.length);
  assert.strictEqual(lines.length, hc.EVENTS_CAP, 'trimmed to exactly the cap');
  // the SURVIVORS are the most recent ones (oldest dropped)
  const last = JSON.parse(lines[lines.length - 1]);
  assert.match(last.summary, /event number 2049/);
});
