'use strict';
// lp-cycle-e2e.test.js — F1: the $0 edit CYCLE, proven END-TO-END on a real git working tree.
// This is the Cowork demo turned into CI: a deterministic edit lands on disk (git shows exactly +1/-1),
// then the inverse-splice revert brings the tree back to git-CLEAN (0 changes) — the "git 1+/1- → vazio"
// confirmation Paulo lived. No LLM, no network: the edit path is the local AST splice ($0). Driven through
// the REAL LivePreviewPanel (_applyEdit → _undoLast) with the real live-edit engine and a real repo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function loadPanelClass() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const REAL = ['./live-edit-ast.js', './live-edit-undo.js'];
  const req = (name) => { if (name === 'vscode') return mk(); if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch { /* tolerate top-level activate() errors; the class binding survives */ }
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

function git(root, args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
// A committed repo whose HEAD is exactly SRC, so `git diff` reflects ONLY what the $0 cycle does.
function setupRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-cycle-')));
  const file = path.join(root, 'page.tsx');
  fs.writeFileSync(file, SRC, 'utf8');
  git(root, ['init', '-q']);
  git(root, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', 'page.tsx']);
  git(root, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'base']);
  return { root, file };
}
function mkInstance(root) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => root;
  inst._servedRoot = root; // tree gate CONFIRMED (served === workspace) so the write path is live
  return { inst, posts };
}

test('F1: apply → git shows exactly +1/-1; revert → git CLEAN (the $0 cycle leaves no trace)', async () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable');
  let root, file;
  try { ({ root, file } = setupRepo()); }
  catch (e) { console.log('git unavailable — skipping E2E cycle: ' + e.message); return; }
  try {
    // clean tree to start
    assert.strictEqual(git(root, ['status', '--porcelain']).trim(), '', 'repo starts clean at HEAD===SRC');

    // ── apply a deterministic $0 text edit ──
    const { inst, posts } = mkInstance(root);
    await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: { kind: 'text', value: 'New headline' }, h: sha(SRC) });
    const applied = posts.find((p) => p.type === 'lp-edit-result' && p.reason === 'applied');
    assert.ok(applied && applied.ok === true, 'the edit was applied ($0, deterministic)');
    assert.ok(fs.readFileSync(file, 'utf8').includes('New headline'), 'the new text is on disk');

    // git sees EXACTLY one file, one line changed (1 insertion + 1 deletion) — nothing collateral.
    const numstat = git(root, ['diff', '--numstat']).trim().split('\n').filter(Boolean);
    assert.strictEqual(numstat.length, 1, 'exactly one file changed');
    const [ins, del, fname] = numstat[0].split('\t');
    assert.strictEqual(ins, '1', 'exactly +1');
    assert.strictEqual(del, '1', 'exactly -1');
    assert.ok(/page\.tsx$/.test(fname), 'and it is the edited file');

    // ── revert (inverse byte-splice, $0) ──
    await inst._undoLast();
    assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'the file is byte-identical to the original');
    // …and git agrees: the working tree is CLEAN — the whole cycle left no trace.
    assert.strictEqual(git(root, ['status', '--porcelain']).trim(), '', 'git 1+/1- → vazio: the cycle closed to a clean tree');
    assert.strictEqual(git(root, ['diff']).trim(), '', 'no residual diff after the revert');
  } finally { if (root) fs.rmSync(root, { recursive: true, force: true }); }
});

