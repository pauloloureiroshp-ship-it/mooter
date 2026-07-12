'use strict';
// lp-lease-host.test.js — C0 · COH-01 (audit P0): the Live Preview identity is a transactional LEASE
// {origin · servedRoot · readyEpoch}. The 2026-07-11 coherence audit proved that a stage that swaps
// origin (7819 dies, an unrelated app answers on 3000) kept the OLD confirmed served-tree and the OLD
// pin alive — so the tree-gate stayed green and a write could land on the workspace while the iframe
// showed a DIFFERENT app ("what you see is NOT what you edit"). This suite proves the lease:
//   1. any origin change nulls servedRoot AND selection and bumps the epoch (P0);
//   2. a prompt pending across the swap writes NOTHING and answers preview-tree-mismatch;
//   3. the new origin stays blocked until a fresh lp-ready (lp-tree) from IT confirms the tree;
//   4. readiness.tree becomes 'unknown' (the 4th light never silently vanishes) — COH-04 seed;
//   5. restart runs in the CONFIRMED workspace root, never a divergent servedRoot, clearing identity — COH-06;
//   + adversarial: a write bound to an OLD epoch refuses even if the new origin re-confirmed the tree
//     (epoch race / TOCTOU between resolveStage and write), and a same-origin poll never re-arms (HMR-safe).
//
// Proven against the REAL LivePreviewPanel (vm-loaded extension.js + real live-edit-ast). Mirrors the
// lp-tree-host harness. A bare Object.create instance leaves lease fields undefined (ctor never ran) →
// the lease helpers still normalise via (x|0)/(||null), and only _detectStage/_setStage/_restart drive it.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const EXT_PATH = path.join(__dirname, 'extension.js');
const EXT_SRC = fs.readFileSync(EXT_PATH, 'utf8');

// A configurable vscode window: `env.warnAnswer` decides what showWarningMessage resolves to, and
// every created terminal is captured so a test can assert its cwd.
const env = { warnAnswer: undefined, terminals: [], warns: [] };

function loadPanelClass() {
  const code = EXT_SRC;
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = new Proxy(function () { return mk(); }, {
    get(t, k) {
      if (k === 'window') return new Proxy({}, { get(_t, _k) {
        if (_k === 'showWarningMessage') return (msg) => { env.warns.push(String(msg)); return Promise.resolve(env.warnAnswer); };
        if (_k === 'showInformationMessage') return () => Promise.resolve(undefined);
        if (_k === 'createTerminal') return (opts) => { const row = Object.assign({ sent: [] }, opts || {}); env.terminals.push(row); return { show() {}, sendText(text) { row.sent.push(String(text)); } }; };
        return mk();
      } });
      if (k === 'Uri') return { file: (p) => ({ fsPath: p }), parse: () => '', joinPath: () => '' };
      return mk();
    },
    apply() { return mk(); },
  });
  const realReq = require;
  const REAL = ['./live-edit-ast.js', './lp-dev-server.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: EXT_PATH, Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the class binding survives */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const SRC = [
  'export default function P() {',
  '  return (',
  '    <section className="hero">',
  '      <h1 className="title">Old headline</h1>',
  '      <p>keep me</p>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const REPL = '<h1 className="title">Prompted</h1>';
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const Panel = loadPanelClass();

function mkTree(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const file = path.join(root, 'page.tsx');
  fs.writeFileSync(file, SRC, 'utf8');
  return { root, file };
}
function mkInstance(wsRoot) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => wsRoot;
  // keep _post() cheap + observable — the real _post() calls livePreviewSnapshot() (heavy); the lease
  // logic only needs "it reposted", so stub it to record the call (the snapshot fields are asserted
  // via _leaseSnapshot() below, a pure host method).
  inst._post = () => posts.push({ type: '__post' });
  return { inst, posts };
}

// ── (1) THE P0 — an origin change re-arms BOTH gates ──────────────────────────────────────────────
test('C0/COH-01: origin swap (:7819 confirmed+pinned → :3000 live) nulls served root AND selection, bumps epoch', () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable from the vm-loaded module');
  const { root } = mkTree('lp-lease-1-');
  const { inst } = mkInstance(root);
  inst.stage = { url: 'http://localhost:7819', port: 7819, source: 'probe', degraded: false, stale: false };
  inst._stageOrigin = 'http://localhost:7819';
  inst._readyEpoch = 5;
  inst._servedRoot = root;                                   // confirmed (=== workspace)
  inst._selection = { file: 'page.tsx', line: 56, col: 1, tag: 'p', selText: 'x' };
  assert.strictEqual(inst._treeGateBlocked(), false, 'precondition: writes allowed on the confirmed :7819 lease');
  // :7819 dies, an unrelated app answers on :3000 → stage swaps origin
  inst._setStage({ url: 'http://localhost:3000', port: 3000, source: 'probe', degraded: false, stale: false });
  assert.strictEqual(inst._servedRoot, null, 'served-tree identity re-armed to unproven');
  assert.strictEqual(inst._selection, null, 'the old pin was cleared');
  assert.strictEqual(inst._treeGateBlocked(), true, 'every write now fail-closes on the new origin');
  assert.strictEqual(inst._readyEpoch, 6, 'epoch bumped on the origin change');
  assert.ok(inst._leaseInfo && inst._leaseInfo.prevPort === '7819' && inst._leaseInfo.newPort === '3000', 'S7 facts captured (prev/new port)');
});

