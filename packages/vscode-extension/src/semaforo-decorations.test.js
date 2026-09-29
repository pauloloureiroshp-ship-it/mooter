'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const sem = require('./semaforo-decorations.js');

// ── vscode mock (nunca tocamos no módulo 'vscode' real) ──
class EventEmitter {
  constructor() { this.listeners = []; this.event = (fn) => { this.listeners.push(fn); return { dispose() {} }; }; }
  fire(v) { for (const f of this.listeners) f(v); }
  dispose() { this.listeners = []; }
}
class ThemeColor { constructor(id) { this.id = id; } }
function mockVscode() {
  const registered = [];
  return {
    _registered: registered,
    EventEmitter, ThemeColor,
    window: { registerFileDecorationProvider(p) { registered.push(p); return { dispose() {} }; } },
  };
}

test('laneForBranch mapeia branches conhecidos e devolve null no resto', () => {
  assert.strictEqual(sem.laneForBranch('feat/session-registry'), 'registry');
  assert.strictEqual(sem.laneForBranch('feat/genesis-tab'), 'genesis');
  assert.strictEqual(sem.laneForBranch('feat/mesh-phase-a'), 'mesh');
  assert.strictEqual(sem.laneForBranch('feat/ledger-receipts'), 'receipts');
  assert.strictEqual(sem.laneForBranch('feat/handoff-schema-v11'), 'schema-v11');
  assert.strictEqual(sem.laneForBranch('feat/context-card'), 'context-card');
  assert.strictEqual(sem.laneForBranch('chore/mooter-20-h0'), null);
  assert.strictEqual(sem.laneForBranch(''), null);
  assert.strictEqual(sem.laneForBranch(null), null);
});

test('parseSessionsFile aceita o store {sessions:{id:rec}}, arrays, e degrada em lixo', () => {
  const store = JSON.stringify({ schema_version: 1, sessions: { a: { id: 'a' }, b: { id: 'b' } } });
  assert.deepStrictEqual(sem.parseSessionsFile(store).map((r) => r.id).sort(), ['a', 'b']);
  assert.deepStrictEqual(sem.parseSessionsFile(JSON.stringify({ sessions: [{ id: 'x' }] })), [{ id: 'x' }]);
  assert.deepStrictEqual(sem.parseSessionsFile('not json'), []);
  assert.deepStrictEqual(sem.parseSessionsFile('null'), []);
  assert.deepStrictEqual(sem.parseSessionsFile('{}'), []);
});

test('stateForWorktree respeita a precedência 🚨>📥>🔒>🅿️>🟡>✅', () => {
  const crit = { severity: 'critical', estado: 'pending' };
  const pend = { severity: 'high', estado: 'pending' };
  // blocker ganha mesmo com gate e record active
  assert.strictEqual(sem.stateForWorktree({ record: { state: 'active' }, pendingItems: [crit], gate: true }), 'blocker');
  // paste ganha a gate/parked
  assert.strictEqual(sem.stateForWorktree({ record: { state: 'parked' }, pendingItems: [pend], gate: true }), 'paste');
  // gate ganha a parked/working
  assert.strictEqual(sem.stateForWorktree({ record: { state: 'active' }, pendingItems: [], gate: true }), 'gate');
  assert.strictEqual(sem.stateForWorktree({ record: { state: 'parked' }, pendingItems: [] }), 'parked');
  assert.strictEqual(sem.stateForWorktree({ record: { state: 'active' }, pendingItems: [] }), 'working');
  assert.strictEqual(sem.stateForWorktree({ record: { state: 'closed' }, pendingItems: [] }), 'closed');
  // sem record e sem gate → nada
  assert.strictEqual(sem.stateForWorktree({ record: null, pendingItems: [], gate: false }), null);
  // sem record mas com gate (unpushed) → gate (degradação sem registry)
  assert.strictEqual(sem.stateForWorktree({ record: null, pendingItems: [], gate: true }), 'gate');
});

test('decorationSpec: 1 emoji no badge, cor por estado, lane no tooltip, propagate:true', () => {
  const d = sem.decorationSpec('paste', { laneKey: 'registry' });
  assert.strictEqual(d.badge, '📥');
  assert.strictEqual(d.colorId, 'charts.blue');
  assert.strictEqual(d.propagate, true);
  assert.match(d.tooltip, /🔐 registry · /);
  assert.match(d.tooltip, /paste/i);
  // sem lane → tooltip sem prefixo de lane
  const nolane = sem.decorationSpec('working', {});
  assert.ok(!nolane.tooltip.includes('·'));
  assert.strictEqual(sem.decorationSpec('nonexistent', {}), null);
});