// H2 HOST-INTEGRATION — the host half of the chain the user must be able to trust: a RECEIVED pin becomes the
// sole selection authority, and an anchored edit lands on exactly that file. The preceding DOM/tap/webview half
// is intentionally NOT claimed here: live-preview-runtime.test.js proves lp-select → exactly one lp-pin relay,
// while lp-selection-host.test.js proves the host store contract. This real-git test composes the remaining
// host boundary: no pin → fail-closed; received pin → allowed; edit → only the pinned file; undo → clean tree.
test('H2 HOST INTEGRATION: received pin → gate opens → edit lands only on the pinned file → clean undo', async () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable');
  let root, file;
  try { ({ root, file } = setupRepo()); }
  catch (e) { console.log('git unavailable — skipping H2-E2E pin chain: ' + e.message); return; }
  try {
    assert.strictEqual(git(root, ['status', '--porcelain']).trim(), '', 'repo starts clean at HEAD===SRC');
    const { inst, posts } = mkInstance(root);
    inst._emitLpEvent = () => {};            // hermetic — no event-bus side effects
    inst._workspaceTrusted = () => true;     // trust gate open (isolates the pin gate under test)
    inst._selection = null;                  // simulate the production ctor default → the pin gate is ACTIVE

    // (1) NO pin yet → the agent/LLM prompt path is FAIL-CLOSED (no anchorless prompt ever reaches the model).
    assert.strictEqual(inst._selectionMissing(), true, 'no pin yet → the selection gate is active');
    await inst._taskRun({ instruction: 'encurta este texto', mode: 'local', file: 'page.tsx', line: 4, tag: 'h1' });
    assert.ok(posts.some((p) => /no-selection/.test(JSON.stringify(p))), 'without a pin, a prompt on the selection is refused (no-selection) BEFORE any agent runs');

    // (2) At the host receipt boundary, _setSelection records the lp-pin payload as the sole authority.
    inst._setSelection({ file: 'page.tsx', line: 4, col: 3, tag: 'h1', selText: 'Old headline' });
    assert.strictEqual(inst._selectionMissing(), false, 'after the pin, prompts are allowed');
    assert.strictEqual(inst._selection.file, 'page.tsx', 'the pin anchors to the SELECTED file');
    assert.strictEqual(inst._selection.line, 4, 'the pin carries the selected line');

    // (3) a prompt/edit ANCHORED to the pin changes EXACTLY the pinned file — nothing collateral.
    await inst._applyEdit({ preview: false, file: inst._selection.file, line: inst._selection.line, tag: inst._selection.tag, edit: { kind: 'text', value: 'New headline' }, h: sha(SRC) });
    assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'applied' && p.ok === true), 'the anchored edit applied');
    const numstat = git(root, ['diff', '--numstat']).trim().split('\n').filter(Boolean);
    assert.strictEqual(numstat.length, 1, 'exactly one file changed');
    assert.ok(/page\.tsx$/.test(numstat[0].split('\t')[2]), 'and it is the PINNED file (page.tsx) — the prompt landed on what was selected');
    assert.ok(fs.readFileSync(file, 'utf8').includes('New headline'), 'the selected element was edited on disk');

    // (4) the cycle reverts to a clean tree — no trace.
    await inst._undoLast();
    assert.strictEqual(git(root, ['status', '--porcelain']).trim(), '', 'the full select→pin→prompt→revert cycle closed clean');
  } finally { if (root) fs.rmSync(root, { recursive: true, force: true }); }
});

test('D6: _scanFingerprint binds to CONTENT of scanned files — stable, shifts on tracked edit, and on UNTRACKED edits (TOCTOU closed)', () => {
  let root, file;
  try { ({ root, file } = setupRepo()); }
  catch (e) { console.log('git unavailable — skipping: ' + e.message); return; }
  try {
    const { inst } = mkInstance(root);
    const fp1 = inst._scanFingerprint();
    assert.ok(fp1 && typeof fp1 === 'string', 'a content fingerprint is computed from the scanned source files');
    assert.strictEqual(inst._scanFingerprint(), fp1, 'stable while nothing changes (a scan stays fresh)');
    // A TRACKED edit shifts it.
    fs.writeFileSync(file, SRC.replace('Old headline', 'New headline'), 'utf8');
    assert.notStrictEqual(inst._scanFingerprint(), fp1, 'a tracked-file edit shifts the fingerprint → prior scan STALE');
    fs.writeFileSync(file, SRC, 'utf8');
    assert.strictEqual(inst._scanFingerprint(), fp1, 'reverting restores the exact fingerprint');
    // THE P0 REVIEW EXPLOIT — an UNTRACKED source file, added/edited AFTER a scan, must also shift the
    // fingerprint (the old git-diff fingerprint was blind to it, letting a secret ride the commit).
    const untracked = path.join(root, 'untracked-leak.ts');
    fs.writeFileSync(untracked, 'export const k = "safe";\n', 'utf8');
    const fp2 = inst._scanFingerprint();
    assert.notStrictEqual(fp2, fp1, 'a new UNTRACKED source file is inside the scanned surface → shifts the fingerprint');
    fs.writeFileSync(untracked, 'export const k = "' + 'AKIA' + 'IOSFODNN7EXAMPLE";\n', 'utf8'); // secret pasted after the "clean" scan
    assert.notStrictEqual(inst._scanFingerprint(), fp2, 'editing an UNTRACKED file after a scan is DETECTED → gate goes stale (TOCTOU closed)');
  } finally { if (root) fs.rmSync(root, { recursive: true, force: true }); }
});

test('F1: a fenced model reply cycle (promptApply → undo) also closes to a clean tree', async () => {
  let root, file;
  try { ({ root, file } = setupRepo()); }
  catch (e) { console.log('git unavailable — skipping: ' + e.message); return; }
  try {
    const { inst, posts } = mkInstance(root);
    await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'h1', replacement: '<h1 className="title">Prompted</h1>', h: sha(SRC), tier: 'local' });
    assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true), 'the fenced reply landed');
    assert.ok(fs.readFileSync(file, 'utf8').includes('Prompted'), 'model text on disk');
    assert.notStrictEqual(git(root, ['status', '--porcelain']).trim(), '', 'the tree is dirty mid-cycle (honest)');
    await inst._undoLast();
    assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'byte-identical after revert');
    assert.strictEqual(git(root, ['status', '--porcelain']).trim(), '', 'clean tree — the $0 model cycle left no trace either');
  } finally { if (root) fs.rmSync(root, { recursive: true, force: true }); }
});
