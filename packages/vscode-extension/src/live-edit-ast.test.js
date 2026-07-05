'use strict';
const { test } = require('node:test');
const assert = require('node:assert');

let AST = null, DEPS_OK = true;
try {
  AST = require('./live-edit-ast.js');
  // Probe: are recast + @babel/parser actually installed? If not, the module still loads but
  // applyEdit returns changed:false with an honest reason — we skip the behavioural asserts then.
  const probe = AST.applyEdit('const x = <div className="p-4" />;', { line: 1 }, { kind: 'setClass', classes: 'p-6' });
  DEPS_OK = probe.reason !== 'parser ausente (@babel/parser)';
} catch { DEPS_OK = false; }

// ── Pure helpers (no deps needed) ──────────────────────────────────────────
test('classGroup: same axis groups together, longest prefix wins', () => {
  assert.strictEqual(AST.classGroup('bg-blue-500'), 'bg');
  assert.strictEqual(AST.classGroup('bg-red-500'), 'bg');
  assert.strictEqual(AST.classGroup('gap-x-4'), 'gap-x');
  assert.strictEqual(AST.classGroup('min-w-0'), 'min-w');
  assert.strictEqual(AST.classGroup('hover:bg-red-500'), 'hover:bg'); // variant kept
  assert.strictEqual(AST.classGroup('flex'), 'flex');
  assert.strictEqual(AST.classGroup('some-unknown-class'), 'some-unknown-class');
});

test('mergeClasses: replaces same group, keeps the rest, appends unknown', () => {
  assert.strictEqual(AST.mergeClasses('p-4 bg-blue-500 rounded', 'bg-red-500'), 'p-4 rounded bg-red-500');
  assert.strictEqual(AST.mergeClasses('p-4 text-sm', 'p-6'), 'text-sm p-6');
  assert.strictEqual(AST.mergeClasses('flex gap-2', 'items-center'), 'flex gap-2 items-center');
  // variant does not clobber base of the same prefix
  assert.strictEqual(AST.mergeClasses('bg-blue-500', 'hover:bg-red-500'), 'bg-blue-500 hover:bg-red-500');
});

test('bumpSpacingClass: steps the Tailwind scale up and down', () => {
  assert.strictEqual(AST.bumpSpacingClass('p-4', 'p', +1), 'p-5');
  assert.strictEqual(AST.bumpSpacingClass('p-4', 'p', -1), 'p-3.5');
  assert.strictEqual(AST.bumpSpacingClass('', 'p', +1), 'p-5');   // seed from default 4, step up
  assert.strictEqual(AST.bumpSpacingClass('p-0', 'p', -1), 'p-0'); // clamp at floor
});

// ── Behavioural (needs recast + @babel/parser installed) ───────────────────
const maybe = DEPS_OK ? test : test.skip;

maybe('setClass: swaps a color class in place, touches only that line', () => {
  const src = [
    'export function Card() {',
    '  return (',
    '    <div className="p-4 bg-blue-500 rounded">',
    '      Hello',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n');
  const r = AST.applyEdit(src, { line: 3 }, { kind: 'setClass', classes: 'bg-red-500' });
  assert.strictEqual(r.changed, true, r.reason || '');
  assert.match(r.code, /className="p-4 rounded bg-red-500"/);
  assert.doesNotMatch(r.code, /bg-blue-500/);
  // Surgical: only line 3 changed.
  assert.deepStrictEqual(r.touched, [3]);
  // Untouched lines are byte-identical.
  assert.match(r.code, /\n      Hello\n/);
});

maybe('setClass: adds className when the element has none', () => {
  const src = 'const El = () => <span>hi</span>;\n';
  const r = AST.applyEdit(src, { line: 1 }, { kind: 'setClass', classes: 'text-red-500' });
  assert.strictEqual(r.changed, true, r.reason || '');
  assert.match(r.code, /<span className="text-red-500">hi<\/span>/);
});

maybe('setClass: fails CLOSED on a dynamic className (cn(...))', () => {
  const src = 'const El = () => <div className={cn("p-4", active && "bg-blue-500")}>x</div>;\n';
  const r = AST.applyEdit(src, { line: 1 }, { kind: 'setClass', classes: 'bg-red-500' });
  assert.strictEqual(r.changed, false);
  assert.match(r.reason, /dinâmico|estrutural/);
  assert.strictEqual(r.code, src); // untouched
});

maybe('setText: replaces a simple text child only', () => {
  const src = '<h1 className="title">Old Title</h1>;\n';
  const r = AST.applyEdit(src, { line: 1 }, { kind: 'setText', text: 'New Title' });
  assert.strictEqual(r.changed, true, r.reason || '');
  assert.match(r.code, />New Title</);
  assert.match(r.code, /className="title"/); // attribute preserved
});

maybe('setText: fails CLOSED when the element has non-text children', () => {
  const src = '<div><span>a</span><span>b</span></div>;\n';
  const r = AST.applyEdit(src, { line: 1 }, { kind: 'setText', text: 'nope' });
  assert.strictEqual(r.changed, false);
  assert.match(r.reason, /não-texto|estrutural/);
});

maybe('bumpSpacing: increments existing padding via the class merge path', () => {
  const src = '<div className="p-4 bg-white">x</div>;\n';
  const r = AST.applyEdit(src, { line: 1 }, { kind: 'bumpSpacing', prefix: 'p', dir: +1 });
  assert.strictEqual(r.changed, true, r.reason || '');
  assert.match(r.code, /className="bg-white p-5"/);
});

maybe('applyEdit: honest no-op when nothing matches the line', () => {
  const src = '<div className="p-4">x</div>;\n';
  const r = AST.applyEdit(src, { line: 99 }, { kind: 'setClass', classes: 'p-6' });
  assert.strictEqual(r.changed, false);
  assert.match(r.reason, /não encontrado/);
});

maybe('applyEdit: idempotent — re-applying the same class is a no-op, not a rewrite', () => {
  const src = '<div className="bg-red-500">x</div>;\n';
  const r = AST.applyEdit(src, { line: 1 }, { kind: 'setClass', classes: 'bg-red-500' });
  assert.strictEqual(r.changed, false);
  assert.match(r.reason, /sem alteração/);
});
