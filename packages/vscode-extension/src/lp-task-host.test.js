'use strict';
// lp-task-host.test.js — LP-4.5 host contract: the one-box's lp-task message. The host (1) hard
// trust gate, (2) extracts the ANCHOR (node span via the real engine + workspace-relative label —
// never the absolute host path), (3) streams honest progress, (4) registers agent edits HOST-side
// (revert acts on OUR record, never on webview-supplied paths), (5) posts the verdict with real
// per-file diffs. Proven against the REAL LivePreviewPanel (vm-loaded extension.js, real
// live-edit-ast engine) with an injectable task-bridge stub and a real temp workspace.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

function loadPanelClass(stubs) {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const REAL = ['./live-edit-ast.js'];
  const req = (name) => {
    if (name === 'vscode') return mk();
    if (name === './live-edit-task.js' && stubs && stubs.task) return stubs.task;
    if (REAL.indexOf(name) !== -1) return realReq(name);
    if (name.charAt(0) === '.') return mk();
    return realReq(name);
  };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}

const SRC = [
  'export default function P() {',
  '  return (',
  '    <section>',
  '      <CommunityPulse total={61} />',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');
const TARGET = { file: 'landing/page.tsx', line: 4, tag: 'CommunityPulse' };

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-task-host-'));
  fs.mkdirSync(path.join(root, 'landing'), { recursive: true });
  fs.writeFileSync(path.join(root, 'landing', 'page.tsx'), SRC, 'utf8');
  return root;
}

function mkInstance(Panel, root, trusted) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => root;
  inst._workspaceTrusted = () => trusted;
  return { inst, posts };
}

