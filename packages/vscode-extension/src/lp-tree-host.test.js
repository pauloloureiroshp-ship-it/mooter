'use strict';
// lp-tree-host.test.js — FIX-MP-1 (audit P0-1): the $0 Live Edit is BOUND to the tree the dev server
// actually serves. The host learns the served root from the dev-only tap (lp-tree / NEXT_PUBLIC_LP_ROOT)
// and PROVES its lineage against the VS Code workspace before it will preview OR write. Twin worktrees
// (same repo, sibling paths) pass containment yet are SIBLINGS — so the write must FAIL-CLOSED
// ('preview-tree-mismatch'), reproducing and killing the 2026-07-06 06:49 incident (a preview that lied).
//
// Proven against the REAL LivePreviewPanel (_treeConfirmed / _setServedRoot / _applyEdit / _deleteNode /
// _openSourceFile) — vm-loaded extension.js with the real live-edit-ast engine and real temp trees.
// Mirrors lp-edit-host.test.js / lp-delete-host.test.js. NOTE: a bare Object.create instance leaves
// _servedRoot === undefined (the ctor never ran) → the gate is inert, which is why the pre-existing
// host suites still pass; production sets _servedRoot=null in the ctor, so it is ALWAYS gated. These
// tests therefore set _servedRoot EXPLICITLY to exercise the real gate.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

// Observability for _openSourceFile: the gate returns BEFORE any open, so we instrument the file-open
// + warning APIs (and never await a non-resolving proxy). Everything else stays a permissive proxy.
const spy = { warn: [], open: [] };

function loadPanelClass() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  // vscode stub: recursive proxy for load-time APIs, but window/workspace expose observable file APIs.
  const vscodeStub = new Proxy(function () { return mk(); }, {
    get(t, k) {
      if (k === 'window') return new Proxy({}, { get(_t, _k) {
        if (_k === 'showWarningMessage') return (msg) => { spy.warn.push(String(msg)); return Promise.resolve(undefined); };
        if (_k === 'showTextDocument') return () => { spy.open.push('showTextDocument'); return Promise.resolve(undefined); };
        return mk();
      } });
      if (k === 'workspace') return new Proxy({}, { get(_t, _k) {
        if (_k === 'openTextDocument') return () => { spy.open.push('openTextDocument'); return Promise.resolve({}); };
        return mk();
      } });
      if (k === 'Uri') return { file: (p) => ({ fsPath: p }), parse: () => '', joinPath: () => '' };
      return mk();
    },
    apply() { return mk(); },
  });
  const realReq = require;
  const REAL = ['./live-edit-ast.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
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

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const Panel = loadPanelClass();
const TEXT_EDIT = { kind: 'text', value: 'New headline' };

// A real temp tree with page.tsx (realpath'd root so comparisons are symlink-stable on every OS).
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
  return { inst, posts };
}

// ── (1) _treeConfirmed / _setServedRoot — lineage truth table ────────────────────────────────────
test('_treeConfirmed: served === workspace → confirmed', () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable from the vm-loaded module');
  const { root } = mkTree('lp-tree-ws-');
  const { inst } = mkInstance(root);
  inst._servedRoot = root;
  assert.strictEqual(inst._treeConfirmed(), true);
});

test('_treeConfirmed: served = workspace/landing (descendant) → confirmed', () => {
  const { root } = mkTree('lp-tree-desc-');
  const { inst } = mkInstance(root);
  inst._servedRoot = path.join(root, 'landing'); // the served subdir of the real workspace
  assert.strictEqual(inst._treeConfirmed(), true);
});

test('_treeConfirmed: served = a SIBLING dir (twin worktree) → NOT confirmed', () => {
  const ws = mkTree('lp-tree-A-');
  const served = mkTree('lp-tree-B-'); // sibling under os.tmpdir(), neither contains the other
  const { inst } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  assert.strictEqual(inst._treeConfirmed(), false);
});

test('_treeConfirmed: servedRoot null (marker absent) → NOT confirmed', () => {
  const { root } = mkTree('lp-tree-null-');
  const { inst } = mkInstance(root);
  inst._servedRoot = null; // the production default until a valid lp-tree arrives
  assert.strictEqual(inst._treeConfirmed(), false);
});