test('C0/COH-01: a SAME-origin poll/stale update NEVER re-arms identity (native HMR must survive)', () => {
  const { root } = mkTree('lp-lease-hmr-');
  const { inst } = mkInstance(root);
  inst.stage = { url: 'http://localhost:7819', port: 7819, degraded: false, stale: false };
  inst._stageOrigin = 'http://localhost:7819';
  inst._readyEpoch = 2;
  inst._servedRoot = root;
  inst._selection = { file: 'page.tsx', line: 4, tag: 'h1' };
  // the 4s poll re-resolves the SAME origin (stale during an HMR blip) — must not touch identity
  inst._setStage({ url: 'http://localhost:7819', port: 7819, degraded: false, stale: true });
  assert.strictEqual(inst._servedRoot, root, 'served root preserved across a same-origin poll');
  assert.ok(inst._selection && inst._selection.file === 'page.tsx', 'pin preserved across a same-origin poll');
  assert.strictEqual(inst._readyEpoch, 2, 'epoch unchanged when the origin does not change');
  assert.strictEqual(inst._leaseInfo || null, null, 'no S7 safe-state for a same-origin blip');
});

test('same-origin positive HTTP failure suspends the lease, clears the pin and blocks writes while pixels are retained', () => {
  const { root } = mkTree('lp-lease-http-retained-');
  const { inst } = mkInstance(root);
  inst.stage = { url: 'http://localhost:7819', port: 7819, degraded: false, stale: false, blocked: false };
  inst._stageOrigin = 'http://localhost:7819';
  inst._readyEpoch = 9;
  inst._servedRoot = root;
  inst._selection = { file: 'page.tsx', line: 4, tag: 'h1' };
  inst._setStage({ url: 'http://localhost:7819', port: 7819, degraded: false, stale: true, blocked: true, retained: true });
  assert.strictEqual(inst.stage.url, 'http://localhost:7819', 'the last page remains the display surface');
  assert.strictEqual(inst._servedRoot, null, 'HTTP failure cannot keep write authority');
  assert.strictEqual(inst._selection, null, 'stale visual anchor is cleared');
  assert.strictEqual(inst._readyEpoch, 10);
  assert.strictEqual(inst._treeGateBlocked(), true);
  assert.strictEqual(inst._leaseInfo.kind, 'stage-unhealthy');
  assert.strictEqual(inst._leaseInfo.prevPort, '7819');
  assert.strictEqual(inst._leaseInfo.newPort, '7819');
});

test('a stale/error document cannot renew servedRoot or pin before the stage is healthy again', () => {
  const { root } = mkTree('lp-lease-stale-ready-');
  const { inst } = mkInstance(root);
  inst.stage = { url: 'http://localhost:7819', port: 7819, degraded: false, stale: true, blocked: true, retained: true };
  inst._stageOrigin = 'http://localhost:7819';
  inst._servedRoot = null;
  inst._selection = null;
  inst._setServedRoot(root);
  inst._setSelection({ file: 'page.tsx', line: 4, tag: 'h1' });
  assert.strictEqual(inst._servedRoot, null, 'lp-ready from a broken document is ignored');
  assert.strictEqual(inst._selection, null, 'lp-pin from a broken document is ignored');
  assert.strictEqual(inst._treeGateBlocked(), true);
});

