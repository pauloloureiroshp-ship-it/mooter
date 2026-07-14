'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXTENSION = path.join(__dirname, 'extension.js');

function loadPanelClass() {
  const code = fs.readFileSync(EXTENSION, 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, {
    get(_target, key) {
      if (key === Symbol.toPrimitive || key === 'toString') return () => '';
      if (key === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' };
      return mk();
    },
    apply() { return mk(); },
  });
  const req = (name) => {
    if (name === 'vscode') return mk();
    if (name === './lp-presets.js') return require(name);
    if (name.charAt(0) === '.') return mk();
    return require(name);
  };
  const sandbox = {
    require: req, module: { exports: {} }, exports: {},
    console: { log() {}, error() {}, warn() {}, info() {} },
    process, __dirname, __filename: EXTENSION, Buffer,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: EXTENSION });
  return vm.runInContext('LivePreviewPanel', sandbox);
}

test('manifest contributes the native Mooter Live Preview view and a discoverable focus command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const views = pkg.contributes.views && pkg.contributes.views.mooter || [];
  assert.ok(views.some((view) => view.id === 'mooterLivePreviewSidebar' && view.type === 'webview'));
  assert.strictEqual(views.find((view) => view.id === 'mooterLivePreviewSidebar').when, 'mooter.livePreviewMode');
  assert.strictEqual(views.find((view) => view.id === 'mooterCockpit').when, '!mooter.livePreviewMode');
  assert.ok((pkg.contributes.commands || []).some((command) => command.command === 'mooter.focusLivePreviewSidebar'));
  const code = fs.readFileSync(EXTENSION, 'utf8');
  assert.ok(code.includes("registerWebviewViewProvider('mooterLivePreviewSidebar'"));
  assert.ok(code.includes('webviewOptions: { retainContextWhenHidden: true }'));
});

test('sidebar submit is bound to the host selection; a stale view cannot choose file/line/tag', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._selection = { file: 'host/page.tsx', line: 56, col: 15, tag: 'p', selText: 'texto real' };
  let task = null;
  panel._taskRun = (message) => { task = message; };
  panel._onSidebarMessage({
    type: 'lp-sidebar-submit', instruction: 'valida a coerência', intent: 'edit', mode: 't2',
    file: 'evil/other.tsx', line: 1, col: 1, tag: 'script',
  });
  assert.ok(task, 'the controller receives an anchored task');
  assert.strictEqual(task.file, 'host/page.tsx');
  assert.strictEqual(task.line, 56);
  assert.strictEqual(task.col, 15);
  assert.strictEqual(task.tag, 'p');
  assert.strictEqual(task.selText, 'texto real');
});

test('panel reference sync is contained, bounded, deduplicated and host-owned at sidebar submit', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  const root = path.resolve('C:/workspace');
  const files = new Map([
    ['src/hero.tsx', path.join(root, 'src', 'hero.tsx')],
    ['src/card.tsx', path.join(root, 'src', 'card.tsx')],
  ]);
  panel._selection = { file: 'src/page.tsx', line: 4, col: 1, tag: 'main', selText: 'principal' };
  panel._servedRoot = undefined;
  panel._stageOrigin = undefined;
  panel._readyEpoch = undefined;
  panel._wsRoot = () => root;
  panel._resolveContainedFile = (raw) => files.get(String(raw).replace(/\\/g, '/')) || null;
  panel._syncSidebar = () => {};
  panel._setSelectionRefs({ refs: [
    { file: 'src/hero.tsx', line: 8, col: 2, tag: 'h1', label: '  Hero\u0000 title  ' },
    { file: 'src/hero.tsx', line: 8, col: 2, tag: 'h1', label: 'duplicate' },
    { file: '../../outside.tsx', line: 1, tag: 'script', label: 'escape' },
    { file: 'src/card.tsx', line: 20, col: 3, tag: 'article', label: 'Card summary' },
  ] });
  assert.strictEqual(panel._selectionRefs.length, 2, 'duplicate and non-contained rows are dropped');
  assert.strictEqual(panel._selectionRefs[0].file, 'src/hero.tsx');
  assert.strictEqual(panel._selectionRefs[0].label, 'Hero title', 'labels are bounded and control-clean');
  assert.deepStrictEqual(Object.keys(panel._selectionRefs[0].lease).sort(), ['epoch', 'origin', 'servedRoot']);

  let task = null;
  panel._taskRun = (message) => { task = message; };
  panel._onSidebarMessage({
    type: 'lp-sidebar-submit', instruction: 'compara estes blocos', intent: 'ask', mode: 't2',
    refs: [{ file: 'evil.tsx', line: 1, tag: 'script' }],
  });
  assert.ok(task);
  assert.deepStrictEqual(Array.from(task.refs, (row) => row.file), ['src/hero.tsx', 'src/card.tsx']);
  assert.ok(!task.refs.some((row) => row.file === 'evil.tsx'), 'sidebar-forged refs are ignored');
});

