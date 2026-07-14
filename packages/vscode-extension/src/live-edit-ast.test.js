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

// ── MP5.2a — locateRange / deleteNode / spliceNodeRange (the byte-bounded AST fence) ────────────

const { locateRange, deleteNode, spliceNodeRange, insertImports } = require('./live-edit-ast.js');

const LINES52 = [
  'export default function P() {',
  '  return (',
  '    <section className="s">',
  '      <img src="/a.png" alt="a" />',
  '      <p>keep me</p>',
  '    </section>',
  '  );',
  '}',
  '',
];
const SRC52 = LINES52.join('\n');

test('locateRange resolves the exact byte span of the node subtree', () => {
  const r = locateRange(SRC52, { line: 4, tag: 'img' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(SRC52.slice(r.start, r.end), '<img src="/a.png" alt="a" />');
  const s = locateRange(SRC52, { line: 3, tag: 'section' });
  assert.strictEqual(s.ok, true);
  assert.ok(SRC52.slice(s.start, s.end).startsWith('<section'), 'span starts at the opening tag');
  assert.ok(SRC52.slice(s.start, s.end).endsWith('</section>'), 'span covers the whole subtree');
});

test('locateRange is fail-soft: no-source / not-found / parse-error, never throws', () => {
  assert.strictEqual(locateRange('', { line: 1 }).reason, 'no-source');
  assert.strictEqual(locateRange('const x = 1;\n', { line: 1 }).reason, 'not-found');
  assert.strictEqual(locateRange('<div className=', { line: 1 }).reason, 'parse-error');
});

test('rebaseTargetStamp follows the exact JSX node when imports move its source line', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = 'import x from "x";\n\nexport default () => (\n  <main>\n    <p>Hero</p>\n  </main>\n);\n';
  const after = 'import x from "x";\nimport y from "y";\nimport z from "z";\n\nexport default () => (\n  <main>\n    <p>Hero melhorado</p>\n  </main>\n);\n';
  const r = rebaseTargetStamp(before, after, { line: 5, col: 4, tag: 'p' });
  assert.deepStrictEqual({ ok: r.ok, line: r.line, col: r.col, tag: r.tag }, { ok: true, line: 7, col: 4, tag: 'p' });
  assert.strictEqual(r.shifted, true);
});

test('rebaseTargetStamp keeps structural identity when the selected root tag changes', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = 'export default () => <section><img alt="moo" /><p>keep</p></section>;';
  const after = 'export default () => <section><figure><span>moo</span></figure><p>keep</p></section>;';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<img'), tag: 'img' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.line, 1);
  assert.strictEqual(r.tag, 'figure');
});

test('rebaseTargetStamp fails closed when the old source node no longer exists', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const r = rebaseTargetStamp('<main><p>x</p></main>', '<main><p>x</p></main>', { line: 9, tag: 'p' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'not-found');
});

test('rebaseTargetStamp never moves the border onto a same-tag sibling after deletion', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main><p>selected A</p><p>unrelated B</p></main>';
  const after = '<main><p>unrelated B</p></main>';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<p>'), tag: 'p' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'node-removed');
});

test('rebaseTargetStamp fails closed when identical repeated siblings become structurally ambiguous', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main><p>same</p><p>same</p></main>';
  const after = '<main><p>same</p></main>';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<p>'), tag: 'p' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'ambiguous-after');
});

test('rebaseTargetStamp maps the selected same-line sibling past an inserted same-tag node', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main><p>A</p><p>B</p></main>';
  const after = '<main><p>A</p><p>X</p><p>B changed</p></main>';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<p>B'), tag: 'p' });
  assert.deepStrictEqual(
    { ok: r.ok, line: r.line, col: r.col, tag: r.tag },
    { ok: true, line: 1, col: after.indexOf('<p>B changed'), tag: 'p' },
  );
});

test('rebaseTargetStamp gives selected text more identity weight than shared Tailwind attributes', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const cls = 'text-sm font-medium tracking-tight text-white';
  const before = '<main><p className="' + cls + '">A</p><p className="' + cls + '">B</p></main>';
  const after = '<main><p className="' + cls + '">A</p><p className="' + cls + '">X</p><p className="' + cls + '">B changed</p></main>';
  const targetCol = before.indexOf('<p className', before.indexOf('<p className') + 1);
  const r = rebaseTargetStamp(before, after, { line: 1, col: targetCol, tag: 'p' });
  const firstAfter = after.indexOf('<p className');
  const secondAfter = after.indexOf('<p className', firstAfter + 1);
  const thirdAfter = after.indexOf('<p className', secondAfter + 1);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.col, thirdAfter);
});

