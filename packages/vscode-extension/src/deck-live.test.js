// deck-live.test.js — Deck Phase 4 (Vida). Gate: nvidia-smi absent ⇒ n/d (no crash) · reduced-motion
// disables every animation. Also guards the honest hardware strip (temp/CPU/Max have no source →
// n/d, never fabricated), the pipeline (5 stages, load from real git/state), the handoff flow, and
// the header cow-by-mode. Renders getHtml() FOR REAL via the shared vm harness.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
const HTML = renderHtml();
const S = HTML.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

test('hardware strip reads s.mc.gpu; nvidia-smi absent ⇒ n/d, never crashes', () => {
  assert.match(S, /function renderHwStrip/, 'strip defined');
  assert.match(S, /s\.mc&&s\.mc\.gpu/, 'reads the nvidia-smi gpu slice');
  assert.match(S, /nvidia-smi ausente/, 'absent nvidia-smi renders an n/d branch');
  assert.match(S, /gpu\.fitsMoos/, 'cabem +N moos from fitsMoos');
  // guarded at the call-site so a bad source cannot blank the cockpit
  assert.match(S, /const hwStripCard=\(function\(\)\{try\{return renderHwStrip\(s\)/, 'strip is try/guarded');
});

test('hardware strip is honest: temp/CPU/Max render n/d (no source) — never fabricated', () => {
  assert.match(S, /não reporta temperatura/, 'temp is n/d (nvidia-smi parser has no temp)');
  assert.match(S, /sem amostragem de CPU/, 'CPU is n/d (no sampling)');
  assert.match(S, /%\/sem n\/d/, 'weekly Max is n/d (no such datum)');
});

test('pipeline: 5 GSD stages, load from real git/state, bottleneck marked, spec/plan not faked', () => {
  ['spec', 'plan', 'exec', 'review', 'ship'].forEach((st) => assert.ok(S.indexOf("['" + st + "'") >= 0, st + ' stage present'));
  assert.match(S, /r\.needsYou\)st='review'/, 'review = your-turn (real)');
  assert.match(S, /aheadOfMain/, 'ship uses commits ahead of main (real git signal)');
  assert.match(S, /else if\(ahead\)st='ship'/, 'ahead → ship');
  assert.match(S, /gargalo/, 'bottleneck marker');
  assert.match(S, /derivado de git\/estado/, 'load basis stated honestly');
});

test('handoff flow: Cowork→CC→moos→Ledger with the work-aware legend', () => {
  assert.match(S, /🧠 Cowork[\s\S]{0,120}💬 CC[\s\S]{0,120}🐮 moos[\s\S]{0,120}📒 Ledger/, 'four-node river');
  assert.match(S, /nunca seca · nunca mente \(work-aware\)/, 'honest legend');
});

test('header cow animates by mode (crazy/lazy/gentle)', () => {
  assert.match(S, /#brandCow[\s\S]{0,120}s\.mode==='crazy'\?'crazy':\(s\.mode==='lazy'\?'lazy':'working'\)/, 'cow class set by mode');
  assert.match(HTML, /id="brandCow" class="livecow"/, 'header cow is a livecow');
});

test('reduced-motion kills EVERY animation, incl. the new Phase-4 ones', () => {
  assert.match(HTML, /@media \(prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{animation:none!important/, 'global kill switch present');
  assert.match(HTML, /@keyframes hoflowpart/, 'handoff particle is a CSS animation (covered by the global kill)');
});