test('reference leases are revalidated at submit and cleared by identity/select-off invalidators', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  const root = path.resolve('C:/workspace');
  panel._selection = { file: 'src/page.tsx', line: 4, col: 1, tag: 'main' };
  panel._servedRoot = undefined;
  panel._stageOrigin = undefined;
  panel._readyEpoch = undefined;
  panel._wsRoot = () => root;
  panel._resolveContainedFile = (raw) => raw === 'src/live.tsx' ? path.join(root, 'src', 'live.tsx') : null;
  panel._selectionRefs = [
    { file: 'src/live.tsx', line: 5, col: 1, tag: 'p', label: 'live', lease: { servedRoot: null, origin: null, epoch: 0 } },
    { file: 'src/gone.tsx', line: 7, col: 1, tag: 'p', label: 'gone', lease: { servedRoot: null, origin: null, epoch: 0 } },
    { file: 'src/live.tsx', line: 9, col: 1, tag: 'p', label: 'stale lease', lease: { servedRoot: null, origin: null, epoch: 99 } },
  ];
  panel._selectionRefsOwner = { journeyId: panel._journeyCurrent(true).id, nodeKey: panel._nodeStamp(panel._selection) };
  assert.strictEqual(panel._selectionRefsOwner.journeyId, panel._currentJourneyId());
  assert.strictEqual(panel._sameNodeStamp(panel._selectionRefsOwner.nodeKey, panel._selection), true);
  assert.strictEqual(panel._refsOwnedByCurrentSelection(), true, 'fixture refs belong to the active journey/node');
  const valid = panel._validatedSelectionRefs();
  assert.deepStrictEqual(Array.from(valid, (row) => row.file + ':' + row.line), ['src/live.tsx:5']);
  assert.strictEqual(panel._selectionRefs.length, 1, 'invalid filesystem and lease rows are pruned host-side');

  panel._syncSidebar = () => {};
  panel._setSelectionRefs({ refs: [] });
  assert.deepStrictEqual(Array.from(panel._selectionRefs), [], 'select-off full-list sync clears host refs');

  panel._selectionRefs = [{ file: 'src/live.tsx', lease: { servedRoot: null, origin: null, epoch: 0 } }];
  panel._stageOrigin = 'http://localhost:7819';
  panel._readyEpoch = 1;
  panel._servedRoot = 'C:/workspace';
  panel._journeyMarkStale = () => {};
  panel._post = () => {};
  panel._sidebarEditProposal = null; panel._sidebarDeleteProposal = null;
  panel._sidebarEditDisplay = null; panel._sidebarDeleteDisplay = null;
  panel._pendingRepin = null; panel._activeTaskAbort = null;
  panel._invalidateIdentity('http://localhost:3000', 'http://localhost:7819', 'origin-changed');
  assert.deepStrictEqual(Array.from(panel._selectionRefs), [], 'origin/identity invalidation clears refs with the pin');
});

test('local edit uses the fenced local rewrite while Ask and cloud chips use the anchored agent', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._selection = { file: 'host/page.tsx', line: 56, col: 15, tag: 'p', selText: 'texto real' };
  const prompts = [];
  const tasks = [];
  panel._promptEdit = (message) => prompts.push(message);
  panel._taskRun = (message) => tasks.push(message);
  panel._onSidebarMessage({ type: 'lp-sidebar-submit', instruction: 'encurta', intent: 'edit', mode: 'local', file: 'evil.tsx' });
  panel._onSidebarMessage({ type: 'lp-sidebar-submit', instruction: 'explica', intent: 'ask', mode: 'local' });
  panel._onSidebarMessage({ type: 'lp-sidebar-submit', instruction: 'refina', intent: 'edit', mode: 'fable' });
  assert.strictEqual(prompts.length, 1);
  assert.strictEqual(prompts[0].file, 'host/page.tsx');
  assert.strictEqual(prompts[0].tier, 'local');
  assert.strictEqual(prompts[0].prompt, 'encurta');
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].intent, 'ask');
  assert.strictEqual(tasks[0].mode, 'auto', 'local cannot answer, so Ask visibly uses the agent path');
  assert.strictEqual(tasks[1].mode, 'fable', 'Fable remains reachable only by its explicit chip');
});

