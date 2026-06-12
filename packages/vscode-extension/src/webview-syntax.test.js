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
  const src = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const i = src.indexOf('function getHtml()');
  const fnSrc = src.slice(i);
  const ctx = { Math, String, require: () => ({}) };
  vm.createContext(ctx);
  return vm.runInContext(fnSrc + '; getHtml()', ctx);
}

test('webview script parses (real template evaluation)', () => {
  const html = renderHtml();
  const m = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  assert.ok(m, 'script block found');
  assert.doesNotThrow(() => new vm.Script('function acquireVsCodeApi(){return{postMessage(){}}};' + m[1]), 'webview JS must parse AS DELIVERED');
});