test('_setServedRoot: realpath-normalises an existing dir, clears bad input to null (fail-soft)', () => {
  const { root } = mkTree('lp-tree-set-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = null; // opt into the protocol so _post() is exercised
  inst._setServedRoot(root);
  assert.strictEqual(inst._servedRoot, fs.realpathSync(root), 'existing dir → realpath stored');
  inst._setServedRoot(42);
  assert.strictEqual(inst._servedRoot, null, 'non-string → null');
  inst._setServedRoot('   ');
  assert.strictEqual(inst._servedRoot, null, 'blank → null');
  assert.ok(posts.length >= 1, '_setServedRoot reposts so G1 can surface/clear the banner');
});

// ── (2) G2 write-time FAIL-CLOSED — mismatched OR absent served root ─────────────────────────────
test('G2: _applyEdit PREVIEW with a SIBLING served root writes NOTHING and answers preview-tree-mismatch', async () => {
  const ws = mkTree('lp-tree-eprevA-');
  const served = mkTree('lp-tree-eprevB-');
  const { inst, posts } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  await inst._applyEdit({ preview: true, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT });
  assert.strictEqual(fs.readFileSync(ws.file, 'utf8'), SRC, 'preview never touched the file');
  const diff = posts.find((p) => p.type === 'lp-edit-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'preview-tree-mismatch', 'preview refused on the diff channel');
});

test('G2: _applyEdit APPLY with a SIBLING served root writes NOTHING and answers preview-tree-mismatch', async () => {
  const ws = mkTree('lp-tree-eapplyA-');
  const served = mkTree('lp-tree-eapplyB-');
  const { inst, posts } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT, h: sha(SRC) });
  assert.strictEqual(fs.readFileSync(ws.file, 'utf8'), SRC, 'apply wrote nothing');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'applied'), 'no fabricated success');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'honest refusal');
});

test('G2: _applyEdit APPLY with servedRoot=null (dev marker absent) fail-closes preview-tree-mismatch', async () => {
  const { root, file } = mkTree('lp-tree-eabsent-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = null; // the tap never advertised → identity unproven
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT, h: sha(SRC) });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'nothing written when identity is unproven');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'));
});

test('G2: _deleteNode with a SIBLING served root writes NOTHING and answers preview-tree-mismatch (both phases)', async () => {
  const ws = mkTree('lp-tree-delA-');
  const served = mkTree('lp-tree-delB-');
  const { inst, posts } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  await inst._deleteNode({ preview: true, file: 'page.tsx', line: 4, tag: 'h1' });
  await inst._deleteNode({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', h: sha(SRC) });
  assert.strictEqual(fs.readFileSync(ws.file, 'utf8'), SRC, 'delete wrote nothing in either phase');
  assert.ok(posts.some((p) => p.type === 'lp-delete-diff' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'preview refused');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'apply refused');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'deleted'), 'no fabricated delete');
});

test('G2: _openSourceFile with a SIBLING served root opens NOTHING and warns honestly', async () => {
  const ws = mkTree('lp-tree-openA-');
  const served = mkTree('lp-tree-openB-');
  const { inst } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  spy.warn.length = 0; spy.open.length = 0;
  await inst._openSourceFile({ file: 'page.tsx', line: 4, col: 8 });
  assert.strictEqual(spy.open.length, 0, 'no document was opened');
  assert.ok(spy.warn.length === 1 && /não vem desta árvore|marcador dev/.test(spy.warn[0]), 'honest warning shown');
});

// ── (3) Confirmed lineage still writes (the fix must not brick the happy path) ────────────────────
test('confirmed (servedRoot === workspace): a fresh apply writes exactly the edit', async () => {
  const { root, file } = mkTree('lp-tree-okws-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = root;
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT, h: sha(SRC) });
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('New headline') && !after.includes('Old headline'), 'text replaced');
  assert.ok(after.includes('<p>keep me</p>'), 'sibling intact');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && p.reason === 'applied'));
});

test('confirmed (servedRoot = workspace/landing descendant): a fresh apply still writes', async () => {
  const { root, file } = mkTree('lp-tree-okdesc-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = path.join(root, 'landing'); // the served subdir IS a descendant of the workspace
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT, h: sha(SRC) });
  assert.ok(fs.readFileSync(file, 'utf8').includes('New headline'), 'descendant lineage unlocks the write');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && p.reason === 'applied'));
});