test('sidebar has a narrow allowlist and cannot forge canvas identity or raw deterministic writes', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  const seen = [];
  panel._onMessage = (message) => seen.push(message.type);
  panel._onSidebarMessage({ type: 'lp-pin', file: 'evil.tsx' });
  panel._onSidebarMessage({ type: 'lp-tree', servedRoot: '/evil' });
  panel._onSidebarMessage({ type: 'lp-edit', preview: false });
  panel._onSidebarMessage({ type: 'lp-delete', preview: false });
  assert.deepStrictEqual(seen, []);
  panel._onSidebarMessage({ type: 'lp-security-scan' });
  panel._onSidebarMessage({ type: 'lp-publish-status' });
  assert.deepStrictEqual(seen, ['lp-security-scan', 'lp-publish-status']);
});

test('Publish commit scope comes from the last host status, never from sidebar file paths', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._lastPublishStatus = { touchedFiles: [{ path: 'landing/app/page.tsx' }, { path: 'src/real.ts' }] };
  let request = null;
  panel._publishCommit = (message) => { request = message; };
  panel._onSidebarMessage({ type: 'lp-publish-commit', message: 'Live Preview: pronto', files: ['../../evil', 'secret.env'] });
  assert.deepStrictEqual(Array.from(request.files), ['landing/app/page.tsx', 'src/real.ts']);
  assert.strictEqual(request.message, 'Live Preview: pronto');
});

test('quick edits and delete use only the current host selection, never view-supplied identity', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._selection = { file: 'host/page.tsx', line: 56, col: 15, tag: 'p', className: 'prose' };
  const edits = [];
  const deletes = [];
  panel._applyEdit = (message) => edits.push(message);
  panel._deleteNode = (message) => deletes.push(message);
  panel._onSidebarMessage({ type: 'lp-sidebar-preview-edit', kind: 'text', value: 'texto novo', file: 'evil.tsx', line: 1, tag: 'script' });
  panel._onSidebarMessage({ type: 'lp-sidebar-preset', cls: 'text-blue-600', group: 'text-color', file: 'evil.tsx' });
  panel._onSidebarMessage({ type: 'lp-sidebar-delete-preview', file: 'evil.tsx', line: 1 });
  assert.strictEqual(edits.length, 2);
  assert.deepStrictEqual({ file: edits[0].file, line: edits[0].line, col: edits[0].col, tag: edits[0].tag },
    { file: 'host/page.tsx', line: 56, col: 15, tag: 'p' });
  assert.strictEqual(edits[0].edit.kind, 'text');
  assert.strictEqual(edits[0].edit.value, 'texto novo');
  assert.strictEqual(edits[1].edit.kind, 'class');
  assert.strictEqual(edits[1].edit.value, 'prose text-blue-600');
  assert.deepStrictEqual({ file: deletes[0].file, line: deletes[0].line, col: deletes[0].col, tag: deletes[0].tag },
    { file: 'host/page.tsx', line: 56, col: 15, tag: 'p' });
});

test('deterministic OK intents consume only the host-owned preview record', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  const edits = [];
  const deletes = [];
  panel._applyEdit = (message) => edits.push(message);
  panel._deleteNode = (message) => deletes.push(message);
  panel._sidebarEditProposal = { file: 'host/page.tsx', line: 5, col: 2, tag: 'h1', edit: { kind: 'text', value: 'certo' }, h: 'host-hash' };
  panel._sidebarDeleteProposal = { file: 'host/card.tsx', line: 9, col: 3, tag: 'span', h: 'delete-hash' };
  panel._onSidebarMessage({ type: 'lp-sidebar-edit-apply', file: 'evil.tsx', h: 'evil' });
  panel._onSidebarMessage({ type: 'lp-sidebar-delete-apply', file: 'evil.tsx', h: 'evil' });
  assert.strictEqual(edits[0].file, 'host/page.tsx');
  assert.strictEqual(edits[0].h, 'host-hash');
  assert.strictEqual(edits[0].preview, false);
  assert.strictEqual(deletes[0].file, 'host/card.tsx');
  assert.strictEqual(deletes[0].h, 'delete-hash');
  assert.strictEqual(deletes[0].preview, false);
  assert.strictEqual(panel._sidebarEditProposal, null, 'approval is single-use');
  assert.strictEqual(panel._sidebarDeleteProposal, null, 'delete approval is single-use');
});

