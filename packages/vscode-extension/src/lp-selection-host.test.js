'use strict';
// lp-selection-host.test.js — F3 (W1): the host-side SelectionStore latches the pinned selection,
// and the fail-closed gate refuses every LLM path when nothing is pinned this session (closing the
// ANCHORLESS-run case — NOT the dynamic-text case, which needs the agent-runner wiring). Proven
// against the REAL LivePreviewPanel (vm-loaded extension.js), mirroring lp-task-host.test.js.
//
// The gate is shaped exactly like _treeGateBlocked: default-DENY in production (the ctor sets
// _selection=null → BLOCKED until a pin arrives) but UNGATED for a bare Object.create harness
// (_selection === undefined) so the pre-existing lp-task/lp-prompt/lp-edit host contracts run
// unchanged — this file proves BOTH halves.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

function loadPanelClass(stubs) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const REAL = ['./live-edit-ast.js'];
  const req = (name) => {
    if (name === 'vscode') return mk();
    if (name === './live-edit-task.js' && stubs && stubs.task) return stubs.task;
    if (REAL.indexOf(name) !== -1) return realReq(name);
    if (name.charAt(0) === '.') return mk();
    return realReq(name);
  };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const SRC = [
  'export default function P() {',
  '  return (',
  '    <section>',
  '      <h1 className="title">Old headline</h1>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const TARGET = { file: 'landing/page.tsx', line: 4, col: 7, tag: 'h1' };

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-sel-host-'));
  fs.mkdirSync(path.join(root, 'landing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'landing', 'page.tsx'), SRC, 'utf8');
  return root;
}

function mkInstance(Panel, root, trusted) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => root;
  inst._workspaceTrusted = () => trusted;
  return { inst, posts };
}

// ── the gate semantics (pure) ─────────────────────────────────────────────────────────────────
test('F3 _selectionMissing: undefined (bare harness) is UNGATED; null (production default) is GATED', () => {
  const Panel = loadPanelClass();
  const inst = Object.create(Panel.prototype);
  // A bare Object.create instance never ran the ctor → _selection is undefined → NOT gated, so the
  // pre-existing host contracts keep running (this is why the whole suite stays green).
  assert.strictEqual(inst._selectionMissing(), false, 'undefined _selection → ungated (harness parity)');
  // Production: the ctor sets _selection=null → default-DENY until a pin arrives.
  inst._selection = null;
  assert.strictEqual(inst._selectionMissing(), true, 'null _selection → gated (no pin → refuse)');
});

test('F3 _setSelection: mirrors + bounds the pin; an empty/absent file clears the store', () => {
  const Panel = loadPanelClass();
  const inst = Object.create(Panel.prototype);
  inst._setSelection({ file: 'landing/app/page.tsx', line: 5, col: 3, tag: 'h1', selText: '  Old   headline  ', breadcrumb: 'P › section › h1' });
  assert.strictEqual(inst._selection.file, 'landing/app/page.tsx');
  assert.strictEqual(inst._selection.line, 5);
  assert.strictEqual(inst._selection.tag, 'h1');
  assert.strictEqual(inst._selection.selText, 'Old headline', 'selText is whitespace-collapsed + trimmed');
  assert.strictEqual(inst._selectionMissing(), false, 'a real pin → NOT gated');
  const journey = inst._journeyView();
  assert.ok(journey && /^j_[a-f0-9]{20}$/.test(journey.id), 'the exact pin opens one host-owned journey');
  assert.strictEqual(journey.node.file, 'landing/app/page.tsx');
  assert.strictEqual(journey.state, 'selected');
  // caps: a very long tag/selText is bounded, never unbounded.
  inst._setSelection({ file: 'x.tsx', tag: 'a'.repeat(200), selText: 'b'.repeat(500) });
  assert.ok(inst._selection.tag.length <= 60, 'tag capped');
  assert.ok(inst._selection.selText.length <= 200, 'selText capped');
  // empty file clears → back to fail-closed.
  inst._setSelection({ file: '' });
  assert.strictEqual(inst._selection, null, 'empty file clears the store');
  assert.strictEqual(inst._selectionMissing(), true, 'cleared store → gated again');
});

test('SelectionJourney: persists a bounded/redacted thread and resumes only the exact node identity', () => {
  const Panel = loadPanelClass();
  const db = new Map();
  const store = { get: (k, d) => db.has(k) ? db.get(k) : d, update: (k, v) => { db.set(k, v); return Promise.resolve(); } };
  const make = () => {
    const inst = Object.create(Panel.prototype);
    inst._store = store; inst._servedRoot = 'C:/repo/landing'; inst._stageOrigin = 'http://localhost:7819'; inst._readyEpoch = 7;
    inst._treeGateBlocked = () => false;
    inst.panel = { webview: { postMessage() {} } }; inst.token = 'tok';
    return inst;
  };
  const a = make();
  a._setSelection({ file: 'app/page.tsx', line: 56, col: 15, tag: 'p', selText: 'Hero' });
  a._journeyAppend('user', 'usa sk-abcdefghijklmnopqrstuvwxyz e melhora', { status: 'sent' });
  a._journeyAppend('assistant', '**Proposta** pronta', { model: 'sonnet', status: 'awaiting' });
  a._journeySetState('awaiting', 'aguarda OK');
  const first = a._journeyView();
  assert.strictEqual(first.turns.length, 2);
  assert.ok(first.turns[0].text.includes('[redigido]') && !first.turns[0].text.includes('sk-abcdefghijklmnopqrstuvwxyz'), 'common credential shape is redacted before persistence');
  assert.strictEqual(first.state, 'awaiting');
  assert.ok(Array.isArray(db.get('lpSelectionJourneysV1')), 'thread persisted in workspaceState');

  const b = make();
  b._setSelection({ file: 'app/page.tsx', line: 56, col: 15, tag: 'p', selText: 'Hero' });
  const resumed = b._journeyView();
  assert.strictEqual(resumed.id, first.id, 'same tree/origin/epoch/source node resumes the same thread');
  assert.strictEqual(resumed.turns.length, 2);
  assert.strictEqual(resumed.state, 'stale', 'pending approval is never resurrected after its RAM snapshots vanished');

  b._setSelection({ file: 'app/page.tsx', line: 57, col: 15, tag: 'p', selText: 'Other' });
  assert.notStrictEqual(b._journeyView().id, first.id, 'a different source node gets a different thread');
});

// ── the gate is WIRED into every LLM path (fail-closed) ─────────────────────────────────────────
test('F3 FAIL-CLOSED: _taskRun with a null store refuses "no-selection" and NEVER touches the agent', async () => {
  const calls = [];
  const task = { runAnchoredTask: async (input, opts) => { calls.push({ input, opts }); return { ok: true, kind: 'answer', text: 'x' }; }, gitDiffFile: () => ({ ok: true, lines: [] }) };
  const Panel = loadPanelClass({ task });
  const root = setup();
  try {
    const { inst, posts } = mkInstance(Panel, root, true); // trusted → passes the trust gate
    inst._selection = null; // production: nothing pinned
    await inst._taskRun(Object.assign({ instruction: 'resume este texto', intent: 'ask' }, TARGET));
    assert.strictEqual(calls.length, 0, 'the agent bridge is never touched with no pinned selection');
    const r = posts.find((p) => p && p.ok === false);
    assert.ok(r && r.reason === 'no-selection', 'honest fail-closed: the agent asks instead of guessing');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('F3 FAIL-CLOSED: _promptEdit with a null store refuses "no-selection" and writes NOTHING', async () => {
  const Panel = loadPanelClass();
  const root = setup();
  try {
    const { inst, posts } = mkInstance(Panel, root, true);
    inst._selection = null;
    await inst._promptEdit(Object.assign({ prompt: 'encurta', tier: 'local' }, TARGET));
    const r = posts.find((p) => p && p.ok === false);
    assert.ok(r && r.reason === 'no-selection', 'the local $0 rewrite refuses without a pinned selection');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('F3 PARITY: a bare-harness _taskRun (undefined store) still reaches the agent — the gate does not break the contract', async () => {
  const calls = [];
  const task = { runAnchoredTask: async (input, opts) => { calls.push({ input, opts }); return { ok: true, kind: 'answer', text: 'ok' }; }, gitDiffFile: () => ({ ok: true, lines: [] }) };
  const Panel = loadPanelClass({ task });
  const root = setup();
  try {
    const { inst } = mkInstance(Panel, root, true); // _selection stays UNDEFINED (never set)
    await inst._taskRun(Object.assign({ instruction: 'valida os números', intent: 'ask' }, TARGET));
    assert.strictEqual(calls.length, 1, 'undefined store → ungated → the pre-existing anchored-task contract runs unchanged');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ── F3 (W1) Option A: the RENDERED pinned text reaches the agent — kills the confessed dynamic-<p>
//    "não vejo texto selecionado" by delivering what the user SEES, not just the JSX. ─────────────
test('F3 RENDERED-TEXT: _taskRun forwards the STORE selText into the agent (not the message)', async () => {
  const calls = [];
  const task = { runAnchoredTask: async (input) => { calls.push(input); return { ok: true, kind: 'answer', text: 'ok' }; }, gitDiffFile: () => ({ ok: true, lines: [] }) };
  const Panel = loadPanelClass({ task });
  const root = setup();
  try {
    const { inst } = mkInstance(Panel, root, true);
    // The pin (with its rendered text) lives ONLY in the store; the message below carries NO selText.
    inst._setSelection({ file: 'landing/page.tsx', line: 4, col: 7, tag: 'h1', selText: 'Old headline' });
    await inst._taskRun(Object.assign({ instruction: 'resume este texto', intent: 'ask' }, TARGET));
    assert.strictEqual(calls.length, 1, 'the agent ran (a pin is present, gate passes)');
    assert.strictEqual(calls[0].selText, 'Old headline', 'the RENDERED text reaches the agent — sourced from the store, since the message never carried it');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
