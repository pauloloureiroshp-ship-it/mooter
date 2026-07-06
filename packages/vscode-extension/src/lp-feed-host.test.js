'use strict';
// lp-feed-host.test.js — LP-4.5 §4 contract: the UNIFIED session feed. EVERY Live Edit write
// (deterministic text/class, delete, fenced rewrite, agent task) lands as one feed item with
// via + file(s); each item reverts individually (inverse splice for splice items, the task
// registry for agent items), always sha-guarded fail-closed. The feed rides the snapshot with a
// render revision. Proven against the REAL LivePreviewPanel (vm-loaded, real engine + real undo
// module) on a real temp workspace.
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
  const realReq = require;
  const REAL = ['./live-edit-ast.js', './live-edit-undo.js'];
  const req = (name) => {
    if (name === 'vscode') return mk();
    if (name === './live-edit-task.js' && stubs && stubs.task) return stubs.task;
    if (name === './live-edit-model.js' && stubs && stubs.model) return stubs.model;
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
  '      <img src="/a.png" alt="a" />',
  '      <h1>Old headline</h1>',
  '      <p>tail</p>',
  '    </section>',
  '  );',
  '}',
  '',
].join('\n');

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-feed-'));
  fs.writeFileSync(path.join(root, 'page.tsx'), SRC, 'utf8');
  return root;
}

function mkInstance(Panel, root) {
  const inst = Object.create(Panel.prototype);
  const posts = [];
  inst.panel = { webview: { postMessage: (m) => posts.push(m) } };
  inst.token = 'tok';
  inst._wsRoot = () => root;
  inst._workspaceTrusted = () => true;
  return { inst, posts };
}

const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

