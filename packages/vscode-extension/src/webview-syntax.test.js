// webview-syntax.test.js — renders getHtml() FOR REAL (vm-evaluated template,
// exactly what the browser receives) and parses the inline script. v2 after the
// \\' incident: manual unescaping masked template-literal escape consumption.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function renderHtml() {
  // v3: load the WHOLE extension module with a permissive vscode stub + the REAL
  // render modules (cowork-waiting/mode-registry/row-renderer) so getHtml() resolves
  // COWORK/MR/RR and renders the real webview — then the inline script is parse-checked.
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (name === './cowork-waiting' || name === './mode-registry' || name === './row-renderer' || name === './arch-tree' || name === './mission-control-view' || name === './guardian-chip') return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; getHtml is hoisted */ }
  if (typeof sandbox.getHtml !== 'function') throw new Error('getHtml not defined after module eval');
  return sandbox.getHtml();
}

test('webview script parses (real template evaluation)', () => {
  const html = renderHtml();
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(m, 'script block found');
  assert.doesNotThrow(() => new vm.Script('function acquireVsCodeApi(){return{postMessage(){}}};' + m[1]), 'webview JS must parse AS DELIVERED');
});
