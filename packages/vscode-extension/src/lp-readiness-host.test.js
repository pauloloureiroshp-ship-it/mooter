'use strict';
// lp-readiness-host.test.js — F0.5.2: the readiness reason is TRI-STATE — no-workspace ≠ sdk-missing
// ≠ untrusted. So the UI offers the RIGHT 1-click action (open a folder / trust / install the SDK)
// instead of the actionable LIE "install the SDK" when the real problem is an empty window (the
// 40-min-lost bug). Proven against the REAL LivePreviewPanel (vm-loaded, real live-edit-cloud).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

function loadPanelClass() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const REAL = ['./live-edit-cloud.js'];
  const req = (name) => { if (name === 'vscode') return mk(); if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

test('F0.5.2: no folder open → reason "no-workspace" (never the "install SDK" lie), fresh on folder-open', () => {
  const Panel = loadPanelClass();
  const inst = Object.create(Panel.prototype);
  inst._hasWorkspace = () => false;
  const r = inst._leBridgeStatus();
  assert.strictEqual(r.available, false);
  assert.strictEqual(r.reason, 'no-workspace', 'empty window → open a folder, NOT install the SDK');
  // Not cached stale: opening a folder must light up the readiness immediately.
  inst._hasWorkspace = () => true;
  inst._workspaceTrusted = () => false;
  assert.strictEqual(inst._leBridgeStatus().reason, 'workspace-untrusted', 'once a folder exists, trust is the next honest gate');
});

test('F0.5.2: folder + trust but no SDK → reason "sdk-bridge-missing" (the real, actionable one)', () => {
  const Panel = loadPanelClass();
  const inst = Object.create(Panel.prototype);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-ready-'));
  try {
    inst._hasWorkspace = () => true;
    inst._workspaceTrusted = () => true;
    inst._wsRoot = () => root;
    inst._leBridge = null; inst._leBridgeTs = 0;
    const r = inst._leBridgeStatus();
    assert.strictEqual(r.available, false);
    assert.strictEqual(r.reason, 'sdk-bridge-missing', 'trusted folder without the SDK → install it (honest, actionable)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('F0.5.4: Open Live Preview is discoverable — a titled palette command + a keybinding (not just an anonymous icon)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const cmd = (pkg.contributes.commands || []).find(function (c) { return c.command === 'mooter.openLivePreview'; });
  assert.ok(cmd && /Live Preview/.test(cmd.title || ''), 'the command has a clear palette title');
  const kb = (pkg.contributes.keybindings || []).find(function (k) { return k.command === 'mooter.openLivePreview'; });
  assert.ok(kb && kb.key, 'a keybinding promotes Open Live Preview beyond the anonymous header icon');
});

