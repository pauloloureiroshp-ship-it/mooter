'use strict';
// lp-routing-host.test.js — C3 · MEO/routing truth:
//   COH-08 — _emitLpEvent carries REAL tier/model/cost/local (or null → n/d); an agent/cloud/deploy
//            event is NEVER local:true; a plain local trace stays local:true with tier/cost null.
//   COH-15 — a coherent lifecycle: started/succeeded/failed/cancelled ride the event as `phase`.
//   COH-09 — AUTO consults the FROZEN router: _autoResolveMode returns a concrete tier (t1/t2/t3),
//            never auto/fable/T0; degrades to {mode:'auto'} when the router is unavailable.
//   COH-17 — _invalidateBridge drops the 30s SDK/trust cache so readiness re-reads immediately.
//   COH-16 — the per-node history filter uses the full nodeKey (servedRoot + col), not just file/line/tag.
// The harness injects a CAPTURING hook-collector so the emitted events are observable.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT_SRC = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
const CAP = []; // captured HC.appendEvent payloads

function loadPanelClass() {
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const hcFake = { appendEvent: (root, ev) => { CAP.push(ev); }, eventsPath: (r) => path.join(String(r || '.'), '_handoff', 'live-preview', 'events.jsonl') };
  const realReq = require;
  const REAL = ['./live-edit-ast.js'];
  const req = (name) => {
    if (name === 'vscode') return mk();
    if (name === './hook-collector.js') return hcFake;
    if (REAL.indexOf(name) !== -1) return realReq(name);
    if (name.charAt(0) === '.') return mk();
    return realReq(name); // absolute paths (classify.js) resolve for real
  };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise, Map, Set, Number };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(EXT_SRC, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() */ }
  return vm.runInContext('typeof LivePreviewPanel === "function" ? LivePreviewPanel : null', sandbox);
}
const Panel = loadPanelClass();
function mkInst() {
  const inst = Object.create(Panel.prototype);
  inst._wsRoot = () => path.join(__dirname);
  inst._lpSid = 'sid-1';
  return inst;
}

// ── COH-08 — honest tier/model/cost/local ─────────────────────────────────────────────────────────
test('COH-08: an agent/cloud event carries the real tier/model and is NEVER local:true', () => {
  assert.ok(Panel);
  CAP.length = 0;
  const inst = mkInst();
  inst._emitLpEvent('agent', { kind: 'file', tier: 't2', model: 'claude-sonnet-4-6', local: false, cost: null });
  const e = CAP[CAP.length - 1];
  assert.strictEqual(e.local, false, 'a Sonnet agent edit is NOT local');
  assert.strictEqual(e.tier, 't2');
  assert.strictEqual(e.model, 'claude-sonnet-4-6');
  assert.strictEqual(e.cost, null, 'cost null → renderer shows n/d, never a fabricated $0');
});

test('COH-08: local:false is INFERRED from a cloud tier even if not passed explicitly', () => {
  CAP.length = 0;
  mkInst()._emitLpEvent('agent', { tier: 't3' });
  assert.strictEqual(CAP[CAP.length - 1].local, false, 'any cloud tier ⇒ not local');
});

test('COH-08: a plain LOCAL trace stays local:true with tier/model/cost null', () => {
  CAP.length = 0;
  mkInst()._emitLpEvent('pin', { kind: 'server' });
  const e = CAP[CAP.length - 1];
  assert.strictEqual(e.local, true);
  assert.strictEqual(e.tier, null);
  assert.strictEqual(e.model, null);
  assert.strictEqual(e.cost, null);
});

test('COH-08: a deploy event is never local (it publishes to production)', () => {
  CAP.length = 0;
  mkInst()._emitLpEvent('deploy', { kind: 'server', local: false, phase: 'succeeded' });
  assert.strictEqual(CAP[CAP.length - 1].local, false);
});