test('rebaseTargetStamp keeps the selected node when a same-tag sibling is inserted after it', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main><p>A</p><p>B</p></main>';
  const after = '<main><p>A</p><p>B changed</p><p>X</p></main>';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<p>B'), tag: 'p' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.col, after.indexOf('<p>B changed'));
});

test('rebaseTargetStamp maps a multiline target after a same-tag insertion above it', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main>\n  <p>A</p>\n  <p>B</p>\n</main>\n';
  const after = '<main>\n  <p>A</p>\n  <p>X</p>\n  <p>B changed</p>\n</main>\n';
  const r = rebaseTargetStamp(before, after, { line: 3, col: 2, tag: 'p' });
  assert.deepStrictEqual(
    { ok: r.ok, line: r.line, col: r.col, tag: r.tag },
    { ok: true, line: 4, col: 2, tag: 'p' },
  );
});

test('rebaseTargetStamp follows a uniquely identifiable target through sibling reordering', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main><p>A</p><p>B</p><p>C</p></main>';
  const after = '<main><p>B changed</p><p>A</p><p>C</p></main>';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<p>B'), tag: 'p' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.col, after.indexOf('<p>B changed'));
});

test('rebaseTargetStamp fails closed when an edit creates duplicate plausible targets', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main><p>A</p><p>B</p></main>';
  const after = '<main><p>A</p><p>B changed</p><p>B changed</p></main>';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<p>B'), tag: 'p' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'ambiguous-after');
});

test('rebaseTargetStamp refuses an insertion when neither new sibling proves target identity', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const before = '<main><p>A</p><p>B</p></main>';
  const after = '<main><p>A</p><p>X</p><p>Y</p></main>';
  const r = rebaseTargetStamp(before, after, { line: 1, col: before.indexOf('<p>B'), tag: 'p' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'ambiguous-after');
});

test('rebaseTargetStamp keeps the exact selected duplicate when source bytes are unchanged', () => {
  const { rebaseTargetStamp } = require('./live-edit-ast.js');
  const source = '<main><p>same</p><p>same</p></main>';
  const second = source.indexOf('<p>', source.indexOf('<p>') + 1);
  const r = rebaseTargetStamp(source, source, { line: 1, col: second, tag: 'p' });
  assert.deepStrictEqual({ ok: r.ok, line: r.line, col: r.col, tag: r.tag }, { ok: true, line: 1, col: second, tag: 'p' });
});

