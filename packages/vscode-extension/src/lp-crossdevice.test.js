'use strict';
// lp-crossdevice.test.js — cross-device path-identity regression (fix 2026-07-08, revised after adversarial review).
//
// WHY: the FIX-MP-1 tree gate compared served-root vs workspace-root with `path.relative`, which is
// CASE-INSENSITIVE on path.win32 and CASE-SENSITIVE on path.posix. A case-only difference between the
// VS Code workspace path and the dev server's served root was therefore silently tolerated on Windows
// and FAIL-CLOSED on macOS/Linux — "só funcionou no Windows" (the preview did nothing on the MacBook).
//
// A first fix folded case whenever process.platform was win32|darwin — but an adversarial pass proved
// that REOPENS the 06:49 P0 on a case-SENSITIVE volume mounted on macOS/Windows (case-sensitive APFS,
// NTFS-per-dir/WSL): two genuinely-distinct case-variant sibling trees would fold together and CONFIRM
// the wrong tree. So the platform proxy is GONE.
//
// THE FIX (authoritative): _treeConfirmed proves lineage by FILESYSTEM IDENTITY (dev+ino) — correct on
// case-sensitive AND case-insensitive volumes with no OS/Unicode guessing. Only when a root cannot be
// stat'd does it fall back to a string compare governed by an EMPIRICAL case-sensitivity probe
// (_caseInsensitiveFS), which fail-safes to case-SENSITIVE (stricter) on any doubt.
//
// These tests drive the REAL static methods: the pure string layer with an INJECTED `ci` boolean + path
// flavour (all OS semantics from one machine), and the inode/probe layer against REAL temp dirs.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

function loadPanelClass() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch { /* tolerate top-level activate() errors; the class binding survives */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const Panel = loadPanelClass();

// Fixtures: POSIX (macOS/Linux) and WIN32 flavours — string layer is driven by an injected `ci` boolean.
const POSIX = { P: path.posix, root: '/Users/paulo/frugal', rootCased: '/Users/paulo/Frugal',
  landing: '/Users/paulo/frugal/landing', landingCased: '/Users/paulo/Frugal/landing',
  sibling: '/Users/paulo/frugal-lp49', evilSuffix: '/Users/paulo/FRUGAL-evil',
  traversal: '/Users/paulo/frugal/../../etc/passwd' };
const WIN = { P: path.win32, root: 'C:\\Users\\paulo\\frugal', rootCased: 'C:\\Users\\paulo\\Frugal',
  landing: 'C:\\Users\\paulo\\frugal\\landing', sibling: 'C:\\Users\\paulo\\frugal-lp49',
  evilSuffix: 'C:\\Users\\paulo\\FRUGAL-evil', traversal: 'C:\\Users\\paulo\\frugal\\..\\..\\Windows' };

function mkTree(prefix) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  fs.writeFileSync(path.join(root, 'page.tsx'), 'x', 'utf8');
  return { root };
}
function mkInstance(wsRoot) {
  const inst = Object.create(Panel.prototype);
  inst.panel = { webview: { postMessage: () => {} } };
  inst.token = 'tok';
  inst._wsRoot = () => wsRoot;
  inst._post = () => {};
  return inst;
}

// ── (0) the real class exposes the full helper set ────────────────────────────────────────────────
test('static helpers exist on the real LivePreviewPanel', () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable from the vm-loaded module');
  for (const m of ['_canonCase', '_within', '_sharesLineage', '_statId', '_sharesLineageByInode', '_caseInsensitiveFS']) {
    assert.strictEqual(typeof Panel[m], 'function', m + ' present');
  }
});

// ── (1) STRING LAYER, ci=true (case-INSENSITIVE FS) — a case-only difference CONFIRMS ─────────────
test('ci=true: case-only difference (frugal vs Frugal) → CONFIRMED [posix + win32]', () => {
  assert.strictEqual(Panel._sharesLineage(POSIX.root, POSIX.rootCased, true, POSIX.P), true);
  assert.strictEqual(Panel._sharesLineage(WIN.root, WIN.rootCased, true, WIN.P), true);
});
test('ci=true: descendant with case-diff on the shared prefix → CONFIRMED', () => {
  assert.strictEqual(Panel._sharesLineage(POSIX.landingCased, POSIX.root, true, POSIX.P), true);
});

// ── (2) STRING LAYER, ci=false (case-SENSITIVE FS) — THE ADVERSARIAL REGRESSION FIX ───────────────
// This is the exact case the first fix got wrong: on a case-sensitive volume, frugal vs Frugal are
// GENUINELY DIFFERENT sibling trees and MUST fail closed. The platform proxy is gone; ci=false preserves case.
test('ci=false: case-only difference → BLOCKED (case-sensitive volume — no over-fold, P0 stays closed)', () => {
  assert.strictEqual(Panel._sharesLineage(POSIX.root, POSIX.rootCased, false, POSIX.P), false);
  assert.strictEqual(Panel._sharesLineage(WIN.root, WIN.rootCased, false, WIN.P), false);
});
test('ci=false: identical path → CONFIRMED', () => {
  assert.strictEqual(Panel._sharesLineage(POSIX.root, POSIX.root, false, POSIX.P), true);
});

