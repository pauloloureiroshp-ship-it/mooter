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

test('§5 re-pin after a model apply carries the FRESH tag when the rewrite changed the element', async () => {
  const Panel = loadPanelClass({ model: stubModel(REPL) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  // The model rewrote the img into a div — the re-pin stamp must say div, not the stale img.
  await inst._promptApply(Object.assign({ replacement: '<div className="moo">m</div>', h: sha(SRC) }, TARGET));
  assert.ok(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8').includes('<div className="moo">'), 'write landed');
  const repin = posts.find((p) => p.type === 'lp-repin');
  assert.ok(repin, 're-pin posted after the fenced write');
  assert.strictEqual(repin.line, 4, 'node start line survives the splice');
  assert.strictEqual(repin.tag, 'div', 'fresh tag read from the spliced output');
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
  // review P3-a: the cloud model gets a workspace-RELATIVE label, never the absolute host path.
  assert.strictEqual(cloudCalls[0].file, 'page.tsx', 'relative file label — no absolute path leak');
  assert.ok(!path.isAbsolute(String(cloudCalls[0].file)), 'never an absolute path to the cloud');
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

test('review P1-B: the diff payload carries the write TARGET, so apply binds to THIS preview (not a global)', async () => {
  const Panel = loadPanelClass({ model: stubModel(REPL) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptEdit(Object.assign({ prompt: 'x' }, TARGET));
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff, 'diff posted');
  // The target rides the payload — a concurrent second preview can no longer move where apply writes.
  assert.strictEqual(diff.file, 'page.tsx');
  assert.strictEqual(diff.line, 4);
  assert.strictEqual(diff.tag, 'img');
});

test('review P3-b: a model reply identical to the node reports no-op and pushes NO undo entry', async () => {
  const Panel = loadPanelClass({ model: stubModel(NODE) }); // reply === the node → genuine no-op
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptApply(Object.assign({ replacement: NODE, h: sha(SRC) }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'nothing changed on disk');
  const res = posts.find((p) => p.type === 'lp-edit-result');
  assert.ok(res && res.ok === true && res.reason === 'no-op', 'honest no-op, not fabricated model-applied');
  assert.strictEqual(res.undo, 0, 'no phantom undo entry that would revert an EARLIER edit');
});

// ── LP-4.5 §5 — dynamic-content honesty on the fenced path. The flag is computed HOST-side at
// preview time (component tag OR rendered text not literal in the node span) and rides the diff;
// an approved dynamic apply reports 'model-applied-dynamic' — never a plain "✓ escrito".
test('§5 dynamic flag: component tag → dynamic; text-from-props → dynamic; literal text → not dynamic', async () => {
  const SRC2 = [
    'export default function P() {',
    '  return (',
    '    <section>',
    '      <CommunityPulse total={61} />',
    '      <p>literal text here</p>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  const Panel = loadPanelClass({ model: stubModel('<CommunityPulse total={99} />') });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-dyn-'));
  try {
    fs.writeFileSync(path.join(root, 'page.tsx'), SRC2, 'utf8');
    const { inst, posts } = mkInstance(Panel, root);
    // (a) uppercase tag = component → dynamic even before any text comparison
    await inst._promptEdit({ file: 'page.tsx', line: 4, tag: 'CommunityPulse', prompt: 'x', selText: '61 moos $0.00' });
    let diff = posts.filter((p) => p.type === 'lp-prompt-diff').pop();
    assert.strictEqual(diff.dynamic, true, 'component tag flags dynamic');
    // (b) lowercase tag but rendered text is NOT in the node span (props/data) → dynamic
    const Panel2 = loadPanelClass({ model: stubModel('<p className="x">literal text here</p>') });
    const { inst: i2, posts: p2 } = mkInstance(Panel2, root);
    await i2._promptEdit({ file: 'page.tsx', line: 5, tag: 'p', prompt: 'x', selText: '42 items from props' });
    diff = p2.filter((p) => p.type === 'lp-prompt-diff').pop();
    assert.strictEqual(diff.dynamic, true, 'rendered text not literal in the span flags dynamic');
    // (c) lowercase tag AND the rendered text IS the node's literal text → NOT dynamic
    const { inst: i3, posts: p3 } = mkInstance(Panel2, root);
    await i3._promptEdit({ file: 'page.tsx', line: 5, tag: 'p', prompt: 'x', selText: 'literal text here' });
    diff = p3.filter((p) => p.type === 'lp-prompt-diff').pop();
    assert.strictEqual(diff.dynamic, false, 'literal text stays honest-quiet (no alarm spam)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('§5 apply on a dynamic node reports model-applied-dynamic — NEVER a plain "✓ escrito"', async () => {
  const Panel = loadPanelClass({ model: stubModel(REPL) });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  await inst._promptApply(Object.assign({ replacement: REPL, h: sha(SRC), dynamic: true }, TARGET));
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC.replace(NODE, REPL), 'write landed');
  const r = posts.find((p) => p.type === 'lp-edit-result');
  assert.ok(r && r.ok === true && r.reason === 'model-applied-dynamic', 'the dynamic write gets its own honest reason');
  assert.ok(!posts.some((p) => p.type === 'lp-edit-result' && p.reason === 'model-applied'), 'no plain model-applied');
});

test('review P1-A (host): a cloud tier in an UNTRUSTED workspace is refused before the bridge is touched', async () => {
  const cloudCalls = [];
  const cloud = {
    TIER_MODEL: { t2: 'claude-sonnet-4-6' },
    rewriteElementCloud: async (input) => { cloudCalls.push(input); return { ok: true, text: REPL }; },
  };
  const Panel = loadPanelClass({ model: stubModel(REPL), cloud });
  const root = setup();
  const { inst, posts } = mkInstance(Panel, root);
  inst._workspaceTrusted = () => false; // simulate an untrusted workspace
  await inst._promptEdit(Object.assign({ prompt: 'x', tier: 't2' }, TARGET));
  assert.strictEqual(cloudCalls.length, 0, 'the workspace SDK is never reached in an untrusted workspace');
  const diff = posts.find((p) => p.type === 'lp-prompt-diff');
  assert.ok(diff && diff.ok === false && diff.reason === 'workspace-untrusted', 'honest refusal');
  assert.strictEqual(fs.readFileSync(path.join(root, 'page.tsx'), 'utf8'), SRC, 'nothing written');
});
