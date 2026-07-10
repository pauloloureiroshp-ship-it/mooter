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

test('D6: _treeFingerprint binds to HEAD + working tree — stable, shifts on edit, restores on revert; null off-git', () => {
  let root, file;
  try { ({ root, file } = setupRepo()); }
  catch (e) { console.log('git unavailable — skipping: ' + e.message); return; }
  try {
    const { inst } = mkInstance(root);
    const fp1 = inst._treeFingerprint();
    assert.ok(fp1 && typeof fp1 === 'string', 'a fingerprint is computed on a real git repo');
    assert.strictEqual(inst._treeFingerprint(), fp1, 'stable while nothing changes (a scan stays fresh)');
    fs.writeFileSync(file, SRC.replace('Old headline', 'New headline'), 'utf8');
    const fp2 = inst._treeFingerprint();
    assert.notStrictEqual(fp2, fp1, 'an uncommitted edit shifts the fingerprint → the prior scan is now STALE');
    fs.writeFileSync(file, SRC, 'utf8');
    assert.strictEqual(inst._treeFingerprint(), fp1, 'reverting the edit restores the exact fingerprint');
    // Off a git repo, the fingerprint is null → the gate treats it as un-fresh (fail-closed).
    const nogit = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lp-nogit-')));
    try { const { inst: inst2 } = mkInstance(nogit); assert.strictEqual(inst2._treeFingerprint(), null, 'no git → null fingerprint (publish stays fail-closed)'); }
    finally { fs.rmSync(nogit, { recursive: true, force: true }); }
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
