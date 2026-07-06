'use strict';
// live-edit-undo.test.js — LP-4 §4 contract: $0 undo by inverse byte-splice. Pure layer
// (computeSplice/applyUndo) + the REAL host flow (vm-loaded LivePreviewPanel writing to a real
// temp workspace): write → undo restores the file BYTE-IDENTICAL; a foreign write after ours →
// honest 'undo-stale' refusal and NOTHING written; the stack is LIFO across mixed write kinds.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const LEU = require('./live-edit-undo.js');

// ── pure layer ──────────────────────────────────────────────────────────────────────────────
test('computeSplice finds the exact contiguous window (replace / insert / delete / no-op)', () => {
  assert.deepStrictEqual(LEU.computeSplice('abcdef', 'abXYef'), { start: 2, prev: 'cd', afterLen: 2 });
  assert.deepStrictEqual(LEU.computeSplice('abef', 'abXYef'), { start: 2, prev: '', afterLen: 2 });
  assert.deepStrictEqual(LEU.computeSplice('abXYef', 'abef'), { start: 2, prev: 'XY', afterLen: 0 });
  assert.strictEqual(LEU.computeSplice('same', 'same'), null);
});

test('applyUndo round-trips any single-splice write and is sha-guarded', () => {
  const before = 'linha1\nlinha2 🐮\nlinha3\r\nlinha4';
  const after = 'linha1\nlinha2 🐮 editada\nlinha3\r\nlinha4';
  const e = LEU.makeEntry('f.tsx', before, after);
  const r = LEU.applyUndo(e, after);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, before, 'byte-identical restore (emoji + CRLF intact)');
  // The guard: any OTHER content (even one byte off) refuses instead of blind-reverting.
  const foreign = after + ' ';
  assert.deepStrictEqual(LEU.applyUndo(e, foreign), { ok: false, reason: 'undo-stale' });
  assert.deepStrictEqual(LEU.applyUndo(null, after), { ok: false, reason: 'bad-entry' });
});

// ── host flow (real panel, real temp workspace) ─────────────────────────────────────────────
function loadPanelClass() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const REAL = ['./live-edit-ast.js', './live-edit-undo.js'];
  const req = (name) => { if (name === 'vscode') return mk(); if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const SRC = [
  'export default function P() {',
  '  return (',
  '    <section>',
  '      <img src="/a.png" alt="a" />',
  '      <h1>Old headline</h1>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-undo-'));
  fs.writeFileSync(path.join(root, 'page.tsx'), SRC, 'utf8');
  return root;
}

function mkInstance(Panel, root) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => root;
  return { inst, posts };
}

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const Panel = loadPanelClass();

test('edit → undo restores the file byte-identical and reports undone (+ live undo depth)', async () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable');
  const root = setup();
  const file = path.join(root, 'page.tsx');
  const { inst, posts } = mkInstance(Panel, root);
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 5, tag: 'h1', edit: { kind: 'text', value: 'New headline' }, h: sha(SRC) });
  assert.ok(fs.readFileSync(file, 'utf8').includes('New headline'), 'write landed');
  const applied = posts.find((p) => p.type === 'lp-edit-result' && p.reason === 'applied');
  assert.strictEqual(applied.undo, 1, 'result carries the live undo depth');
  await inst._undoLast();
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'BYTE-IDENTICAL restore');
  const undone = posts.find((p) => p.type === 'lp-edit-result' && p.reason === 'undone');
  assert.ok(undone && undone.ok === true);
  assert.strictEqual(undone.undo, 0, 'stack emptied');
});

test('delete → undo brings the deleted node back exactly', async () => {
  const root = setup();
  const file = path.join(root, 'page.tsx');
  const { inst } = mkInstance(Panel, root);
  await inst._deleteNode({ preview: false, file: 'page.tsx', line: 4, tag: 'img', h: sha(SRC) });
  assert.ok(!fs.readFileSync(file, 'utf8').includes('<img'), 'delete landed');
  await inst._undoLast();
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'deleted line restored byte-identical');
});

test('fenced model apply → undo restores; stack is LIFO across mixed writes', async () => {
  const root = setup();
  const file = path.join(root, 'page.tsx');
  const { inst } = mkInstance(Panel, root);
  // write 1: model replacement of the img node
  await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'img', replacement: '<img src="/a.png" alt="a" className="rounded" />', h: sha(SRC) });
  const afterModel = fs.readFileSync(file, 'utf8');
  assert.ok(afterModel.includes('rounded'), 'model write landed');
  // write 2: text edit of the h1
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 5, tag: 'h1', edit: { kind: 'text', value: 'Novo' }, h: sha(afterModel) });
  assert.ok(fs.readFileSync(file, 'utf8').includes('Novo'));
  // undo #1 → back to afterModel; undo #2 → back to SRC
  await inst._undoLast();
  assert.strictEqual(fs.readFileSync(file, 'utf8'), afterModel, 'LIFO: last write undone first');
  await inst._undoLast();
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'both writes unwound to the original');
});

test('foreign write after ours → undo REFUSES honestly (undo-stale), nothing written, entry kept', async () => {
  const root = setup();
  const file = path.join(root, 'page.tsx');
  const { inst, posts } = mkInstance(Panel, root);
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 5, tag: 'h1', edit: { kind: 'text', value: 'New headline' }, h: sha(SRC) });
  // Someone else (HMR / an agent / the editor) writes the file after our edit.
  const foreign = fs.readFileSync(file, 'utf8') + '\n// foreign write\n';
  fs.writeFileSync(file, foreign, 'utf8');
  await inst._undoLast();
  assert.strictEqual(fs.readFileSync(file, 'utf8'), foreign, 'NOTHING was written over the foreign content');
  const r = posts.find((p) => p.type === 'lp-edit-result' && p.reason === 'undo-stale');
  assert.ok(r && r.ok === false, 'honest refusal');
  assert.strictEqual(r.undo, 1, 'entry kept — the refusal is visible, not a silent drop');
});

test('empty stack → nothing-to-undo (honest, no fabricated success)', async () => {
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._undoLast();
  const r = posts.find((p) => p.type === 'lp-edit-result');
  assert.ok(r && r.ok === false && r.reason === 'nothing-to-undo');
});
