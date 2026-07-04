// webview-syntax.test.js — renders getHtml() AND getLivePreviewHtml() FOR REAL
// (vm-evaluated template, exactly what the browser receives) and parses the inline
// script. v2 after the \\' incident: manual unescaping masked template-literal escape
// consumption. v3 (MP2): also guards the Live Preview App Stage webview (iframe + CSP).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadExtension() {
  // Load the WHOLE extension module with a permissive vscode stub + the REAL render
  // modules (so getHtml()/getLivePreviewHtml() resolve COWORK/MR/RR/LPV/LPS and render the
  // real webview) — then each inline script is parse-checked exactly as delivered.
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js'];
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

test('webview script parses (real template evaluation)', () => {
  const sandbox = loadExtension();
  if (typeof sandbox.getHtml !== 'function') throw new Error('getHtml not defined after module eval');
  parseInlineScript(sandbox.getHtml());
});

test('Live Preview (MP2 App Stage) webview script parses as delivered', () => {
  const sandbox = loadExtension();
  assert.strictEqual(typeof sandbox.getLivePreviewHtml, 'function', 'getLivePreviewHtml defined after module eval');
  parseInlineScript(sandbox.getLivePreviewHtml());
});

test('Live Preview CSP allows framing localhost + hosts the App Stage iframe (loop hole #2a)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml();
  // Mitigation (a): the webview CSP must let the iframe embed the local dev server.
  assert.ok(/frame-src\s+http:\/\/localhost:\*/.test(html), 'CSP frame-src must allow http://localhost:*');
  // The persistent App Stage iframe + its manual-URL override control must be present.
  assert.ok(html.includes('id="lp-frame"'), 'App Stage iframe present');
  assert.ok(html.includes('id="lp-url"'), 'manual URL override input present (port-detector cascade rung d)');
  // default-src stays locked down (no wildcard everything).
  assert.ok(html.includes("default-src 'none'"), "default-src stays 'none'");
});
