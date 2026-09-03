'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const lane = require('./lane-terminal.js');

class ThemeColor { constructor(id) { this.id = id; } }
class ThemeIcon { constructor(id) { this.id = id; } }
const vscode = { ThemeColor, ThemeIcon };

test('laneDecor: lanes conhecidas → cor/ícone/nome com emoji; desconhecida → null', () => {
  const reg = lane.laneDecor('registry');
  assert.strictEqual(reg.colorId, 'terminal.ansiBlue');
  assert.strictEqual(reg.icon, 'key');
  assert.match(reg.name, /🔐 registry/);
  assert.strictEqual(lane.laneDecor('genesis').colorId, 'terminal.ansiGreen');
  assert.strictEqual(lane.laneDecor('desconhecida'), null);
  assert.strictEqual(lane.laneDecor(null), null);
});

test('laneTerminalOptions: injeta color(ThemeColor)+iconPath(ThemeIcon)+name sobre base', () => {
  const opts = lane.laneTerminalOptions(vscode, 'mesh', { cwd: '/wt/x' });
  assert.strictEqual(opts.cwd, '/wt/x', 'preserva a base do dispatch.js');
  assert.ok(opts.color instanceof ThemeColor);
  assert.strictEqual(opts.color.id, 'terminal.ansiCyan');
  assert.ok(opts.iconPath instanceof ThemeIcon);
  assert.match(opts.name, /🕸️ mesh/);
});

test('laneTerminalOptions: respeita name existente e degrada em lane desconhecida', () => {
  const named = lane.laneTerminalOptions(vscode, 'registry', { name: 'CUSTOM' });
  assert.strictEqual(named.name, 'CUSTOM');
  const unknown = lane.laneTerminalOptions(vscode, 'nope', { cwd: '/a' });
  assert.deepStrictEqual(unknown, { cwd: '/a' }, 'lane desconhecida → base inalterada');
});

test('runInLaneTerminal: delega no runWithReceipt injetado com opções da lane e devolve o recibo tal-qual', async () => {
  let seen = null;
  const fakeReceipt = { exitCode: 0, durationMs: 12 };
  const runWithReceipt = async (opts, cmd) => { seen = { opts, cmd }; return fakeReceipt; };
  const out = await lane.runInLaneTerminal({ vscode, lane: 'genesis', runWithReceipt, terminalOptions: { cwd: '/wt/g' } }, 'npm test');
  assert.strictEqual(out, fakeReceipt, 'recibo do seam devolvido sem alteração');
  assert.strictEqual(seen.cmd, 'npm test');
  assert.strictEqual(seen.opts.terminalOptions.color.id, 'terminal.ansiGreen');
  assert.strictEqual(seen.opts.terminalOptions.cwd, '/wt/g');
});
