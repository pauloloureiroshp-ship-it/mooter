'use strict';
// dcv2-tabs.test.js — Director's Cut v2 · F2, Unit B.
// Structural guard: the #lp-dc mount is a real tablist with 4 panes, the 3 new lens renderers
// are serialised into the webview (concat-only, exactly like the existing renderX serialisations),
// and the tab state machine (setTab/renderLens) is wired in — while the inline script still
// PARSES as delivered. Mirrors webview-syntax.test.js's loadExtension()/parseInlineScript harness.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadExtension() {
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-diagnostics.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the getters are hoisted */ }
  return sandbox;
}

function parseInlineScript(html) {
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(m, 'script block found');
  assert.doesNotThrow(() => new vm.Script('function acquireVsCodeApi(){return{postMessage(){}}};' + m[1]), 'webview JS must parse AS DELIVERED');
}

test('Live Preview #lp-dc: real tablist with exactly 4 data-tab chips (stream/day/model/fleet)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  assert.ok(html.includes('role="tablist"'), 'tablist role present');
  const chips = html.match(/data-tab="/g) || [];
  assert.strictEqual(chips.length, 4, 'exactly 4 data-tab chips');
  for (const tab of ['stream', 'day', 'model', 'fleet']) {
    assert.ok(html.includes('data-tab="' + tab + '"'), 'data-tab="' + tab + '" present');
  }
});

test('Live Preview: the 3 new lens renderers are serialised into the webview', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  assert.ok(html.includes('const renderDayBreakdown='), 'renderDayBreakdown serialised');
  assert.ok(html.includes('const renderModelBreakdown='), 'renderModelBreakdown serialised');
  assert.ok(html.includes('const renderFleetLanes='), 'renderFleetLanes serialised');
});

test('Live Preview: tab state machine (setTab/renderLens) is wired in', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  assert.ok(/function setTab\(/.test(html), 'setTab defined');
  assert.ok(/function renderLens\(/.test(html), 'renderLens defined');
});

test('Live Preview: the inline script (with the 4 new tabs/panes + 3 serialised lenses) still parses as delivered', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  parseInlineScript(html);
});