test('sidebar receives a display-only diff while the editor panel keeps the complete fenced proposal', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  const editor = [];
  const sidebar = [];
  panel.panel = { webview: { postMessage: (message) => editor.push(message) } };
  panel.token = 'host-token';
  panel._sidebar = { post: (message) => sidebar.push(message) };
  panel._journeyAppend = () => {};
  panel._journeySetState = () => {};
  panel._postEditDiff({ ok: true, abs: 'C:/secret/root/page.tsx', file: 'page.tsx', line: 7, col: 2, tag: 'p', edit: { kind: 'text', value: 'novo' }, h: 'sha', removed: ['old'], added: ['new'] });
  assert.strictEqual(editor[0].file, 'page.tsx');
  assert.strictEqual(editor[0].h, 'sha');
  assert.strictEqual(sidebar[0].file, undefined);
  assert.strictEqual(sidebar[0].abs, undefined);
  assert.strictEqual(sidebar[0].h, undefined);
  assert.deepStrictEqual(sidebar[0].removed, ['old']);
  assert.strictEqual(panel._sidebarEditProposal.file, 'page.tsx', 'the complete approval remains host-only');
});

test('local rewrite proposal is projected as a display-only diff and applies through the prompt fence', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  const editor = [];
  const sidebar = [];
  panel.panel = { webview: { postMessage: (message) => editor.push(message) } };
  panel.token = 'host-token';
  panel._sidebar = { post: (message) => sidebar.push(message) };
  panel._journeyAppend = () => {};
  panel._journeySetState = () => {};
  const lease = { origin: 'http://127.0.0.1:7819', servedRoot: 'C:/repo', epoch: 7 };
  panel._postPromptDiff({ ok: true, file: 'page.tsx', line: 5, col: 2, tag: 'p', replacement: '<p>novo</p>', h: 'sha', tier: 'local', model: 'qwen', lease, epoch: 7, removed: ['old'], added: ['new'], abs: 'C:/repo/page.tsx' });
  assert.strictEqual(editor[0].type, 'lp-prompt-diff');
  assert.strictEqual(editor[0].replacement, '<p>novo</p>');
  assert.strictEqual(sidebar[0].type, 'lp-edit-diff');
  assert.strictEqual(sidebar[0].file, undefined);
  assert.strictEqual(sidebar[0].replacement, undefined);
  assert.strictEqual(sidebar[0].h, undefined);
  assert.strictEqual(panel._sidebarEditProposal.applyKind, 'prompt');
  const applied = [];
  panel._promptApply = (message) => applied.push(message);
  panel._onSidebarMessage({ type: 'lp-sidebar-edit-apply', file: 'evil.tsx', replacement: '<script />' });
  assert.strictEqual(applied[0].file, 'page.tsx');
  assert.strictEqual(applied[0].replacement, '<p>novo</p>');
  assert.strictEqual(applied[0].lease.origin, lease.origin);
});

test('sidebar state restores only the active node task result', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._selection = { file: 'page.tsx', line: 20, col: 1, tag: 'p', selText: 'B', className: 'text-lg' };
  panel._readiness = () => ({ workspace: true, devServer: true, tree: 'ok', sdk: { available: true } });
  panel._securitySummary = () => ({ state: 'idle', counts: { critical: 0, warning: 0, info: 0, total: 0 } });
  panel._journeyView = () => ({ id: 'journey-b' });
  panel._sidebarTaskResults = new Map([
    ['task-a', { taskId: 'task-a', journeyId: 'journey-a', text: 'A' }],
    ['task-b', { taskId: 'task-b', journeyId: 'journey-b', text: 'B' }],
  ]);
  panel._lastSecurity = null;
  panel._lastPublishStatus = null;
  panel._lastLpSnapshot = null;
  panel.stage = { url: 'http://127.0.0.1:7819' };
  panel._stageOrigin = undefined;
  panel._readyEpoch = undefined;
  panel._servedRoot = undefined;
  panel._selectionRefs = [{ file: 'secret/internal.tsx', line: 8, tag: 'h2', label: 'Hero title', lease: { servedRoot: null, origin: null, epoch: 0 } }];
  panel._currentJourneyId = () => 'journey-b';
  panel._selectionRefsOwner = { journeyId: 'journey-b', nodeKey: panel._nodeStamp(panel._selection) };
  const state = panel._sidebarState();
  assert.strictEqual(state.taskResult.taskId, 'task-b');
  assert.strictEqual(state.selection.className, 'text-lg');
  assert.deepStrictEqual(Object.keys(state.refs).sort(), ['count', 'labels']);
  assert.strictEqual(state.refs.count, 1);
  assert.deepStrictEqual(Array.from(state.refs.labels), ['Hero title']);
  assert.ok(!JSON.stringify(state.refs).includes('internal.tsx'), 'reference source identity never reaches sidebar state');
});

