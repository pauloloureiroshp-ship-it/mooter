// webview-syntax.test.js — extract the inline <script> from getHtml() and
// syntax-check it (node --check only validates the HOST; the webview JS lives
// inside a template literal — this test closes that audit gap).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('webview inline script parses', () => {
  const src = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const htmlStart = src.indexOf('function getHtml()');
  const tpl = src.slice(htmlStart);
  // Pull the script body between <script nonce...> and </script>
  const m = tpl.match(/<script nonce="\$\{nonce\}">([\s\S]*?)<\/script>/);
  assert.ok(m, 'script block found');
  let body = m[1]
    .replace(/\\`/g, '`').replace(/\\\$\{/g, '${').replace(/\\\\/g, '\\');
  // acquireVsCodeApi stub so parsing context is realistic
  assert.doesNotThrow(() => new vm.Script('function acquireVsCodeApi(){return{postMessage(){}}};' + body), 'webview JS must parse');
});
