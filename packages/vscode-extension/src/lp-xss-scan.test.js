// lp-xss-scan.test.js — Review Security · LP-5. Static XSS-risk heuristic scanner: pins each
// detected pattern, the always-'warning' severity (heuristic, not proof), the snippet shape,
// no false positives on clean code, and fail-soft behaviour on garbage input.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { scanXss } = require('./lp-xss-scan.js');

test('scanXss: detects dangerouslySetInnerHTML', () => {
  const out = scanXss([{ path: 'Comp.jsx', content: '<div dangerouslySetInnerHTML={{__html: x}} />' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'dangerously-set-inner-html');
  assert.strictEqual(out[0].severity, 'warning');
});

test('scanXss: detects href="javascript: and href=\'javascript:\' in either quote style', () => {
  const out1 = scanXss([{ path: 'a.html', content: '<a href="javascript:alert(1)">x</a>' }]);
  assert.strictEqual(out1.length, 1);
  assert.strictEqual(out1[0].type, 'javascript-href');

  const out2 = scanXss([{ path: 'a.html', content: "<a href='javascript:alert(1)'>x</a>" }]);
  assert.strictEqual(out2.length, 1);
  assert.strictEqual(out2[0].type, 'javascript-href');
});

test('scanXss: detects eval( calls', () => {
  const out = scanXss([{ path: 'x.js', content: 'const result = eval(userInput);' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'eval-call');
});

test('scanXss: detects new Function( calls', () => {
  const out = scanXss([{ path: 'x.js', content: 'const f = new Function("a", "return a+1");' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].type, 'new-function');
});

test('scanXss: snippet is the trimmed matched line, bounded to 200 chars', () => {
  const padded = '   const result = eval(userInput);   ';
  const out = scanXss([{ path: 'x.js', content: padded }]);
  assert.strictEqual(out[0].snippet, padded.trim());

  const huge = 'const result = eval(' + 'a'.repeat(500) + ');';
  const out2 = scanXss([{ path: 'x.js', content: huge }]);
  assert.ok(out2[0].snippet.length <= 200, 'snippet is bounded');
});

test('scanXss: multiple findings on the same file report correct line numbers', () => {
  const content = ['const a = 1;', 'const r = eval(a);', 'const f = new Function();'].join('\n');
  const out = scanXss([{ path: 'x.js', content }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].line, 2);
  assert.strictEqual(out[1].line, 3);
});

test('scanXss: no false positives on clean code (evaluate(), newFunctionName, plain hrefs)', () => {
  const content = [
    'const r = evaluate(userInput);',
    'function newFunctionName() {}',
    '<a href="https://example.com">safe</a>',
    'element.innerHTML = sanitize(x);', // not dangerouslySetInnerHTML
  ].join('\n');
  const out = scanXss([{ path: 'clean.js', content }]);
  assert.deepStrictEqual(out, []);
});

test('scanXss: fail-soft on null, non-array, and garbage entries — never throws', () => {
  assert.deepStrictEqual(scanXss(null), []);
  assert.deepStrictEqual(scanXss(undefined), []);
  assert.deepStrictEqual(scanXss('nope'), []);
  assert.deepStrictEqual(scanXss([null, 42, {}, { path: 1, content: 2 }]), []);
});