test('manual selection reveals and focuses the native composer; an HMR adoption never steals focus', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._servedRoot = undefined;
  panel._lastPinKey = null;
  panel._emitLpEvent = () => {};
  panel._journeyPost = () => {};
  panel._journeyCurrent = () => ({ id: 'j' });
  panel._syncSidebar = () => {};
  const reveals = [];
  panel._sidebar = { reveal: (tab, focus) => reveals.push({ tab, focus }) };
  panel._adoptPendingRepin = () => null;
  panel._setSelection({ file: 'landing/app/page.tsx', line: 56, col: 15, tag: 'p', selText: 'x' });
  assert.deepStrictEqual(reveals, [{ tab: 'edit', focus: true }]);

  panel._adoptPendingRepin = () => ({ id: 'same-journey' });
  panel._setSelection({ file: 'landing/app/page.tsx', line: 56, col: 15, tag: 'p', selText: 'x' });
  assert.strictEqual(reveals.length, 1, 'the disposable iframe re-pin only refreshes state');

  panel._adoptPendingRepin = () => null;
  panel._setSelection({ file: 'landing/app/page.tsx', line: 56, col: 15, tag: 'p', selText: 'x', continuation: true });
  assert.strictEqual(reveals.length, 1, 'a proven ordinary same-node HMR continuation never steals focus');
});

test('manual node change clears A references while a proven same-node continuation preserves them', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._servedRoot = undefined;
  panel._lastPinKey = null;
  panel._emitLpEvent = () => {};
  panel._journeyPost = () => {};
  panel._syncSidebar = () => {};
  panel._sidebar = null;
  panel._adoptPendingRepin = () => null;
  panel._setSelection({ file: 'A.tsx', line: 1, col: 1, tag: 'p' });
  const ownerA = panel._currentJourneyId();
  panel._selectionRefs = [{ file: 'ref.tsx', line: 3, col: 1, tag: 'span', label: 'ref', lease: { servedRoot: null, origin: null, epoch: 0 } }];
  panel._selectionRefsOwner = { journeyId: ownerA, nodeKey: panel._nodeStamp(panel._selection) };
  panel._setSelection({ file: 'A.tsx', line: 1, col: 1, tag: 'p', continuation: true });
  assert.strictEqual(panel._selectionRefs.length, 1);
  panel._setSelection({ file: 'B.tsx', line: 2, col: 1, tag: 'h2' });
  assert.strictEqual(panel._selectionRefs.length, 0);
  assert.strictEqual(panel._selectionRefsOwner, null);
});