test('deleteNode removes the node AND its orphaned line — byte-exact, siblings preserved', () => {
  const r = deleteNode(SRC52, { line: 4, tag: 'img' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kind, 'delete');
  assert.strictEqual(r.changed, true);
  const expected = LINES52.filter((_, i) => i !== 3).join('\n'); // the img line is gone, nothing else
  assert.strictEqual(r.code, expected);
  assert.ok(r.code.includes('<p>keep me</p>'), 'sibling survives');
});

test('deleteNode on an inline element removes only its own bytes (line kept for siblings)', () => {
  const src = '<div>Hi <b>x</b> there</div>';
  const r = deleteNode(src, { line: 1, tag: 'b' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.code, '<div>Hi  there</div>');
});

test('deleteNode refuses a delete that would break the parse (honest, fail-closed)', () => {
  const src = 'export default function P() {\n  return (\n    <div>only</div>\n  );\n}\n';
  const r = deleteNode(src, { line: 3, tag: 'div' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'delete-breaks-parse');
});

test('deleteNode passes through locate failures, never throws', () => {
  assert.strictEqual(deleteNode(SRC52, { line: 1 }).reason, 'not-found');
  assert.strictEqual(deleteNode('', { line: 1 }).reason, 'no-source');
});

test('spliceNodeRange replaces exactly the node span, every other byte untouched', () => {
  const loc = locateRange(SRC52, { line: 4, tag: 'img' });
  const r = spliceNodeRange(SRC52, { start: loc.start, end: loc.end }, '<img src="/b.png" alt="b" />');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.kind, 'splice');
  assert.strictEqual(r.code, SRC52.replace('<img src="/a.png" alt="a" />', '<img src="/b.png" alt="b" />'));
});

test('spliceNodeRange rejects a replacement that does not parse — never writes', () => {
  const loc = locateRange(SRC52, { line: 4, tag: 'img' });
  const r = spliceNodeRange(SRC52, { start: loc.start, end: loc.end }, '<img src=');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'replacement-parse-error');
  assert.strictEqual('code' in r, false);
});

test('spliceNodeRange rejects a multi-root replacement — never writes', () => {
  const loc = locateRange(SRC52, { line: 4, tag: 'img' });
  const r = spliceNodeRange(SRC52, { start: loc.start, end: loc.end }, '<i>a</i>\n<i>b</i>');
  assert.strictEqual(r.ok, false);
  assert.strictEqual('code' in r, false);
});

test('spliceNodeRange rejects a non-element replacement (expression, prose)', () => {
  const loc = locateRange(SRC52, { line: 4, tag: 'img' });
  assert.strictEqual(spliceNodeRange(SRC52, { start: loc.start, end: loc.end }, '42').reason, 'not-single-root');
  assert.strictEqual(spliceNodeRange(SRC52, { start: loc.start, end: loc.end }, '').reason, 'empty-replacement');
});

test('spliceNodeRange rejects a replacement smuggling comments — the fence cannot be escaped', () => {
  // A trailing `//` parses standalone AND re-parses after the splice, but would comment OUT
  // sibling code beyond the span — the one byte-bounded write that still hurts outside bytes.
  const loc = locateRange(SRC52, { line: 4, tag: 'img' });
  const r1 = spliceNodeRange(SRC52, { start: loc.start, end: loc.end }, '<img alt="x" /> //');
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.reason, 'replacement-has-comments');
  const r2 = spliceNodeRange(SRC52, { start: loc.start, end: loc.end }, '/* pre */ <img alt="x" />');
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.reason, 'replacement-has-comments');
});

test('isInsideExpression flags a node inside {…} (.map / ternary) and not a plain child', () => {
  const { isInsideExpression } = require('./live-edit-ast.js');
  const src = '<ul>\n  {items.map((i) => <li key={i}>x</li>)}\n</ul>';
  assert.strictEqual(isInsideExpression(src, { line: 2, tag: 'li' }), true);
  assert.strictEqual(isInsideExpression(SRC52, { line: 4, tag: 'img' }), false);
  assert.strictEqual(isInsideExpression('', { line: 1 }), false); // fail-soft, never a fabricated warning
});

test('spliceNodeRange rejects a fabricated range — only a real node span can be written', () => {
  const loc = locateRange(SRC52, { line: 4, tag: 'img' });
  const r = spliceNodeRange(SRC52, { start: loc.start + 1, end: loc.end }, '<img alt="x" />');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'range-not-a-node');
});

test('spliceNodeRange rejects malformed ranges and junk inputs, never throws', () => {
  assert.strictEqual(spliceNodeRange('', null, '<a />').reason, 'no-source');
  assert.strictEqual(spliceNodeRange(SRC52, null, '<a />').reason, 'bad-range');
  assert.strictEqual(spliceNodeRange(SRC52, { start: -1, end: 5 }, '<a />').reason, 'bad-range');
  assert.strictEqual(spliceNodeRange(SRC52, { start: 5, end: 5 }, '<a />').reason, 'bad-range');
  assert.strictEqual(spliceNodeRange(SRC52, { start: 0, end: SRC52.length }, '<a />').reason, 'range-not-a-node');
});

test('diffRemovedLines reports exactly the spliced lines (whole-line delete → removed only)', () => {
  const { diffRemovedLines } = require('./live-edit-ast.js');
  const del = deleteNode(SRC52, { line: 4, tag: 'img' });
  const d = diffRemovedLines(SRC52, del.code);
  assert.deepStrictEqual(d, { start: 4, removed: ['      <img src="/a.png" alt="a" />'], added: [] });
});

