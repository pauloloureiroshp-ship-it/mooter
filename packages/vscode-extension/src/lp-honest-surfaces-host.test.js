'use strict';
// lp-honest-surfaces-host.test.js — C1 honest surfaces (coherence audit):
//   COH-03 — "Abrir a pasta" opens a REAL folder picker in THIS window, not the recents list.
//   COH-04 — the readiness tree (4th) light is ALWAYS rendered (never silently gone) and the 🎯 selector
//            is disabled with cause+action whenever the preview identity is not CONFIRMED.
//   COH-05 — multi-root resolves the ACTIVE project (active editor → owning folder, or the explicit
//            pick), NEVER a blind workspaceFolders[0]; the selector only accepts a real member.
// Proven against the REAL LivePreviewPanel (vm-loaded) with a configurable vscode stub (V).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT_PATH = path.join(__dirname, 'extension.js');
const EXT_SRC = fs.readFileSync(EXT_PATH, 'utf8');

// Configurable vscode surface for the tests below.
const V = { folders: null, activeUri: null, cmds: [] };
function folderOf(uri) { // getWorkspaceFolder: the folder whose fsPath is a prefix of the uri's fsPath
  if (!uri || !V.folders) return undefined;
  const p = uri.fsPath || '';
  let best = null;
  for (let i = 0; i < V.folders.length; i++) { const f = V.folders[i]; if (p === f.uri.fsPath || p.indexOf(f.uri.fsPath + '/') === 0 || p.indexOf(f.uri.fsPath + '\\') === 0) { if (!best || f.uri.fsPath.length > best.uri.fsPath.length) best = f; } }
  return best || undefined;
}