test('late local proposal for A cannot appear or apply over B; same-node latest operation wins', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._store = null;
  panel._journeys = null;
  panel._journeyLoaded = false;
  panel._journeyRev = 0;
  panel._promptSeq = 0;
  panel._sidebarTaskResults = new Map();
  panel._sidebarEditProposal = null;
  panel._sidebarDeleteProposal = null;
  panel._sidebarEditDisplay = null;
  panel._sidebarDeleteDisplay = null;
  panel._sidebarTaskStatus = null;
  panel._servedRoot = null;
  panel._stageOrigin = 'http://127.0.0.1:7819';
  panel._readyEpoch = 4;
  panel.stage = { url: 'http://127.0.0.1:7819' };
  panel._postPanel = () => {};
  const sidebar = [];
  panel._postSidebar = (message) => sidebar.push(message);
  panel._syncSidebar = () => {};

  panel._selection = { file: 'A.tsx', line: 1, col: 1, tag: 'p' };
  const journeyA = panel._journeyCurrent(true);
  const opA = panel._newPromptOp(panel._selection, journeyA, panel._identityLeaseSnapshot());
  panel._selection = { file: 'B.tsx', line: 2, col: 1, tag: 'h2' };
  const journeyB = panel._journeyCurrent(true);
  panel._activePromptOp = null;
  panel._postPromptDiff({ ok: true, file: 'A.tsx', line: 1, col: 1, tag: 'p', replacement: '<p>A</p>', h: 'a', lease: opA.lease }, opA);
  assert.strictEqual(panel._sidebarEditProposal, null, 'A is never promoted while B is active');
  assert.strictEqual(sidebar.length, 0, 'B receives no A diff event');
  assert.ok(!journeyB.turns.some((turn) => String(turn.text).includes('Proposta pronta')), 'B thread stays isolated');

  const opB1 = panel._newPromptOp(panel._selection, journeyB, panel._identityLeaseSnapshot());
  const opB2 = panel._newPromptOp(panel._selection, journeyB, panel._identityLeaseSnapshot());
  panel._postPromptDiff({ ok: true, file: 'B.tsx', line: 2, col: 1, tag: 'h2', replacement: '<h2>old</h2>', h: 'old', lease: opB1.lease }, opB1);
  assert.strictEqual(panel._sidebarEditProposal, null, 'superseded same-node result is discarded');
  panel._postPromptDiff({ ok: true, file: 'B.tsx', line: 2, col: 1, tag: 'h2', replacement: '<h2>new</h2>', h: 'new', lease: opB2.lease }, opB2);
  assert.strictEqual(panel._sidebarEditProposal.h, 'new');
  assert.strictEqual(panel._sidebarEditProposal.promptOp.id, opB2.id);
});

test('Ask apply and sidebar task settlement are gated to the active journey and node', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  const lease = { servedRoot: null, origin: null, epoch: 0 };
  panel._treeGateBlocked = () => false;
  panel._workspaceTrusted = () => true;
  panel._identityLeaseMatches = () => true;
  panel._selection = { file: 'B.tsx', line: 2, col: 1, tag: 'h2' };
  panel._activeJourneyId = 'journey-b';
  panel._askReg = new Map([['ask-a', {
    journeyId: 'journey-a', anchor: { file: 'A.tsx', line: 1, col: 1, tag: 'p' }, lease,
    instruction: 'A?', answer: 'A!', refs: [], filesRead: [], mode: 't2', file: 'A.tsx', line: 1, col: 1, tag: 'p', breadcrumb: '<p>',
  }]]);
  const tasks = [];
  panel._taskRun = (message) => tasks.push(message);
  panel._postTaskResult = () => {};
  panel._askApply({ askId: 'ask-a' });
  assert.strictEqual(tasks.length, 0);
  assert.ok(panel._askReg.has('ask-a'), 'blocked Ask remains available after reselecting A');

  panel._selection = { file: 'A.tsx', line: 1, col: 1, tag: 'p' };
  panel._activeJourneyId = 'journey-a';
  panel._askApply({ askId: 'ask-a' });
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].file, 'A.tsx');

  panel._taskContext = new Map([
    ['task-a', { journeyId: 'journey-a', anchor: { file: 'A.tsx', line: 1, col: 1, tag: 'p' } }],
    ['task-b', { journeyId: 'journey-b', anchor: { file: 'B.tsx', line: 2, col: 1, tag: 'h2' } }],
    ['task-security', { context: 'security' }],
  ]);
  assert.strictEqual(panel._sidebarTaskActionAllowed('task-a'), true);
  assert.strictEqual(panel._sidebarTaskActionAllowed('task-b'), false);
  assert.strictEqual(panel._sidebarTaskActionAllowed('task-security'), true);
});

test('Security remediation cancel reaches the single active host task', () => {
  const Panel = loadPanelClass();
  const panel = Object.create(Panel.prototype);
  panel._sidebarTaskStatus = null;
  panel._sidebarSecurityTaskStatus = { taskId: 'security-1', context: 'security', phase: 'thinking' };
  panel._currentJourneyId = () => null;
  const seen = [];
  panel._onMessage = (message) => seen.push(message.type);
  panel._onSidebarMessage({ type: 'lp-task-cancel' });
  assert.deepStrictEqual(seen, ['lp-task-cancel']);
});

test('MEO snapshot is resolved from the same active project root as the Live Preview controller', () => {
  const code = fs.readFileSync(EXTENSION, 'utf8');
  assert.ok(code.includes('function livePreviewSnapshot(rootOverride)'));
  assert.ok(code.includes('livePreviewSnapshot(this._wsRoot())'));
  assert.ok(code.includes("typeof rootOverride === 'string' && rootOverride"));
});