test('diffRemovedLines on an inline delete shows the before/after of the single touched line', () => {
  const { diffRemovedLines } = require('./live-edit-ast.js');
  const d = diffRemovedLines('<div>Hi <b>x</b> there</div>', '<div>Hi  there</div>');
  assert.deepStrictEqual(d, { start: 1, removed: ['<div>Hi <b>x</b> there</div>'], added: ['<div>Hi  there</div>'] });
});

test('diffRemovedLines is fail-soft: identical/empty inputs → empty diff, never throws', () => {
  const { diffRemovedLines } = require('./live-edit-ast.js');
  assert.deepStrictEqual(diffRemovedLines(SRC52, SRC52).removed, []);
  assert.deepStrictEqual(diffRemovedLines(null, undefined).removed, []);
});

test('MP5.1 exports are untouched by the MP5.2a additions (engine freeze honoured)', () => {
  const LEA = require('./live-edit-ast.js');
  for (const k of ['applyDeterministicEdit', 'editText', 'editClass', 'locate', 'collectJsxElements', 'tagNameOf']) {
    assert.strictEqual(typeof LEA[k], 'function', k + ' still exported');
  }
});

// ── LP-4.7 — insertImports (the only path a VERIFIED new import takes into the file) ───────────

const IMP_SRC = [
  "'use client';",
  "import { useState } from 'react';",
  "import Link from 'next/link';",
  '',
  'export default function P() {',
  '  return <div>hi</div>;',
  '}',
  '',
].join('\n');

test('insertImports lands after the LAST existing import; result re-parses; bytes elsewhere intact', () => {
  const r = insertImports(IMP_SRC, ["import { siGithub } from 'simple-icons'"]);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.changed, true);
  const lines = r.code.split('\n');
  assert.strictEqual(lines[3], "import { siGithub } from 'simple-icons'", 'right below next/link');
  assert.ok(r.code.indexOf("'use client';") === 0, 'directive untouched at byte 0');
  assert.ok(r.code.endsWith('}\n'), 'tail untouched');
  assert.deepStrictEqual(r.inserted, ["import { siGithub } from 'simple-icons'"]);
});

test('insertImports without existing imports goes AFTER the directive (never before use client)', () => {
  const src = "'use client';\nexport default function P(){ return <b>x</b>; }\n";
  const r = insertImports(src, ["import { Star } from 'lucide-react'"]);
  assert.strictEqual(r.ok, true);
  assert.ok(r.code.startsWith("'use client';\nimport { Star } from 'lucide-react'"), r.code.slice(0, 80));
});

test('insertImports with no directive and no imports prepends at byte 0', () => {
  const src = 'export default function P(){ return <b>x</b>; }\n';
  const r = insertImports(src, ["import x from 'react'"]);
  assert.strictEqual(r.ok, true);
  assert.ok(r.code.startsWith("import x from 'react'\n"));
});

test('insertImports is idempotent: fully-bound statements skip; partial collision refuses', () => {
  const same = insertImports(IMP_SRC, ["import { useState } from 'react'"]);
  assert.strictEqual(same.ok, true);
  assert.strictEqual(same.changed, false, 'already imported → no write');
  const mixed = insertImports(IMP_SRC, ["import { useState, useEffect } from 'react'"]);
  assert.strictEqual(mixed.ok, false);
  assert.strictEqual(mixed.reason, 'import-conflicts');
  const dupNew = insertImports(IMP_SRC, ["import { A } from 'a'", "import { A } from 'b'"]);
  assert.strictEqual(dupNew.ok, false, 'two NEW statements binding the same local cannot both land');
});

test('insertImports refuses smuggling — comments, junk, non-imports — and junk inputs', () => {
  assert.strictEqual(insertImports(IMP_SRC, ["import a from 'x' // hi"]).reason, 'import-has-comments');
  assert.strictEqual(insertImports(IMP_SRC, ["import a from 'x'; alert(1)"]).reason, 'not-an-import');
  assert.strictEqual(insertImports(IMP_SRC, ['const a = 1']).reason, 'not-an-import');
  assert.strictEqual(insertImports(IMP_SRC, ['import {']).reason, 'import-parse-error');
  assert.strictEqual(insertImports('', ["import a from 'x'"]).reason, 'no-source');
  assert.strictEqual(insertImports(IMP_SRC, 'not-array').reason, 'bad-imports');
  assert.strictEqual(insertImports(IMP_SRC, []).changed, false);
});
