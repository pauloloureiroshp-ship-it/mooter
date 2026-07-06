'use strict';
// lp-prompt-host.test.js — LP-4 §3 contract: EVERY model replacement (local $0 OR cloud) passes
// through the fence (spliceNodeRange: parse + single root + no comments + byte-bounded to the
// verified node span) AND the §0 sha256 hash-guard. The model READS only the subtree; a rejected
// replacement shows its exact reason and writes NOTHING; a stale apply regenerates the preview.
// Proven against the REAL LivePreviewPanel (vm-loaded extension.js, real live-edit-ast engine)
// with injectable model/cloud stubs and a real temp workspace.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function loadPanelClass(stubs) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const REAL = ['./live-edit-ast.js'];
  const req = (name) => {
    if (name === 'vscode') return vscodeStub;
    if (name === './live-edit-model.js' && stubs && stubs.model) return stubs.model;
    if (name === './live-edit-cloud.js' && stubs && stubs.cloud) return stubs.cloud;
    if (REAL.indexOf(name) !== -1) return realReq(name);
    if (name.charAt(0) === '.') return mk();
    return realReq(name);
  };
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
  '      <img src="/moo.png" alt="moo" />',
  '      <p>keep me</p>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const NODE = '<img src="/moo.png" alt="moo" />';
const REPL = '<img src="/moo.png" alt="moo" className="rounded-xl border" />';
const TARGET = { file: 'page.tsx', line: 4, tag: 'img' };

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-prompt-'));
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

function stubModel(replyText, calls) {
  return {
    rewriteElement: async (input) => { if (calls) calls.push(input); return { ok: true, text: replyText, model: 'stub-moo' }; },
    cleanModelReply: (t) => String(t == null ? '' : t).trim(),
  };
}

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

test('local $0 preview: model sees ONLY the subtree; fenced diff posted with hash + absolute path; nothing written', async () => {
  const calls = [];
  const Panel = loadPanelClass({ model: stubModel(REPL, calls) });
  assert.ok(Panel, 'LivePreviewPanel resolvable');
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'põe cantos redondos e borda fina' }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'preview never writes');
  assert.strictEqual(calls.length, 1, 'local moo consulted once');
  assert.strictEqual(calls[0].nodeSource, NODE, 'READ fence: exactly the node span, not one byte more');
  assert.ok(!calls[0].nodeSource.includes('export default'), 'never the whole file');
  assert.ok(posts.some((p) => p.type === 'lp-prompt-status' && p.phase === 'thinking' && p.tier === 'local'), 'honest thinking state');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === true && diff.stale === false, 'fenced preview posted');
  assert.strictEqual(diff.h, sha(SRC), 'current disk hash stamped');
  assert.strictEqual(diff.replacement, REPL);
  assert.ok(path.isAbsolute(diff.abs), 'ABSOLUTE path in the diff payload (A7 mitigation)');
  assert.ok(diff.removed.some((l) => l.includes('<img src="/moo.png" alt="moo" />')), 'diff shows the node going');
  assert.ok(diff.added.some((l) => l.includes('rounded-xl border')), 'diff shows the rewrite coming');
});

test('a replacement smuggling a comment is REJECTED by the fence with its exact reason — nothing written', async () => {
  const Panel = loadPanelClass({ model: stubModel(REPL + ' // pwned') });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x' }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'nothing written');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'replacement-has-comments', 'honest fence refusal');
});

test('a non-element replacement is REJECTED (not-single-root) — nothing written', async () => {
  // parses fine, has no comments — but it is a CALL, not a single JSX root: the fence refuses.
  const Panel = loadPanelClass({ model: stubModel('alert(1)') });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x' }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'nothing written');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'not-single-root');
});

test('adjacent JSX elements do not even parse — honest parse refusal, nothing written', async () => {
  const Panel = loadPanelClass({ model: stubModel('<img /><script src="evil" />') });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x' }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'nothing written');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'replacement-parse-error');
});

test('moo offline is forwarded honestly (local-model-offline), nothing written', async () => {
  const Panel = loadPanelClass({ model: { rewriteElement: async () => ({ ok: false, reason: 'local-model-offline' }), cleanModelReply: (t) => String(t || '').trim() } });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x' }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC);
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'local-model-offline');
});

test('fresh apply writes EXACTLY the approved splice (byte-bounded, siblings intact) and reports model-applied', async () => {
  const Panel = loadPanelClass({ model: stubModel(REPL) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptApply(Object.assign({ replacement: REPL, h: sha(SRC) }, TARGET));
  const after = fs.readFileSync(path.join(root, 'page.tsx'), 'utf8');
  assert.strictEqual(after, SRC.replace(NODE, REPL), 'byte-bounded: only the node span changed');
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === true && p.reason === 'model-applied'));
});

test('stale apply is FAIL-CLOSED: file moved after preview → nothing written + regenerated stale diff', async () => {
  const Panel = loadPanelClass({ model: stubModel(REPL) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  const approvedHash = sha(SRC);
  const moved = SRC.replace('<p>keep me</p>', '<p>keep me</p>\n      <p>new line</p>');
  fs.writeFileSync(path.join(root, 'page.tsx'), moved, 'utf8');
  await inst._promptApply(Object.assign({ replacement: REPL, h: approvedHash }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), moved, 'NOTHING was written');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'model-applied'), 'no fabricated success');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === true && diff.stale === true, 'preview regenerated + flagged stale');
  assert.strictEqual(diff.h, sha(moved), 'regenerated preview stamped with the CURRENT hash');
});

test('apply without the preview hash is refused as bad-request, nothing written', async () => {
  const Panel = loadPanelClass({ model: stubModel(REPL) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptApply(Object.assign({ replacement: REPL }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC);
  assert.ok(posts.some((p) => p.type === 'lp-edit-result' && p.ok === false && p.reason === 'bad-request'));
});

test('cloud tier routes through the bridge stub with the tier, and the reply passes the SAME fence', async () => {
  const cloudCalls = [];
  const cloud = {
    TIER_MODEL: { t1: 'claude-haiku-4-5', t2: 'claude-sonnet-4-6', t3: 'claude-opus-4-6', fable: 'claude-fable-5' },
    rewriteElementCloud: async (input) => { cloudCalls.push(input); return { ok: true, text: '```jsx\n' + REPL + '\n```' }; },
  };
  const Panel = loadPanelClass({ model: require('./live-edit-model.js'), cloud });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x', tier: 't2' }, TARGET));
  assert.strictEqual(cloudCalls.length, 1, 'cloud bridge consulted');
  assert.strictEqual(cloudCalls[0].tier, 't2');
  assert.strictEqual(cloudCalls[0].nodeSource, NODE, 'cloud sees ONLY the subtree too');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === true, 'cloud reply fenced + previewed');
  assert.strictEqual(diff.replacement, REPL, 'markdown fence stripped before the splice fence');
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'preview never writes');
});

test('missing/default tier NEVER touches the cloud: local is the default, @fable only by explicit click', async () => {
  const cloudCalls = [];
  const cloud = {
    TIER_MODEL: { t2: 'claude-sonnet-4-6', fable: 'claude-fable-5' },
    rewriteElementCloud: async (input) => { cloudCalls.push(input); return { ok: true, text: REPL }; },
  };
  const localCalls = [];
  const Panel = loadPanelClass({ model: stubModel(REPL, localCalls), cloud });
  const root = setup();
  const { inst } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x' }, TARGET)); // no tier at all
  assert.strictEqual(cloudCalls.length, 0, 'no tier → cloud untouched');
  assert.strictEqual(localCalls.length, 1, 'no tier → local $0 default');
});
