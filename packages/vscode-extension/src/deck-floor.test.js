// deck-floor.test.js — Deck Phase 2 (Floor + deep-link). Guards the three gate items:
// (1) click abre a aba certa (mooter.openSessionTab deep-link), (2) honest-copy Local Moo
// Fleet (0 dispatches = advisory — covered in fleet-view.test.js), (3) pin persiste. Plus the
// session type glyph + persistent pin control + honest Fleet Console aggregate.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const rr = require('./row-renderer');
const MR = require('./mode-registry');

const BASE_ROW = {
  fullId: 'abc12345-dead-beef-1234-567890abcdef', id: 'abc12345', name: 'hot session',
  mode: 'moo', model: 'claude-opus-4-6', auto: false, project: 'Mooter.ai', brainTitle: null,
  working: false, needsYou: false, waitingForCowork: false, coworkStatus: null, coworkTitle: null,
  ageMs: 120000, branch: null, cwd: null, pr: null, worktree: null, lastActiveTs: 1000,
};

function renderHtml() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return mk(); if (name === './cowork-waiting' || name === './mode-registry' || name === './row-renderer' || name === './arch-tree' || name === './mission-control-view' || name === './project-command-view' || name === './guardian-chip') return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* getHtml is hoisted */ }
  return sandbox.getHtml();
}
function scriptOf(html) { const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/); assert.ok(m, 'inline script found'); return m[1]; }

// ── row: type glyph + persistent pin ────────────────────────────────────────
test('renderRow derives the type glyph from real fields (💬 CC · ♾️ loop · ⏰ scheduled)', () => {
  assert.match(rr.renderRow(BASE_ROW, {}), /class="stype"[^>]*>💬/, 'plain session → CC glyph');
  assert.match(rr.renderRow(Object.assign({}, BASE_ROW, { loop: true }), { loopActive: false }), /class="stype"[^>]*>♾️/, 'loop session → ♾️');
  assert.match(rr.renderRow(Object.assign({}, BASE_ROW, { scheduled: true }), {}), /class="stype"[^>]*>⏰/, 'real scheduled flag → ⏰');
});

test('renderRow renders a persistent pin control carrying the session id + pressed state', () => {
  const plain = rr.renderRow(BASE_ROW, {});
  assert.match(plain, /class="spin"[^>]*data-psess="abc12345-dead-beef-1234-567890abcdef"/, 'pin carries fullId');
  assert.match(plain, /aria-pressed="false"/, 'unpinned → not pressed');
  const pinned = rr.renderRow(Object.assign({}, BASE_ROW, { pinned: true }), {});
  assert.match(pinned, /class="srow[^"]* pinned/, 'pinned row gets the pinned class (warm rail marker)');
  assert.match(pinned, /class="spin on"[^>]*aria-pressed="true"/, 'pinned → filled + pressed');
});

// ── pin persistence (read-path; no write to the real registry file) ──────────
test('mode-registry pins persist: DEFAULT.pinned false, setPinned exported, decorate copies pinned', () => {
  assert.strictEqual(MR.DEFAULT.pinned, false, 'pin defaults to false');
  assert.strictEqual(typeof MR.setPinned, 'function', 'setPinned is exported');
  const row = MR.decorate({ fullId: 'nonexistent-test-session-xyz' }, {});
  assert.strictEqual(row.pinned, false, 'decorate defines row.pinned from persistent state');
});

// ── deep-link + wiring in the delivered webview ──────────────────────────────
test('Floor rows deep-link through openSessionTab (wave=sessão=aba); pin toggles via pinSession', () => {
  const s = scriptOf(renderHtml());
  assert.match(s, /send\(v==='all'\?'selectSession':'openSessionTab',v\)/, 'row click → openSessionTab');
  assert.match(s, /\.spin\[data-psess\][\s\S]*?send\('pinSession'/, 'pin button → pinSession (persisted host-side)');
});

test('mooter.openSessionTab is a declared, registered command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.ok((pkg.contributes.commands || []).some((c) => c.command === 'mooter.openSessionTab'), 'command declared in package.json');
  assert.match(fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8'), /registerCommand\('mooter\.openSessionTab'/, 'command registered in activate()');
});

test('Fleet Console is honest: no fleet data → no card, and it is read-only over STATE.json', () => {
  const s = scriptOf(renderHtml());
  assert.match(s, /function renderFleetConsole\(fleet\)\{\s*if\(!fleet\|\|!fleet\.count\)return ''/, 'no fleet → no fabricated card');
  assert.match(s, /_handoff\/fleet\/\*\/STATE\.json/, 'labels its read-only source');
  assert.match(s, /loop quando o último run|idle quando o último run/, 'honest freshness rule stated');
});
