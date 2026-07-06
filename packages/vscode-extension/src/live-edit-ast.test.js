'use strict';
// live-edit-ast.test.js — MP5.1 deterministic $0 edit engine. Proves the byte-splice preserves
// surrounding formatting exactly, edits the right node, and REFUSES anything non-deterministic
// (mixed/dynamic content) with an honest reason instead of producing a wrong edit.
const { test } = require('node:test');
const assert = require('node:assert');
const { applyDeterministicEdit, locate, collectJsxElements } = require('./live-edit-ast.js');

const SRC = [
  'export default function P() {',
  '  return (',
  '    <div className="a b">',
  '      Hello',
  '    </div>',
  '  );',
  '}',
  '',
].join('\n');

test('text edit replaces the content and keeps the exact surrounding whitespace', () => {
  const r = applyDeterministicEdit(SRC, { line: 3, col: 4, tag: 'div' }, { kind: 'text', value: 'Olá mundo' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.changed, true);
  assert.ok(r.code.includes('<div className="a b">\n      Olá mundo\n    </div>'), r.code);
  // every other byte is untouched
  assert.ok(r.code.startsWith('export default function P() {'));
});

test('class edit splices the inner span, leaving the rest of the line intact', () => {
  const r = applyDeterministicEdit(SRC, { line: 3, tag: 'div' }, { kind: 'class', value: 'a b c' });
  assert.strictEqual(r.ok, true);
  assert.ok(r.code.includes('<div className="a b c">'), r.code);
  assert.ok(r.code.includes('\n      Hello\n'), 'text child untouched');
});

test('class insert when the element has no className, right after the tag name', () => {
  const src = '<button onClick={x}>Go</button>';
  const r = applyDeterministicEdit(src, { line: 1, tag: 'button' }, { kind: 'class', value: 'btn' });
  assert.strictEqual(r.ok, true);
  assert.ok(r.code.startsWith('<button className="btn" onClick={x}>'), r.code);
});

test('dynamic className ({expr}) is refused — that is the LLM path, not a deterministic edit', () => {
  const src = '<div className={cls}>Hi</div>';
  const r = applyDeterministicEdit(src, { line: 1, tag: 'div' }, { kind: 'class', value: 'x' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'dynamic-classname');
});

test('mixed content (text + element) is refused for a text edit', () => {
  const src = '<div>Hi <b>x</b></div>';
  const r = applyDeterministicEdit(src, { line: 1, tag: 'div' }, { kind: 'text', value: 'Yo' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not-simple-text');
});

test('an expression-only child ({x}) is refused for a text edit', () => {
  const src = '<span>{count}</span>';
  const r = applyDeterministicEdit(src, { line: 1, tag: 'span' }, { kind: 'text', value: 'Yo' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not-simple-text');
});

test('unsafe text (JSX-significant chars) is refused', () => {
  const r = applyDeterministicEdit(SRC, { line: 3, tag: 'div' }, { kind: 'text', value: 'a <b> c' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'unsafe-text');
});

test('locate picks the right element on a shared line by tag then nearest column', () => {
  const src = '<a href="/x"><span>one</span><span>two</span></a>';
  const els = collectJsxElements(require('@babel/parser').parse(src, { plugins: ['jsx', 'typescript'], sourceType: 'module' }));
  const first = src.indexOf('<span>');
  const second = src.indexOf('<span>', first + 1);
  const a = locate(els, { line: 1, tag: 'span', col: first });
  const b = locate(els, { line: 1, tag: 'span', col: second });
  assert.ok(a && a.children[0].value === 'one');
  assert.ok(b && b.children[0].value === 'two');
});

test('not-found when the line has no JSX element; never throws', () => {
  const r = applyDeterministicEdit(SRC, { line: 1, tag: 'div' }, { kind: 'class', value: 'x' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not-found');
});

test('parse error → honest {ok:false, reason:"parse-error"}, never throws', () => {
  const r = applyDeterministicEdit('<div className=', { line: 1 }, { kind: 'class', value: 'x' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'parse-error');
});

test('typescript + tsx generics parse and edit', () => {
  const src = 'const C = () => <div className="p-2">t</div>;\nfunction f<T>(x: T): T { return x; }\n';
  const r = applyDeterministicEdit(src, { line: 1, tag: 'div' }, { kind: 'class', value: 'p-4' });
  assert.strictEqual(r.ok, true);
  assert.ok(r.code.includes('className="p-4"'));
  assert.ok(r.code.includes('function f<T>(x: T): T'));
});

test('bad inputs are refused, never thrown', () => {
  assert.strictEqual(applyDeterministicEdit('', { line: 1 }, { kind: 'text', value: 'x' }).ok, false);
  assert.strictEqual(applyDeterministicEdit(SRC, { line: 3 }, null).ok, false);
  assert.strictEqual(applyDeterministicEdit(SRC, { line: 3, tag: 'div' }, { kind: 'nope', value: 'x' }).reason, 'unknown-kind');
});