function loadPanelClass() {
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = new Proxy(function () { return mk(); }, {
    get(t, k) {
      if (k === 'workspace') return new Proxy({}, { get(_t, _k) {
        if (_k === 'workspaceFolders') return V.folders;
        if (_k === 'getWorkspaceFolder') return (uri) => folderOf(uri);
        return mk();
      } });
      if (k === 'window') return new Proxy({}, { get(_t, _k) {
        if (_k === 'activeTextEditor') return V.activeUri ? { document: { uri: V.activeUri } } : undefined;
        return mk();
      } });
      if (k === 'commands') return { executeCommand: (cmd) => { V.cmds.push(String(cmd)); return Promise.resolve(undefined); } };
      if (k === 'Uri') return { file: (p) => ({ fsPath: p }), parse: () => '', joinPath: () => '' };
      return mk();
    },
    apply() { return mk(); },
  });
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: EXT_PATH, Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(EXT_SRC, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}
const Panel = loadPanelClass();
const mkFolder = (p, name) => ({ uri: { fsPath: p }, name: name });

// ── COH-03 — real folder picker, not openRecent ──────────────────────────────────────────────────
test('COH-03: lp-open-folder opens a REAL folder picker (not workbench.action.openRecent)', () => {
  const inst = Object.create(Panel.prototype);
  V.cmds.length = 0;
  inst._onMessage({ type: 'lp-open-folder' });
  assert.strictEqual(V.cmds.length, 1, 'exactly one command dispatched');
  assert.ok(/openFolder|openFileFolder/.test(V.cmds[0]), 'a real folder-open command: ' + V.cmds[0]);
  assert.notStrictEqual(V.cmds[0], 'workbench.action.openRecent', 'NOT the recents list (the copy said "Abrir a pasta")');
});

// ── COH-05 — multi-root active-project resolution ─────────────────────────────────────────────────
test('COH-05: single-root workspace → _wsRoot is that folder (unchanged)', () => {
  const inst = Object.create(Panel.prototype);
  V.folders = [mkFolder('/repo/solo', 'solo')]; V.activeUri = null;
  assert.strictEqual(inst._wsRoot(), '/repo/solo');
});

test('COH-05: multi-root → _wsRoot follows the ACTIVE editor\'s owning folder, never a blind folders[0]', () => {
  const inst = Object.create(Panel.prototype);
  V.folders = [mkFolder('/repo/A', 'A'), mkFolder('/repo/B', 'B')];
  V.activeUri = { fsPath: '/repo/B/src/page.tsx' }; // the user is looking at project B
  inst._projectRoot = null;
  assert.strictEqual(inst._wsRoot(), '/repo/B', 'resolves B (active), not A (folders[0])');
});

test('COH-05: an explicit project pick wins over the active editor', () => {
  const inst = Object.create(Panel.prototype);
  V.folders = [mkFolder('/repo/A', 'A'), mkFolder('/repo/B', 'B')];
  V.activeUri = { fsPath: '/repo/B/src/page.tsx' };
  inst._projectRoot = '/repo/A'; // the user picked A in the selector
  assert.strictEqual(inst._wsRoot(), '/repo/A', 'the explicit pick is authoritative');
});

test('COH-05: multi-root with NO active editor → first folder (honest fallback, surfaced by the selector)', () => {
  const inst = Object.create(Panel.prototype);
  V.folders = [mkFolder('/repo/A', 'A'), mkFolder('/repo/B', 'B')];
  V.activeUri = null; inst._projectRoot = null;
  assert.strictEqual(inst._wsRoot(), '/repo/A');
});

test('COH-05: _projectsSnapshot lists folders with the active flag (null for single-root)', () => {
  const inst = Object.create(Panel.prototype);
  V.folders = [mkFolder('/repo/A', 'A')]; V.activeUri = null;
  assert.strictEqual(inst._projectsSnapshot(), null, 'single-root → no selector');
  V.folders = [mkFolder('/repo/A', 'A'), mkFolder('/repo/B', 'B')];
  V.activeUri = { fsPath: '/repo/B/x.ts' }; inst._projectRoot = null;
  const snap = inst._projectsSnapshot();
  assert.ok(snap && snap.list.length === 2 && snap.active === '/repo/B', 'active is B');
  assert.ok(snap.list.find((p) => p.path === '/repo/B').active === true && snap.list.find((p) => p.path === '/repo/A').active === false);
});

test('COH-05: lp-pick-project accepts ONLY a real workspace-folder member', () => {
  const inst = Object.create(Panel.prototype);
  V.folders = [mkFolder('/repo/A', 'A'), mkFolder('/repo/B', 'B')]; V.activeUri = null;
  inst._detectStage = () => {}; // isolate from the async probe
  inst._onMessage({ type: 'lp-pick-project', path: '/evil/outside' });
  assert.strictEqual(inst._projectRoot, undefined, 'a non-member path is ignored (stays unset)');
  inst._onMessage({ type: 'lp-pick-project', path: '/repo/B' });
  assert.strictEqual(inst._projectRoot, '/repo/B', 'a real member is accepted');
});

// ── COH-04 — the 4th light is always visible + selector gated (webview render, string-verified) ───
test("COH-04: readiness tree 'unknown' is rendered EVEN with no dev server (not gated behind devServer)", () => {
  // the render branch must NOT be `r.tree==='unknown' && r.devServer` (the C0 seed) — it must fire for
  // unknown regardless, so the 4th light never vanishes on a dead server.
  assert.ok(/r\.tree===['"]unknown['"]\)\s*parts\.push/.test(EXT_SRC.replace(/\s+/g, ' ')) || /else if\(r\.tree===['"]unknown['"]\) parts\.push/.test(EXT_SRC), 'unknown tree light rendered unconditionally');
  assert.ok(!/r\.tree===['"]unknown['"] && r\.devServer/.test(EXT_SRC), 'the unknown light is NOT gated behind devServer anymore');
});

test('COH-04: the selector is disabled with a cause when identity is not confirmed (applySelectCapability)', () => {
  assert.ok(/function applySelectCapability/.test(EXT_SRC), 'the capability gate exists');
  const body = EXT_SRC.slice(EXT_SRC.indexOf('function applySelectCapability'), EXT_SRC.indexOf('function renderReadiness'));
  assert.ok(/r\.tree===['"]ok['"]/.test(body), 'enabled only on a green (ok) tree');
  assert.ok(/b\.disabled=true/.test(body) && /indispon/i.test(body), 'disables the button with an honest reason');
  assert.ok(/reinicia o dev server|handshake|dev server|abre a pasta/.test(body), 'names the cause + the fix');
});
