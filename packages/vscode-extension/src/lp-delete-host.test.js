'use strict';
// lp-delete-host.test.js — MP5.2a delete host contract: the two-phase flow is FAIL-CLOSED on a
// stale apply. The webview approves a mini-diff computed against a hash-stamped source; if the
// file on disk moved before "aplicar", the host must write NOTHING and answer with a REGENERATED
// stale-flagged preview for re-approval. Proven against the REAL LivePreviewPanel._deleteNode
// (vm-loaded extension.js with the real live-edit-ast engine) and a real temp workspace.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function loadPanelClass() {
  // Same loader shape as webview-syntax.test.js, but the edit ENGINE is real — it is the
  // contract under test. Everything else stays a permissive stub.
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const REAL = ['./live-edit-ast.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the class binding survives */ }
  // A top-level `class` is a lexical binding (not a global property) — reach it from a second
  // script in the same context.
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const SRC = [
  'export default function P() {',
  '  return (',
  '    <section>',
  '      <img src="/a.png" alt="a" />',
  '      <p>keep me</p>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-del-'));
  const file = path.join(root, 'page.tsx');
  fs.writeFileSync(file, SRC, 'utf8');
  return { root, file };
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

test('stale apply is FAIL-CLOSED: file moved after preview → nothing written + regenerated stale diff', async () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable from the vm-loaded module');
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  // The preview was approved against SRC; then the file moved (a CC-agent/HMR write — the
  // product's core loop) BEFORE the user clicked "aplicar".
  const approvedHash = sha(SRC);
  const moved = SRC.replace('<p>keep me</p>', '<p>keep me</p>\n      <p>new line</p>');
  fs.writeFileSync(file, moved, 'utf8');
  await inst._deleteNode({ preview: false, file: 'page.tsx', line: 4, tag: 'img', h: approvedHash });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), moved, 'NOTHING was written');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'deleted'), 'no fabricated success');
  const diff = posts.find((p) => p.type === 'lp-delete-diff');
  assert.ok(diff && diff.ok === true && diff.stale === true, 'preview regenerated + flagged stale');
  assert.strictEqual(diff.h, sha(moved), 'regenerated preview stamped with the CURRENT hash');
  assert.ok(diff.removed.some((l) => l.includes('<img')), 'regenerated diff still shows the node');
});

test('fresh apply writes exactly the approved delete and reports deleted', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._deleteNode({ preview: false, file: 'page.tsx', line: 4, tag: 'img', h: sha(SRC) });
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(!after.includes('<img'), 'img line gone');
  assert.ok(after.includes('<p>keep me</p>'), 'sibling intact');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && p.reason === 'deleted'));
});

test('apply without the preview hash is refused as bad-request, nothing written', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._deleteNode({ preview: false, file: 'page.tsx', line: 4, tag: 'img' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'nothing written');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'bad-request'));
});

test('preview stamps the source hash and reports the exact removed line, writing nothing', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._deleteNode({ preview: true, file: 'page.tsx', line: 4, tag: 'img' });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'preview never writes');
  const diff = posts.find((p) => p.type === 'lp-delete-diff');
  assert.ok(diff && diff.ok === true && !diff.stale, 'fresh preview is not stale');
  assert.strictEqual(diff.h, sha(SRC));
  assert.deepStrictEqual(diff.removed, ['      <img src="/a.png" alt="a" />']);
  // LP-4 §6 — the delete diff also carries the ABSOLUTE path of the file it would write (A7).
  assert.ok(typeof diff.abs === 'string' && path.isAbsolute(diff.abs), 'absolute path in the delete diff');
});
