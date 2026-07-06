'use strict';
// lp-edit-host.test.js — LP-4 §0 (audit P1-2 / FIX-MP-2): the text/class edit flow is FAIL-CLOSED
// on a stale apply, exactly like the delete has been since 5.2a. The webview approves a mini-diff
// computed against a hash-stamped source; if the file on disk moved before "aplicar", the host must
// write NOTHING and answer with a REGENERATED stale-flagged preview for re-approval. Proven against
// the REAL LivePreviewPanel._applyEdit (vm-loaded extension.js with the real live-edit-ast engine)
// and a real temp workspace — mirrors lp-delete-host.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function loadPanelClass() {
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

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-edit-'));
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
const TEXT_EDIT = { kind: 'text', value: 'New headline' };
const CLASS_EDIT = { kind: 'class', value: 'title text-rose-500' };

test('stale TEXT apply is FAIL-CLOSED: file moved after preview → nothing written + regenerated stale diff', async () => {
  assert.ok(Panel, 'LivePreviewPanel resolvable from the vm-loaded module');
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  // The preview was approved against SRC; then the file moved (a CC-agent/HMR write — the
  // product's core loop) BEFORE the user clicked "aplicar".
  const approvedHash = sha(SRC);
  const moved = SRC.replace('<p>keep me</p>', '<p>keep me</p>\n      <p>new line</p>');
  fs.writeFileSync(file, moved, 'utf8');
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT, h: approvedHash });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), moved, 'NOTHING was written');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'applied'), 'no fabricated success');
  const diff = posts.find((p) => p.type === 'lp-edit-diff');
  assert.ok(diff && diff.ok === true && diff.stale === true, 'preview regenerated + flagged stale');
  assert.strictEqual(diff.h, sha(moved), 'regenerated preview stamped with the CURRENT hash');
  assert.ok(diff.removed.some((l) => l.includes('Old headline')), 'regenerated diff still shows the edit');
});

test('stale CLASS apply is FAIL-CLOSED: file moved after preview → nothing written + regenerated stale diff', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  const approvedHash = sha(SRC);
  const moved = SRC.replace('<p>keep me</p>', '<p>keep me</p>\n      <p>new line</p>');
  fs.writeFileSync(file, moved, 'utf8');
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: CLASS_EDIT, h: approvedHash });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), moved, 'NOTHING was written');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'applied'), 'no fabricated success');
  const diff = posts.find((p) => p.type === 'lp-edit-diff');
  assert.ok(diff && diff.ok === true && diff.stale === true, 'preview regenerated + flagged stale');
  assert.strictEqual(diff.h, sha(moved), 'regenerated preview stamped with the CURRENT hash');
  assert.ok(diff.removed.some((l) => l.includes('className="title"')), 'regenerated diff still shows the class change');
});

test('fresh TEXT apply writes exactly the approved edit and reports applied', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT, h: sha(SRC) });
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('New headline'), 'text replaced');
  assert.ok(!after.includes('Old headline'), 'old text gone');
  assert.ok(after.includes('<p>keep me</p>'), 'sibling intact');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && p.reason === 'applied'));
  // §5 — a fresh write asks the tap to re-pin the SAME node (stamp survives the splice).
  const repin = posts.find((p) => p.type === 'lp-repin');
  assert.ok(repin && repin.line === 4 && repin.tag === 'h1', 're-pin stamp posted after the write');
});

test('fresh CLASS apply writes exactly the approved edit and reports applied', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: CLASS_EDIT, h: sha(SRC) });
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes('className="title text-rose-500"'), 'class replaced');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && p.reason === 'applied'));
});

test('apply without the preview hash is refused as bad-request, nothing written', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._applyEdit({ preview: false, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'nothing written');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'bad-request'));
});

test('preview stamps the source hash + absolute path and reports the exact changed line, writing nothing', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._applyEdit({ preview: true, file: 'page.tsx', line: 4, tag: 'h1', edit: TEXT_EDIT });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'preview never writes');
  const diff = posts.find((p) => p.type === 'lp-edit-diff');
  assert.ok(diff && diff.ok === true && !diff.stale, 'fresh preview is not stale');
  assert.strictEqual(diff.h, sha(SRC));
  assert.strictEqual(diff.kind, 'text');
  assert.ok(typeof diff.abs === 'string' && path.isAbsolute(diff.abs) && diff.abs.toLowerCase().includes('page.tsx'),
    'the diff header carries the ABSOLUTE path of the file that would be written (A7 mitigation)');
  assert.deepStrictEqual(diff.removed, ['      <h1 className="title">Old headline</h1>']);
  assert.deepStrictEqual(diff.added, ['      <h1 className="title">New headline</h1>']);
});

test('preview of a refused edit reports the honest reason on the diff channel, writing nothing', async () => {
  const { file, root } = setup();
  const { inst, posts } = mkInstance(Panel, root);
  // <section> has element children — not simple text → honest refusal, LLM path.
  await inst._applyEdit({ preview: true, file: 'page.tsx', line: 3, tag: 'section', edit: TEXT_EDIT });
  assert.strictEqual(fs.readFileSync(file, 'utf8'), SRC, 'nothing written');
  const diff = posts.find((p) => p.type === 'lp-edit-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'not-simple-text', 'honest refusal on the preview channel');
});
