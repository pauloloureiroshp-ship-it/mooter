'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const beacon = require('./paste-beacon.js');

// Contrato REAL do Codex (VS-W0): validador + fixtures, não mocks (guard #1: validação por-item).
const AGENT_SYNC = path.join(__dirname, '..', '..', '..', 'tools', 'agent-sync');
const validator = require(path.join(AGENT_SYNC, 'dispatch-queue-validate.js'));
const validate = (item) => validator.validateDocument(item);
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(AGENT_SYNC, 'fixtures', name), 'utf8'));

const VALID = fixture('dispatch-queue-valid.json');                 // high, pending, corpo inline
const INVALID_FIELD = fixture('dispatch-queue-invalid-field.json'); // session_title extra → rejeitado
const INVALID_DEST = fixture('dispatch-queue-invalid-destination.json'); // endereçado por título → rejeitado

function mockVscode() {
  const clipboard = { text: null };
  const commands = {};
  const info = [];
  return {
    _clipboard: clipboard, _commands: commands, _info: info,
    StatusBarAlignment: { Left: 1, Right: 2 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    window: {
      createStatusBarItem() {
        return { text: '', tooltip: '', backgroundColor: undefined, command: null, shown: false,
          show() { this.shown = true; }, dispose() {} };
      },
      showInformationMessage(m) { info.push(m); },
    },
    commands: {
      registerCommand(id, fn) { commands[id] = fn; return { dispose() { delete commands[id]; } }; },
      executeCommand() { return Promise.resolve(); },
    },
    env: { clipboard: { async writeText(t) { clipboard.text = t; } } },
  };
}

test('validPendingItems aceita o item válido e rejeita os inválidos do Codex (validação por-item)', () => {
  const queue = [VALID, INVALID_FIELD, INVALID_DEST];
  const kept = beacon.validPendingItems(queue, validate);
  assert.strictEqual(kept.length, 1);
  assert.strictEqual(kept[0].id, VALID.id);
  assert.deepStrictEqual(beacon.validPendingItems([], validate), []);
  assert.deepStrictEqual(beacon.validPendingItems(null, validate), []);
});

test('sortByUrgency: critical → high → routine, e created_at desempata', () => {
  const items = [
    { severity: 'routine', created_at: '2026-07-19T10:00:00Z', id: 'r' },
    { severity: 'critical', created_at: '2026-07-19T12:00:00Z', id: 'c' },
    { severity: 'high', created_at: '2026-07-19T09:00:00Z', id: 'h1' },
    { severity: 'high', created_at: '2026-07-19T08:00:00Z', id: 'h0' },
  ];
  assert.deepStrictEqual(beacon.sortByUrgency(items).map((i) => i.id), ['c', 'h0', 'h1', 'r']);
});

test('beaconState paste: fila com item válido → 📥, fundo warning, id no texto', () => {
  const s = beacon.beaconState({ queue: [VALID], gateCount: 0, validate });
  assert.strictEqual(s.kind, 'paste');
  assert.strictEqual(s.background, 'warning');
  assert.match(s.text, /📥 colar/);
  assert.match(s.text, new RegExp(VALID.id));
  assert.strictEqual(s.count, 1);
});

test('beaconState blocker: item critical pending → 🚨, fundo error', () => {
  const crit = { ...VALID, id: 'crit-1', severity: 'critical' };
  const s = beacon.beaconState({ queue: [crit], gateCount: 0, validate });
  assert.strictEqual(s.kind, 'blocker');
  assert.strictEqual(s.background, 'error');
  assert.match(s.text, /🚨 blocker/);
});

test('beaconState fila-vazia: gates>0 → 🔒 N; gates=0 → idle (sem fundo)', () => {
  const gate = beacon.beaconState({ queue: [], gateCount: 3, validate });
  assert.strictEqual(gate.kind, 'gate');
  assert.strictEqual(gate.background, null);
  assert.match(gate.text, /🔒 3 gates te esperam/);
  const one = beacon.beaconState({ queue: [], gateCount: 1, validate });
  assert.match(one.text, /🔒 1 gate te espera/);
  const idle = beacon.beaconState({ queue: [], gateCount: 0, validate });
  assert.strictEqual(idle.kind, 'idle');
  assert.strictEqual(idle.background, null);
});

test('beaconState: itens inválidos do Codex NÃO contam como pending (caem para idle/gate)', () => {
  const s = beacon.beaconState({ queue: [INVALID_FIELD, INVALID_DEST], gateCount: 0, validate });
  assert.strictEqual(s.kind, 'idle');
  assert.strictEqual(s.count, 0);
});

test('pendingActionCount = pastes válidos + gates', () => {
  assert.strictEqual(beacon.pendingActionCount({ queue: [VALID, INVALID_FIELD], gateCount: 2, validate }), 3);
  assert.strictEqual(beacon.pendingActionCount({ queue: [], gateCount: 0, validate }), 0);
});

test('resolveBody: corpo inline; corpo_path via readFile injetado; null quando nenhum', () => {
  assert.strictEqual(beacon.resolveBody(VALID), VALID.corpo);
  const withPath = { corpo_path: '_handoff/X.md' };
  assert.strictEqual(beacon.resolveBody(withPath, (p) => `read:${p}`), 'read:_handoff/X.md');
  assert.strictEqual(beacon.resolveBody({}, () => 'x'), null);
  assert.strictEqual(beacon.resolveBody(null), null);
});

test('create: regista comando, refresh pinta warning, e o clique copia o corpo endereçado', async () => {
  const vscode = mockVscode();
  const b = beacon.create(vscode, { readQueue: () => [VALID], gateCount: () => 0, validate });
  assert.ok(b.item.shown, 'beacon é sempre visível');
  assert.match(b.item.text, /📥 colar/);
  assert.strictEqual(b.item.backgroundColor.id, 'statusBarItem.warningBackground');
  assert.strictEqual(b.item.command, beacon.DEFAULT_COMMAND);
  // clicar = invocar o comando registado → copia o corpo para o clipboard
  await vscode._commands[beacon.DEFAULT_COMMAND]();
  assert.strictEqual(vscode._clipboard.text, VALID.corpo);
  b.dispose();
});

test('create: fila vazia + 0 gates → idle, sem cor de fundo, e nada a copiar', async () => {
  const vscode = mockVscode();
  const b = beacon.create(vscode, { readQueue: () => [], gateCount: () => 0, validate });
  assert.match(b.item.text, /🐮 sem ações/);
  assert.strictEqual(b.item.backgroundColor, undefined);
  await vscode._commands[beacon.DEFAULT_COMMAND]();
  assert.strictEqual(vscode._clipboard.text, null, 'idle não copia nada');
  b.dispose();
});