// ── (2) A write pending across the swap fail-closes ───────────────────────────────────────────────
test('C0/COH-01: a prompt-apply pending across the swap writes NOTHING and answers preview-tree-mismatch', async () => {
  const { root, file } = mkTree('lp-lease-2-');
  const { inst, posts } = mkInstance(root);
  inst.stage = { url: 'http://localhost:7819' }; inst._stageOrigin = 'http://localhost:7819';
  inst._servedRoot = root; inst._selection = { file: 'page.tsx', line: 4, tag: 'h1' };
  // origin swaps (7819→3000) BEFORE the user clicked "apply"
  inst._setStage({ url: 'http://localhost:3000' });
  await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'h1', replacement: REPL, h: sha(SRC), tier: 'local' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'the approved reply never landed on disk');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'honest refusal');
});

// ── (3) The new origin unlocks ONLY after its own handshake ───────────────────────────────────────
test('C0/COH-01: the new origin stays blocked until a fresh lp-ready (lp-tree) from IT confirms the tree', () => {
  const { root } = mkTree('lp-lease-3-');
  const { inst } = mkInstance(root);
  inst.stage = { url: 'http://localhost:7819' }; inst._stageOrigin = 'http://localhost:7819';
  inst._servedRoot = root; inst._selection = { file: 'page.tsx', line: 4, tag: 'h1' };
  inst._setStage({ url: 'http://localhost:3000' });
  assert.strictEqual(inst._treeGateBlocked(), true, 'blocked immediately after the swap');
  // the NEW app on :3000 IS the same workspace and sends its handshake (lp-tree relays the served root)
  inst._setServedRoot(root);
  assert.strictEqual(inst._treeGateBlocked(), false, 'a same-origin handshake renews the lease');
});