test('every via lands in ONE feed: deterministic + delete + fenced + agent, each with via/files; snapshot view leaks no internals', async () => {
  const root = setup();
  const abs = path.join(root, 'page.tsx');
  try {
    const snap = path.join(root, 'agent-snap.bin');
    const task = {
      runAnchoredTask: async () => {
        fs.writeFileSync(snap, fs.readFileSync(abs), 'utf8'); // agent snapshots, then edits
        fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace('tail', 'TAIL'), 'utf8');
        const realLET = require('./live-edit-task.js');
        return { ok: true, kind: 'edits', text: 'ok', filesRead: [], edits: [{ file: 'page.tsx', abs, snapshot: snap, shaAfter: realLET.sha256File(abs) }], denied: [], model: 'm' };
      },
      gitDiffFile: () => ({ ok: true, lines: [] }),
      revertEdit: require('./live-edit-task.js').revertEdit,
    };
    const Panel = loadPanelClass({ task });
    const { inst } = mkInstance(Panel, root);
    // 1 deterministic text edit
    await inst._applyEdit({ preview: false, file: 'page.tsx', line: 5, tag: 'h1', edit: { kind: 'text', value: 'Novo' }, h: sha(fs.readFileSync(abs, 'utf8')) });
    // 2 fenced rewrite (model apply)
    await inst._promptApply({ file: 'page.tsx', line: 4, tag: 'img', replacement: '<img src="/a.png" alt="a" className="x" />', h: sha(fs.readFileSync(abs, 'utf8')), tier: 't2' });
    // 3 deterministic delete
    await inst._deleteNode({ preview: false, file: 'page.tsx', line: 4, tag: 'img', h: sha(fs.readFileSync(abs, 'utf8')) });
    // 4 agent task
    await inst._taskRun({ instruction: 'faz', mode: 'auto', file: 'page.tsx', line: 5, tag: 'h1' });

    assert.strictEqual(inst._feed.length, 4, 'four writes → four feed items');
    const vias = inst._feed.map((e) => e.via).join('|');
    assert.strictEqual(vias, 'texto · $0|cercada · Sonnet · subscrição|apagar · $0|agente · AUTO · subscrição');
    assert.ok(inst._feed.every((e) => e.status === 'live'), 'all revertable');
    const view = inst._feedView();
    assert.strictEqual(view.items.length, 4);
    for (const it of view.items) {
      assert.ok(!('entry' in it) && !('taskId' in it) && !('kind' in it), 'view leaks no internals');
      assert.strictEqual(it.files.join('|'), 'page.tsx');
    }
    assert.ok(view.rev >= 4, 'revision moved with each push');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('per-item revert: a MIDDLE splice item on an untouched span reverts; later same-span item refuses stale (fail-closed)', async () => {
  const root = setup();
  const abs = path.join(root, 'page.tsx');
  try {
    const Panel = loadPanelClass({});
    const { inst, posts } = mkInstance(Panel, root);
    // write A: h1 text; write B: delete img (different span, SAME file)
    await inst._applyEdit({ preview: false, file: 'page.tsx', line: 5, tag: 'h1', edit: { kind: 'text', value: 'Novo' }, h: sha(fs.readFileSync(abs, 'utf8')) });
    await inst._deleteNode({ preview: false, file: 'page.tsx', line: 4, tag: 'img', h: sha(fs.readFileSync(abs, 'utf8')) });
    const [a] = inst._feed;
    // Reverting the OLDER item (A) after B wrote the same file: sha-guard refuses honestly.
    await inst._feedRevert({ id: a.id });
    let r = posts.filter((p) => p.type === 'lp-edit-result').pop();
    assert.ok(r.ok === false && r.reason === 'undo-stale', 'older item on a since-written file → honest stale refusal');
    assert.strictEqual(a.status, 'live', 'item kept, refusal visible');
    assert.strictEqual(a.reason, 'undo-stale');
    // LIFO order works: revert B, then A.
    await inst._feedRevert({ id: inst._feed[1].id });
    r = posts.filter((p) => p.type === 'lp-edit-result').pop();
    assert.ok(r.ok === true && r.reason === 'undone', 'newest reverts clean');
    await inst._feedRevert({ id: a.id });
    r = posts.filter((p) => p.type === 'lp-edit-result').pop();
    assert.ok(r.ok === true && r.reason === 'undone', 'then the older one reverts too');
    assert.strictEqual(fs.readFileSync(abs, 'utf8'), SRC, 'file back to the original bytes');
    assert.ok(inst._feed.every((e) => e.status === 'reverted'), 'both items settled as reverted');
    // A settled item cannot be reverted twice.
    await inst._feedRevert({ id: a.id });
    r = posts.filter((p) => p.type === 'lp-edit-result').pop();
    assert.ok(r.ok === false && r.reason === 'nothing-to-undo', 'settled item answers honestly');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('agent feed item reverts through the task registry and settles; keep from the result panel settles the feed item too', async () => {
  const root = setup();
  const abs = path.join(root, 'page.tsx');
  try {
    const realLET = require('./live-edit-task.js');
    const mkTask = (snap) => ({
      runAnchoredTask: async () => {
        fs.writeFileSync(snap, fs.readFileSync(abs), 'utf8');
        fs.writeFileSync(abs, fs.readFileSync(abs, 'utf8').replace('tail', 'TAIL'), 'utf8');
        return { ok: true, kind: 'edits', text: 'ok', filesRead: [], edits: [{ file: 'page.tsx', abs, snapshot: snap, shaAfter: realLET.sha256File(abs) }], denied: [], model: 'm' };
      },
      gitDiffFile: () => ({ ok: true, lines: [] }),
      revertEdit: realLET.revertEdit,
    });
    const Panel = loadPanelClass({ task: mkTask(path.join(root, 's1.bin')) });
    const { inst, posts } = mkInstance(Panel, root);
    await inst._taskRun({ instruction: 'x', mode: 'auto', file: 'page.tsx', line: 6, tag: 'p' });
    const item = inst._feed[0];
    assert.strictEqual(item.via, 'agente · AUTO · subscrição');
    // revert via the FEED → flows through the registry, restores bytes, settles the item
    await inst._feedRevert({ id: item.id });
    assert.strictEqual(fs.readFileSync(abs, 'utf8'), SRC, 'agent edit reverted');
    assert.strictEqual(item.status, 'reverted');
    const rr = posts.filter((p) => p.type === 'lp-task-revert-result').pop();
    assert.ok(rr && rr.done === true, 'result panel told too');

    // run a second task, then KEEP from the result panel → the feed item settles as kept
    await inst._taskRun({ instruction: 'y', mode: 't3', file: 'page.tsx', line: 6, tag: 'p' });
    const item2 = inst._feed[1];
    assert.strictEqual(item2.via, 'agente · Opus · subscrição');
    const taskId = posts.filter((p) => p.type === 'lp-task-result').pop().taskId;
    inst._taskKeep({ taskId });
    assert.strictEqual(item2.status, 'kept', 'keep settles the feed item');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the feed rides the snapshot (s.feed.rev + items) — the webview can render without a second channel', async () => {
  const root = setup();
  try {
    const Panel = loadPanelClass({});
    const { inst, posts } = mkInstance(Panel, root);
    inst.stage = null; inst.urlError = null; inst.routes = [];
    await inst._applyEdit({ preview: false, file: 'page.tsx', line: 5, tag: 'h1', edit: { kind: 'text', value: 'Novo' }, h: sha(SRC) });
    const snap = posts.filter((p) => p.type === 'lp-snapshot').pop();
    assert.ok(snap && snap.s && snap.s.feed, 'feed in the snapshot');
    assert.ok(snap.s.feed.rev >= 1, 'revision present');
    assert.strictEqual(snap.s.feed.items.length, 1);
    assert.strictEqual(snap.s.feed.items[0].via, 'texto · $0');
    assert.strictEqual(snap.s.feed.items[0].status, 'live');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