test('untrusted workspace: lp-task refused BEFORE the bridge is touched', async () => {
  const calls = [];
  const task = { runAnchoredTask: async (input, opts) => { calls.push({ input, opts }); return { ok: true, kind: 'answer', text: 'x' }; }, gitDiffFile: () => ({ ok: true, lines: [] }) };
  const Panel = loadPanelClass({ task });
  const root = setup();
  try {
    const { inst, posts } = mkInstance(Panel, root, false);
    await inst._taskRun(Object.assign({ instruction: 'valida os números' }, TARGET));
    assert.strictEqual(calls.length, 0, 'bridge never touched untrusted');
    const r = posts.find((p) => p.type === 'lp-task-result');
    assert.ok(r && r.ok === false && r.reason === 'workspace-untrusted', 'honest refusal');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('anchor extraction: node span via the REAL engine, workspace-relative label, breadcrumb + mode forwarded; trusted===true reaches the bridge', async () => {
  const calls = [];
  const task = {
    runAnchoredTask: async (input, opts) => { calls.push({ input, opts }); return { ok: true, kind: 'answer', text: 'Sim, 61 bate certo.', filesRead: ['landing/page.tsx'], edits: [], denied: [], model: 'claude-sonnet-4-6' }; },
    gitDiffFile: () => ({ ok: true, lines: [] }),
  };
  const Panel = loadPanelClass({ task });
  const root = setup();
  try {
    const { inst, posts } = mkInstance(Panel, root, true);
    await inst._taskRun(Object.assign({ instruction: 'estes números estão coerentes com o projecto?', mode: 'auto', breadcrumb: 'main › section › CommunityPulse' }, TARGET));
    assert.strictEqual(calls.length, 1, 'bridge consulted once');
    const { input, opts } = calls[0];
    assert.strictEqual(input.nodeSource, '<CommunityPulse total={61} />', 'anchor is the node span (real engine)');
    assert.strictEqual(input.file, 'landing/page.tsx', 'workspace-relative label — never the absolute host path');
    assert.ok(!path.isAbsolute(input.file), 'no absolute path to the model');
    assert.strictEqual(input.breadcrumb, 'main › section › CommunityPulse');
    assert.strictEqual(input.mode, 'auto');
    assert.strictEqual(opts.trusted, true, 'trust travels as exactly true');
    assert.strictEqual(opts.wsRoot, root);
    assert.ok(posts.some((p) => p.type === 'lp-task-status' && p.phase === 'thinking'), 'honest thinking state');
    const r = posts.find((p) => p.type === 'lp-task-result');
    assert.ok(r && r.ok === true && r.kind === 'answer', 'verdict posted');
    assert.strictEqual(r.text, 'Sim, 61 bate certo.');
    assert.deepStrictEqual(r.filesRead, ['landing/page.tsx']);
    assert.deepStrictEqual(r.edits, [], 'a question carries zero edits');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('edits verdict: per-file git diff computed from OUR snapshot record; edits registered host-side; streaming forwarded', async () => {
  const root = setup();
  const abs = path.join(root, 'landing', 'page.tsx');
  const snap = path.join(root, 'snap.bin');
  fs.writeFileSync(snap, SRC, 'utf8');
  const edited = SRC.replace('61', '77');
  fs.writeFileSync(abs, edited, 'utf8');
  const diffCalls = [];
  const task = {
    runAnchoredTask: async (input, opts) => {
      // the runner streams while it works — the host must forward each event
      opts.onProgress({ ev: 'tool', tool: 'Read', path: 'landing/page.tsx' });
      opts.onProgress({ ev: 'deny', tool: 'Bash', why: 'not-allowlisted' });
      opts.onProgress({ ev: 'tool', tool: 'Edit', path: 'landing/page.tsx' });
      return { ok: true, kind: 'edits', text: 'Atualizei.', filesRead: ['landing/page.tsx'], edits: [{ file: 'landing/page.tsx', abs, snapshot: snap, shaAfter: 'sha-x' }], denied: [{ tool: 'Bash', why: 'not-allowlisted' }], model: 'claude-sonnet-4-6' };
    },
    gitDiffFile: (s, a) => { diffCalls.push([s, a]); return { ok: true, lines: ['@@ -4 +4 @@', '-      <CommunityPulse total={61} />', '+      <CommunityPulse total={77} />'] }; },
  };
  const Panel = loadPanelClass({ task });
  try {
    const { inst, posts } = mkInstance(Panel, root, true);
    await inst._taskRun(Object.assign({ instruction: 'põe números reais', mode: 'auto' }, TARGET));
    // streaming forwarded with honest phases
    assert.ok(posts.some((p) => p.type === 'lp-task-status' && p.phase === 'tool' && p.tool === 'Read' && p.path === 'landing/page.tsx'), 'read streamed');
    assert.ok(posts.some((p) => p.type === 'lp-task-status' && p.phase === 'deny' && p.tool === 'Bash'), 'denial streamed (the fence is visible)');
    // diff computed from OUR record (snapshot vs the file), scoped to the task
    assert.deepStrictEqual(diffCalls, [[snap, abs]], 'git diff over snapshot vs file');
    const r = posts.find((p) => p.type === 'lp-task-result');
    assert.ok(r && r.ok === true && r.kind === 'edits');
    assert.strictEqual(r.edits.length, 1);
    assert.strictEqual(r.edits[0].file, 'landing/page.tsx');
    assert.ok(r.edits[0].diff.some((l) => l.includes('+      <CommunityPulse total={77} />')), 'real diff lines in the payload');
    assert.ok(!('abs' in r.edits[0]) && !('snapshot' in r.edits[0]), 'host paths never travel to the webview');
    // the edits are registered HOST-side for the revert flow
    assert.ok(inst._taskReg && inst._taskReg.size === 1, 'task registry holds the edits');
    const reg = inst._taskReg.get(r.taskId);
    assert.ok(reg && reg[0].snapshot === snap && reg[0].abs === abs && reg[0].shaAfter === 'sha-x', 'registry entry is the full host record');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('bridge failures are forwarded honestly (timeout, missing sdk, empty)', async () => {
  for (const reason of ['task-timeout', 'sdk-bridge-missing', 'task-empty']) {
    const task = { runAnchoredTask: async () => ({ ok: false, reason }), gitDiffFile: () => ({ ok: false, reason: 'git-unavailable' }) };
    const Panel = loadPanelClass({ task });
    const root = setup();
    try {
      const { inst, posts } = mkInstance(Panel, root, true);
      await inst._taskRun(Object.assign({ instruction: 'x' }, TARGET));
      const r = posts.find((p) => p.type === 'lp-task-result');
      assert.ok(r && r.ok === false && r.reason === reason, 'forwarded: ' + reason);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('empty instruction refused before anything runs', async () => {
  const calls = [];
  const task = { runAnchoredTask: async (i) => { calls.push(i); return { ok: true }; }, gitDiffFile: () => ({ ok: true, lines: [] }) };
  const Panel = loadPanelClass({ task });
  const root = setup();
  try {
    const { inst, posts } = mkInstance(Panel, root, true);
    await inst._taskRun(Object.assign({ instruction: '   ' }, TARGET));
    assert.strictEqual(calls.length, 0);
    const r = posts.find((p) => p.type === 'lp-task-result');
    assert.ok(r && r.ok === false && r.reason === 'prompt-empty');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