// ── (4) The 4th light never silently vanishes — COH-04 seed ───────────────────────────────────────
test("C0/COH-04: server up but identity unproven → readiness.tree === 'unknown' (never absent), with a fix action", () => {
  const { root } = mkTree('lp-lease-4-');
  const { inst } = mkInstance(root);
  inst._hasWorkspace = () => true;
  inst._leBridgeStatus = () => ({ available: true, reason: null });
  inst.stage = { url: 'http://localhost:3000', port: 3000, degraded: false };
  inst._stageOrigin = 'http://localhost:3000';
  inst._servedRoot = null; // unproven (post-swap)
  const r = inst._readiness();
  assert.strictEqual(r.tree, 'unknown', 'server up but identity unproven → unknown, not ok/mismatch');
  // the webview renderer has an explicit unknown branch with a 1-click action (string-extract, the
  // webview render fn lives inside the HTML template — same convention as webview-syntax.test.js).
  assert.ok(/tree===['"]unknown['"]/.test(EXT_SRC), "renderReadiness has an explicit tree==='unknown' branch");
  assert.ok(/por confirmar/.test(EXT_SRC), "the unknown tree light reads 'por confirmar'");
});

// ── (5) Restart runs in the confirmed workspace root — COH-06 ─────────────────────────────────────
test('C0/COH-06: restart resolves the dev package inside the CONFIRMED workspace and clears identity first', async () => {
  const ws = mkTree('lp-lease-5ws-');
  const served = mkTree('lp-lease-5srv-'); // a SIBLING (divergent) served root
  const { inst } = mkInstance(ws.root);
  inst._hasWorkspace = () => true;
  inst._selection = { file: 'page.tsx', line: 4, tag: 'h1' };
  inst._servedRoot = served.root;                            // the WRONG (divergent) served root
  inst.stage = { url: 'http://localhost:3000', port: 3000, stale: false }; inst._stageOrigin = 'http://localhost:3000';
  inst._readyEpoch = 3;
  fs.mkdirSync(path.join(ws.root, 'landing'));
  fs.writeFileSync(path.join(ws.root, 'landing', 'package.json'), JSON.stringify({ scripts: { dev: 'next dev -p 7819' } }));
  env.terminals.length = 0; env.warns.length = 0; env.warnAnswer = 'Encerrar e reiniciar';
  await inst._restartDevServer();
  assert.strictEqual(env.terminals.length, 1, 'exactly one dev-server terminal was opened');
  assert.strictEqual(env.terminals[0].cwd, path.join(ws.root, 'landing'), 'cwd is the dev package inside the CONFIRMED workspace');
  assert.notStrictEqual(env.terminals[0].cwd, served.root, 'never runs npm run dev in the wrong tree');
  assert.strictEqual(env.terminals[0].sent.length, 1);
  assert.match(env.terminals[0].sent[0], /3000/, 'the confirmed wrong-tree listener is explicitly released');
  assert.match(env.terminals[0].sent[0], /npm run dev$/, 'the resolved package receives the real dev command');
  assert.strictEqual(inst._servedRoot, null, 'sticky served-tree identity cleared before the re-probe');
  assert.strictEqual(inst._selection, null, 'selection cleared before the re-probe');
  assert.ok((inst._readyEpoch | 0) > 3, 'epoch bumped so any in-flight write refuses');
});

test('HTTP-blocked stage: restart explicitly releases the broken port before starting landing', async () => {
  const ws = mkTree('lp-lease-http500-');
  fs.mkdirSync(path.join(ws.root, 'landing'));
  fs.writeFileSync(path.join(ws.root, 'landing', 'package.json'), JSON.stringify({ scripts: { dev: 'next dev -p 7819' } }));
  const { inst } = mkInstance(ws.root);
  inst._hasWorkspace = () => true;
  inst.stage = { url: null, port: 7819, degraded: true, blocked: true, statusCode: 500 };
  inst._servedRoot = null; inst._selection = null;
  env.terminals.length = 0; env.warns.length = 0; env.warnAnswer = 'Encerrar e reiniciar';
  await inst._restartDevServer();
  assert.strictEqual(env.terminals.length, 1);
  assert.strictEqual(env.terminals[0].cwd, path.join(ws.root, 'landing'));
  assert.match(env.terminals[0].sent[0], /7819/);
  assert.match(env.terminals[0].sent[0], /npm run dev$/);
});

test('untrusted workspace: dev-server start/restart is refused before reading or executing its script', async () => {
  const ws = mkTree('lp-lease-untrusted-');
  const { inst } = mkInstance(ws.root);
  inst._hasWorkspace = () => true;
  inst._workspaceTrusted = () => false;
  env.terminals.length = 0; env.warns.length = 0; env.warnAnswer = 'Iniciar';
  await inst._restartDevServer();
  assert.strictEqual(env.terminals.length, 0, 'workspace code is never executed while untrusted');
  assert.ok(env.warns.some((message) => /confia neste workspace/.test(message)), 'the refusal tells the user the real recovery action');
});

// ── ADVERSARIAL (C0 gate) — epoch race / TOCTOU between resolveStage and write ────────────────────
test('C0/adversarial: a write echoing an OLD epoch refuses even if the tree is (re)confirmed (epoch race)', async () => {
  const { root, file } = mkTree('lp-lease-epoch-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = root;             // tree IS confirmed on the current origin
  inst._stageOrigin = 'http://localhost:3000';
  inst._readyEpoch = 7;                 // the live lease is at epoch 7
  // the webview echoes epoch 6 (the diff was generated one lease ago) → must refuse despite a green tree
  await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'h1', replacement: REPL, h: sha(SRC), tier: 'local', epoch: 6 });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'a stale-epoch reply never lands even on a confirmed tree');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'stale epoch refused honestly');
});

test('C0/adversarial: a CURRENT-epoch write on a confirmed tree still lands (the guard must not brick the happy path)', async () => {
  const { root, file } = mkTree('lp-lease-epochok-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = root;
  inst._stageOrigin = 'http://localhost:3000';
  inst._readyEpoch = 7;
  await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'h1', replacement: REPL, h: sha(SRC), tier: 'local', epoch: 7 });
  assert.ok(fs.readFileSync(file, 'utf8').includes('Prompted'), 'a current-epoch reply on a confirmed tree writes');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && (p.reason === 'model-applied' || p.reason === 'model-applied-dynamic')));
});