// ── (3) ADVERSARIAL — never confirm a non-lineage tree, for EITHER ci and EITHER flavour ──────────
for (const ci of [true, false]) {
  for (const FX of [POSIX, WIN]) {
    const tag = '[ci=' + ci + ' ' + (FX === WIN ? 'win32' : 'posix') + ']';
    test(tag + ' SIBLING twin-worktree (frugal vs frugal-lp49) → BLOCKED', () => {
      assert.strictEqual(Panel._sharesLineage(FX.root, FX.sibling, ci, FX.P), false);
      assert.strictEqual(Panel._sharesLineage(FX.sibling, FX.root, ci, FX.P), false);
    });
    test(tag + ' sibling differing only AFTER a case-fold (frugal vs FRUGAL-evil) → BLOCKED', () => {
      assert.strictEqual(Panel._sharesLineage(FX.root, FX.evilSuffix, ci, FX.P), false);
      assert.strictEqual(Panel._sharesLineage(FX.evilSuffix, FX.root, ci, FX.P), false);
    });
    test(tag + ' path traversal (…/frugal/../../<escape>) → BLOCKED', () => {
      assert.strictEqual(Panel._within(FX.root, FX.traversal, ci, FX.P), false);
    });
    test(tag + ' nullish / empty roots → BLOCKED (fail-closed)', () => {
      assert.strictEqual(Panel._sharesLineage(null, FX.root, ci, FX.P), false);
      assert.strictEqual(Panel._sharesLineage(FX.root, '', ci, FX.P), false);
    });
  }
}

// ── (4) _canonCase contract — folds iff ci ────────────────────────────────────────────────────────
test('_canonCase folds only when ci=true', () => {
  assert.strictEqual(Panel._canonCase('/A/Frugal', true), '/a/frugal');
  assert.strictEqual(Panel._canonCase('/A/Frugal', false), '/A/Frugal');
});

// ── (5) INODE AUTHORITY — real temp dirs, host-OS-real (this is what _treeConfirmed uses first) ───
test('_statId: stable id for an existing dir, null for a missing path', () => {
  const a = mkTree('lp-cd-id-');
  assert.strictEqual(typeof Panel._statId(a.root), 'string');
  assert.strictEqual(Panel._statId(a.root), Panel._statId(a.root), 'stable across calls');
  assert.strictEqual(Panel._statId(path.join(a.root, 'does-not-exist')), null);
});
test('_sharesLineageByInode: same→true, sibling→false, descendant→true, unstat-able→null', () => {
  const a = mkTree('lp-cd-A-');
  const b = mkTree('lp-cd-B-'); // sibling under os.tmpdir() — different inode
  const sub = path.join(a.root, 'landing');
  fs.mkdirSync(sub);
  assert.strictEqual(Panel._sharesLineageByInode(a.root, a.root), true, 'same inode');
  assert.strictEqual(Panel._sharesLineageByInode(a.root, b.root), false, 'siblings — distinct inodes, kills P0');
  assert.strictEqual(Panel._sharesLineageByInode(sub, a.root), true, 'descendant reached by inode-walk');
  assert.strictEqual(Panel._sharesLineageByInode(path.join(a.root, 'nope'), a.root), null, 'unstat-able → null (caller falls back)');
});
test('_caseInsensitiveFS: matches the host filesystem reality; fail-safe on doubt', () => {
  const a = mkTree('lp-cd-ci-');
  // On this host the temp volume's case-sensitivity is whatever the OS gives; the probe must agree with a
  // direct inode check of a case-flipped form (its own definition) — i.e. it is self-consistent and real.
  const flipped = a.root === a.root.toLowerCase() ? a.root.toUpperCase() : a.root.toLowerCase();
  let realInsensitive = false;
  try { realInsensitive = fs.statSync(flipped).ino === fs.statSync(a.root).ino; } catch { realInsensitive = false; }
  assert.strictEqual(Panel._caseInsensitiveFS(a.root), realInsensitive, 'probe equals ground truth');
  assert.strictEqual(Panel._caseInsensitiveFS(''), false, 'empty → fail-safe sensitive');
  assert.strictEqual(Panel._caseInsensitiveFS(path.join(a.root, 'missing')), false, 'missing → fail-safe sensitive');
});

// ── (6) INTEGRATION — the real _treeConfirmed uses inode authority ────────────────────────────────
test('_treeConfirmed (real dirs): served === workspace → confirmed; SIBLING → blocked', () => {
  const ws = mkTree('lp-cd-ws-');
  const sib = mkTree('lp-cd-sib-');
  const instOk = mkInstance(ws.root); instOk._servedRoot = ws.root;
  assert.strictEqual(instOk._treeConfirmed(), true);
  const instSib = mkInstance(ws.root); instSib._servedRoot = sib.root;
  assert.strictEqual(instSib._treeConfirmed(), false, 'twin-worktree sibling fails closed (P0)');
});
test('_treeConfirmed (real dirs): served = workspace/landing DESCENDANT → confirmed', () => {
  const ws = mkTree('lp-cd-desc-');
  const sub = path.join(ws.root, 'landing'); fs.mkdirSync(sub);
  const inst = mkInstance(ws.root); inst._servedRoot = sub;
  assert.strictEqual(inst._treeConfirmed(), true);
});
test('_treeConfirmed: unstat-able served root falls back to string compare (still confirms a real descendant)', () => {
  const ws = mkTree('lp-cd-fb-');
  const inst = mkInstance(ws.root);
  inst._servedRoot = path.join(ws.root, 'landing'); // NOT created on disk → inode returns null → string fallback
  assert.strictEqual(inst._treeConfirmed(), true, 'fallback confirms the descendant via empirical case-fold');
});