test('buildDecorationMap: casa worktree→record, queue por sessao_id, e deriva a lane', () => {
  const worktrees = [
    { path: 'C:/wt/registry', branch: 'feat/session-registry' },
    { path: 'C:/wt/genesis', branch: 'feat/genesis-tab' },
    { path: 'C:/wt/idle', branch: 'chore/x' },
  ];
  const sessions = [
    { id: 'cc-reg', worktree: 'C:/wt/registry', branch: 'feat/session-registry', state: 'active' },
    { id: 'cc-gen', worktree: 'C:/wt/genesis', branch: 'feat/genesis-tab', state: 'parked' },
  ];
  const queue = [
    { severity: 'high', estado: 'pending', destino: { sessao_id: 'cc-reg' }, lane: 'registry' },
    { severity: 'high', estado: 'done', destino: { sessao_id: 'cc-gen' }, lane: 'genesis' },
  ];
  const map = sem.buildDecorationMap({ worktrees, sessions, queue });
  // registry: tem paste pending → 📥, lane 🔐 via branch
  assert.strictEqual(map['c:/wt/registry'].badge, '📥');
  assert.strictEqual(map['c:/wt/registry'].laneKey, 'registry');
  // genesis: item done (não pending) → cai para o estado do registry (parked) → 🅿️
  assert.strictEqual(map['c:/wt/genesis'].badge, '🅿️');
  // idle: sem record, sem gate → sem decoração
  assert.strictEqual(map['c:/wt/idle'], undefined);
});

test('buildDecorationMap: gateFor injeta o 🔒 mesmo sem registry (unpushed)', () => {
  const map = sem.buildDecorationMap({
    worktrees: [{ path: '/wt/a', branch: 'x' }],
    sessions: [],
    queue: [],
    gateFor: ({ record, worktreePath }) => { assert.strictEqual(record, null); return worktreePath === '/wt/a'; },
  });
  assert.strictEqual(map['/wt/a'].badge, '🔒');
});

test('register: provider devolve FileDecoration com ThemeColor; uri desconhecida → undefined', () => {
  const vscode = mockVscode();
  const data = {
    worktrees: [{ path: '/wt/reg', branch: 'feat/session-registry' }],
    sessions: [{ id: 's1', worktree: '/wt/reg', branch: 'feat/session-registry', state: 'active' }],
    queue: [{ severity: 'critical', estado: 'pending', destino: { sessao_id: 's1' } }],
  };
  const reg = sem.register(vscode, { refreshData: () => data });
  assert.strictEqual(vscode._registered.length, 1);
  const dec = reg.provider.provideFileDecoration({ fsPath: '/wt/reg' });
  assert.strictEqual(dec.badge, '🚨'); // critical pending → blocker
  assert.ok(dec.color instanceof ThemeColor);
  assert.strictEqual(dec.color.id, 'charts.red');
  assert.strictEqual(dec.propagate, true);
  assert.strictEqual(reg.provider.provideFileDecoration({ fsPath: '/somewhere/else' }), undefined);
  reg.dispose();
});

test('readAgentSync monta o modelo e conta gates (cowork-pending + unpushed), I/O injetada', () => {
  const model = sem.readAgentSync({
    worktrees: () => [
      { path: '/wt/a', branch: 'feat/session-registry' },
      { path: '/wt/b', branch: 'x' },
    ],
    sessions: [{ id: 's-a', worktree: '/wt/a', branch: 'feat/session-registry', state: 'active' }],
    queue: [{ severity: 'high', estado: 'pending', destino: { sessao_id: 's-a' } }],
    readCoworkPending: () => ({ session_id: 's-a', status: 'pending' }), // gate em /wt/a
    gitUnpushed: (p) => (p === '/wt/b' ? 2 : 0),                          // gate em /wt/b (unpushed)
  });
  assert.strictEqual(model.queue.length, 1);
  assert.strictEqual(model.sessions.length, 1);
  assert.strictEqual(model.gateCount, 2, 'a via cowork-pending + b via unpushed');
  assert.strictEqual(model.gateFor({ record: model.sessions[0], worktreePath: '/wt/a' }), true);
  assert.strictEqual(model.gateFor({ record: null, worktreePath: '/wt/b' }), true);
});

test('readAgentSync sem syncDir/I/O → modelo vazio, nunca lança', () => {
  const model = sem.readAgentSync({});
  assert.deepStrictEqual(model.sessions, []);
  assert.deepStrictEqual(model.queue, []);
  assert.deepStrictEqual(model.worktrees, []);
  assert.strictEqual(model.gateCount, 0);
});

test('register.refresh reconstrói o mapa a partir de dados novos', () => {
  const vscode = mockVscode();
  let state = 'active';
  const reg = sem.register(vscode, {
    refreshData: () => ({
      worktrees: [{ path: '/wt/x', branch: 'feat/mesh' }],
      sessions: [{ id: 's', worktree: '/wt/x', branch: 'feat/mesh', state }],
      queue: [],
    }),
  });
  assert.strictEqual(reg.provider.provideFileDecoration({ fsPath: '/wt/x' }).badge, '🟡');
  state = 'closed';
  reg.refresh();
  assert.strictEqual(reg.provider.provideFileDecoration({ fsPath: '/wt/x' }).badge, '✅');
  reg.dispose();
});
