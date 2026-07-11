'use strict';
// lp-feed-persist-host.test.js — F0.2: the per-item history feed is PER NODE and PERSISTS across a
// panel close/reopen (workspaceState, DISPLAY-only — never the undo bytes). Prior-SESSION items come
// back labelled history + carry NO revert (a stale-byte revert across a reopen is exactly the write we
// refuse); a live edit this session still reverts. Proven against the REAL LivePreviewPanel with a fake
// memento (the same shape vscode's context.workspaceState exposes).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPanelClass() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const REAL = ['./live-edit-undo.js'];
  const req = (name) => { if (name === 'vscode') return mk(); if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch { /* tolerate top-level activate() errors */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const Panel = loadPanelClass();

// A fake vscode Memento (workspaceState): the store survives across "panels" in the test.
function mkStore() {
  const data = {};
  return { get: (k, d) => (k in data ? data[k] : d), update: (k, v) => { data[k] = v; return Promise.resolve(); }, _data: data };
}
// A panel wired to a shared store (no ctor — Object.create — but with _store set, mirroring what the
// real ctor does from context.workspaceState).
function mkPanel(store) {
  const inst = Object.create(Panel.prototype);
  inst.panel = { webview: { postMessage: () => {} } };
  inst.token = 'tok';
  inst._store = store;
  inst._post = () => {};
  return inst;
}

test('F0.2: a live edit records a per-node feed item with nodeKey and a working revert', () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable');
  const store = mkStore();
  const p = mkPanel(store);
  p._servedRoot = '/ws/frugal';
  // simulate a $0 splice write recording its undo entry with the node anchor
  p._pushUndo('/ws/frugal/landing/app/page.tsx', 'before-bytes', 'after-bytes', 'texto · $0', 'landing/app/page.tsx', { line: 5, col: 3, tag: 'h1' });
  const view = p._feedView();
  assert.strictEqual(view.items.length, 1, 'one live item');
  const it = view.items[0];
  assert.ok(it.nodeKey && it.nodeKey.file === 'landing/app/page.tsx' && it.nodeKey.line === 5 && it.nodeKey.tag === 'h1', 'nodeKey travels for per-node history');
  assert.strictEqual(it.persisted, false, 'a fresh live item is not history');
  assert.strictEqual(it.status, 'live', 'and it is revertable (live)');
  // and it was persisted to the store (display-only — no undo bytes)
  const saved = store.get('lpFeedHistoryV1', []);
  assert.strictEqual(saved.length, 1, 'persisted to workspaceState');
  assert.ok(!('entry' in saved[0]), 'the undo entry/bytes are NEVER persisted');
  assert.ok(saved[0].nodeKey && saved[0].nodeKey.tag === 'h1', 'nodeKey persisted so per-node history survives a reopen');
});

test('F0.2: close→reopen — the record comes back as history (labelled, NO revert); a new live edit still reverts', () => {
  const store = mkStore();
  // ── session 1: two edits on the same node, panel then closed (store persists) ──
  const p1 = mkPanel(store);
  p1._servedRoot = '/ws/frugal';
  p1._pushUndo('/ws/frugal/landing/app/page.tsx', 'b1', 'a1', 'texto · $0', 'landing/app/page.tsx', { line: 5, col: 3, tag: 'h1' });
  p1._pushUndo('/ws/frugal/landing/app/page.tsx', 'a1', 'a2', 'classe · $0', 'landing/app/page.tsx', { line: 5, col: 3, tag: 'h1' });
  assert.strictEqual(p1._feedView().items.filter((i) => !i.persisted).length, 2, 'two live items this session');

  // ── session 2: a FRESH panel on the SAME workspace store (reopen) ──
  const p2 = mkPanel(store);
  const v2 = p2._feedView();
  const hist = v2.items.filter((i) => i.persisted);
  assert.strictEqual(hist.length, 2, 'both prior-session edits are restored as history');
  assert.ok(hist.every((i) => i.persisted === true), 'restored items are marked persisted (history)');
  assert.ok(hist.every((i) => i.nodeKey && i.nodeKey.tag === 'h1'), 'per-node identity survived the reopen (click-the-node history works)');
  // (b) a history item offers NO revert: its id is not in the LIVE feed, so a revert is honestly refused.
  const anyHistId = hist[0].id;
  assert.ok(!(p2._feed || []).some((e) => e.id === anyHistId), 'a persisted item is not in the live feed → not revertable');

  // (c) a NEW live edit this session is revertable; history stays read-only.
  p2._servedRoot = '/ws/frugal';
  p2._pushUndo('/ws/frugal/landing/app/page.tsx', 'a2', 'a3', 'texto · $0', 'landing/app/page.tsx', { line: 9, col: 1, tag: 'p' });
  const v3 = p2._feedView();
  const live = v3.items.filter((i) => !i.persisted);
  assert.strictEqual(live.length, 1, 'the new edit is a LIVE (revertable) item');
  assert.strictEqual(live[0].nodeKey.tag, 'p', 'its own node');
  assert.strictEqual(v3.items.filter((i) => i.persisted).length, 2, 'history is unchanged (still 2, read-only)');
});

test('F0.2: no store (bare harness) → the feed stays in-memory, contract unchanged (no throw)', () => {
  const p = Object.create(Panel.prototype);
  p.panel = { webview: { postMessage: () => {} } };
  p.token = 'tok';
  p._post = () => {};
  p._servedRoot = '/ws/frugal';
  p._pushUndo('/ws/frugal/x.tsx', 'b', 'a', 'texto · $0', 'x.tsx', { line: 1, col: 1, tag: 'h1' });
  const view = p._feedView();
  assert.strictEqual(view.items.length, 1, 'in-memory feed still works without a persistence store');
  assert.strictEqual(view.items[0].persisted, false);
});