// ── (4) Incident regression — the 06:49 forensic case, in code ───────────────────────────────────
test('incident regression: select carrying a TWIN-WORKTREE served root while editing a file that resolves in the WORKSPACE → REFUSED, workspace file byte-identical', async () => {
  const ws = mkTree('lp-tree-incA-');     // the VS Code workspace (~/frugal)
  const served = mkTree('lp-tree-incB-'); // the dev server's tree (../frugal-land-mp52a) — a SIBLING
  const { inst, posts } = mkInstance(ws.root);
  const before = fs.readFileSync(ws.file, 'utf8');
  // The lp-tree relay delivers the SERVED (wrong) tree's marker; the file path resolves under the ws.
  inst._setServedRoot(served.root);
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT, h: sha(SRC) });
  assert.strictEqual(fs.readFileSync(ws.file, 'utf8'), before, 'the workspace file is byte-identical — nothing was written');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'refused with the honest tree-mismatch reason');
  // And the banner names the served tree's basename so the user knows WHICH tree is being served.
  assert.strictEqual(inst._treeBanner(), 'o preview vem de outra árvore (' + path.basename(served.root) + ') — reinicia o dev server neste workspace para poder editar');
});

// ── (5) The model one-box (default) + agent paths are gated too (final-reviewer NO-SHIP fix) ──────
// _applyEdit/_deleteNode/_openSourceFile were not enough: the DEFAULT interaction is the anchored
// prompt (lp-prompt-apply, tier:'local') and the anchored agent (lp-task). Both must fail-closed.
const REPL = '<h1 className="title">Prompted</h1>';

test('G2: _promptApply (one-box default) with a SIBLING served root writes NOTHING, answers preview-tree-mismatch', async () => {
  const ws = mkTree('lp-tree-paA-');
  const served = mkTree('lp-tree-paB-');
  const { inst, posts } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'h1', replacement: REPL, h: sha(SRC), tier: 'local' });
  assert.strictEqual(fs.readFileSync(ws.file, 'utf8'), SRC, 'the model reply never landed on disk');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && (p.reason === 'model-applied' || p.reason === 'model-applied-dynamic')), 'no fabricated success');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'honest refusal');
});

test('G2: _promptApply with servedRoot=null (dev marker absent) fail-closes preview-tree-mismatch', async () => {
  const { root, file } = mkTree('lp-tree-paNull-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = null; // identity unproven → refuse
  await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'h1', replacement: REPL, h: sha(SRC), tier: 'local' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'nothing written when identity is unproven');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'preview-tree-mismatch'));
});

test('G2: _promptEdit (the feeder) with a SIBLING served root refuses BEFORE shipping node bytes to the model', async () => {
  const ws = mkTree('lp-tree-peA-');
  const served = mkTree('lp-tree-peB-');
  const { inst, posts } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  await inst._promptEdit({ file: 'page.tsx', line: 4, tag: 'h1', prompt: 'make it bold' });
  assert.strictEqual(fs.readFileSync(ws.file, 'utf8'), SRC, 'the feeder wrote nothing');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'preview-tree-mismatch', 'refused on the prompt-diff channel');
  assert.ok(!posts.some((p) => p.type === 'lp-prompt-status'), 'no fabricated thinking state before the gate');
});

test('G2: _taskRun (agent) with an UNCONFIRMED served tree refuses alongside the trust gate — agent never runs', async () => {
  const ws = mkTree('lp-tree-trA-');
  const served = mkTree('lp-tree-trB-');
  const { inst, posts } = mkInstance(ws.root);
  inst._servedRoot = served.root;
  inst._workspaceTrusted = () => true; // isolate the tree gate from the (passing) trust gate
  await inst._taskRun({ instruction: 'rename the heading', file: 'page.tsx', line: 4, tag: 'h1', mode: 'auto' });
  assert.strictEqual(fs.readFileSync(ws.file, 'utf8'), SRC, 'the agent path wrote nothing');
  assert.ok(posts.some((p) => p.type === 'lp-task-result' && p.ok === false && p.reason === 'preview-tree-mismatch'), 'honest task refusal');
  assert.ok(!posts.some((p) => p.type === 'lp-task-status' && p.phase === 'thinking'), 'no fabricated agent-thinking before the gate');
});

test('confirmed (servedRoot === workspace): a fresh _promptApply still writes the fenced model reply', async () => {
  const { root, file } = mkTree('lp-tree-paOk-');
  const { inst, posts } = mkInstance(root);
  inst._servedRoot = root;
  await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'h1', replacement: REPL, h: sha(SRC), tier: 'local' });
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('Prompted') && !after.includes('Old headline'), 'the fenced reply landed on the confirmed tree');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && (p.reason === 'model-applied' || p.reason === 'model-applied-dynamic')));
});