// ── COH-15 — lifecycle phase ──────────────────────────────────────────────────────────────────────
test('COH-15: the lifecycle phase rides the event (started/succeeded/failed/cancelled)', () => {
  CAP.length = 0;
  const inst = mkInst();
  inst._emitLpEvent('task', { kind: 'server', phase: 'started', tier: 't2', local: false });
  inst._emitLpEvent('task', { kind: 'server', phase: 'cancelled', local: false });
  assert.strictEqual(CAP[0].phase, 'started');
  assert.strictEqual(CAP[1].phase, 'cancelled');
});

// ── COH-09 — AUTO is router-native ─────────────────────────────────────────────────────────────────
test('COH-09: _autoResolveMode returns a CONCRETE tier (t1/t2/t3), never auto/fable/T0-as-mode', () => {
  const inst = mkInst();
  const prompts = ['muda a cor deste botão para azul', 'refactor the whole authentication architecture across modules', 'fix this typo', 'explain what this component does and rewrite it to be accessible'];
  let anyRouted = false;
  for (const p of prompts) {
    const r = inst._autoResolveMode(p);
    if (r.routed) {
      anyRouted = true;
      assert.ok(['t1', 't2', 't3'].indexOf(r.mode) !== -1, 'routed mode is a cloud tier ladder rung, got ' + r.mode + ' for: ' + p);
      assert.notStrictEqual(r.mode, 'fable', 'AUTO never auto-routes to Fable (T5 clamps to Opus)');
    } else {
      assert.strictEqual(r.mode, 'auto', 'unrouted → the honest Sonnet fallback');
    }
  }
  assert.ok(anyRouted, 'the frozen classifier IS reachable in-repo and routes at least one prompt');
});

test('COH-09: T5/@fable is never reached by AUTO — the mapping clamps to Opus (source contract)', () => {
  // the switch maps T5 → t3 (never 'fable'); assert the contract in source (no fable branch in AUTO).
  const body = EXT_SRC.slice(EXT_SRC.indexOf('_autoResolveMode(instruction)'), EXT_SRC.indexOf('async _taskRun'));
  assert.ok(/case 'T5': mode = 't3'/.test(body), 'T5 clamps to Opus (t3), never Fable');
  assert.ok(!/mode = 'fable'/.test(body), 'AUTO never resolves to fable');
});

test('Live Preview project-context floor: coherence against the repo never runs on Haiku', () => {
  const inst = mkInst();
  const r = inst._autoResolveMode('Valida o texto selecionado e verifica a coerência em relação ao projeto e às provas reais.');
  assert.strictEqual(r.mode, 't2', 'cross-project coherence is floored to Sonnet');
  assert.strictEqual(r.contextFloored, true, 'the host exposes why it raised the tier');
  assert.notStrictEqual(r.mode, 'fable', 'the context floor never bypasses the opt-in-only Fable invariant');
});

// ── COH-17 — bridge invalidation ───────────────────────────────────────────────────────────────────
test('COH-17: _invalidateBridge drops the 30s SDK/trust cache immediately', () => {
  const inst = mkInst();
  inst._leBridge = { available: false, reason: 'workspace-untrusted' };
  inst._leBridgeTs = 999999999999;
  inst._invalidateBridge();
  assert.strictEqual(inst._leBridge, null);
  assert.strictEqual(inst._leBridgeTs, 0);
  // and the next status re-reads (trusted now) instead of serving the stale untrusted cache
  inst._hasWorkspace = () => true;
  inst._workspaceTrusted = () => true;
  const r = inst._leBridgeStatus();
  assert.notStrictEqual(r.reason, 'workspace-untrusted', 'the fresh read reflects the granted trust, not the 30s-stale cache');
});

// ── COH-16 — the per-node history filter uses the full nodeKey ─────────────────────────────────────
test('COH-16: the node-history filter compares servedRoot (lease) + col, not just file/line/tag', () => {
  const body = EXT_SRC.slice(EXT_SRC.indexOf('function lpNodeHistoryHTML'), EXT_SRC.indexOf('function renderSelection'));
  assert.ok(/nk\.servedRoot!==lpServedRoot/.test(body), 'filters by the lease served root (no homonym worktrees)');
  assert.ok(/nk\.col!==sel\.col/.test(body), 'filters by col (disambiguates same-line siblings)');
});
