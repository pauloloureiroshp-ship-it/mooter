'use strict';
// live-edit-context.test.js — Context Engine Wave 2.2. Exercises the pure scoping engine against real
// temp repos: extraction, module resolution (relative + tsconfig alias), the import-scoped slice, the
// PageRank repo-map, and the combined pack. Includes the adversarial containment cases (an anchor or an
// import that escapes the workspace must never appear in the output).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const LEC = require('./live-edit-context.js');

function mkRepo(files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lec-')));
  for (const rel of Object.keys(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel], 'utf8');
  }
  return root;
}

// ── extraction ────────────────────────────────────────────────────────────────────────────────────
test('extractSpecifiers: import / export-from / require / dynamic import', () => {
  const src = [
    "import A from './a';",
    "import { b } from '../b';",
    "import './side-effect';",
    "export { c } from './c';",
    "export * from './d';",
    "const e = require('./e');",
    "const f = await import('./f');",
    "import React from 'react';", // external — still captured as a specifier
  ].join('\n');
  const specs = LEC.extractSpecifiers(src).sort();
  assert.deepStrictEqual(specs, ['../b', './a', './c', './d', './e', './f', './side-effect', 'react'].sort());
});

test('extractExports: function / const / class / default / brace list / type', () => {
  const src = [
    'export function foo() {}',
    'export const bar = 1;',
    'export class Baz {}',
    'export default function Page() {}',
    'export type T = number;',
    'export { x, y as z };',
  ].join('\n');
  const ex = LEC.extractExports(src);
  for (const n of ['foo', 'bar', 'Baz', 'Page', 'T', 'x', 'y']) assert.ok(ex.includes(n), 'has ' + n);
});

// ── resolution ──────────────────────────────────────────────────────────────────────────────────--
test('resolveLocal: relative, index, tsconfig alias; external → null', () => {
  const root = mkRepo({
    'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } }),
    'src/a.tsx': 'export const A = 1;',
    'src/util/index.ts': 'export const U = 1;',
    'src/page.tsx': "import { A } from './a'; import { U } from './util'; import X from '@/a';",
  });
  const from = path.join(root, 'src/page.tsx');
  const aliases = LEC.readAliases(root);
  assert.strictEqual(LEC.resolveLocal(from, './a', root, aliases), path.join(root, 'src/a.tsx'));
  assert.strictEqual(LEC.resolveLocal(from, './util', root, aliases), path.join(root, 'src/util/index.ts'));
  assert.strictEqual(LEC.resolveLocal(from, '@/a', root, aliases), path.join(root, 'src/a.tsx'));
  assert.strictEqual(LEC.resolveLocal(from, 'react', root, aliases), null, 'external → null');
  assert.strictEqual(LEC.resolveLocal(from, './missing', root, aliases), null, 'unresolvable → null');
});

// ── import slice ────────────────────────────────────────────────────────────────────────────────--
test('buildImportSlice: BFS follows the local import graph from the anchor, workspace-relative', () => {
  const root = mkRepo({
    'app/page.tsx': "import Hero from './Hero';\nexport default function Page(){ return <Hero/>; }",
    'app/Hero.tsx': "import { fmt } from './lib';\nexport default function Hero(){ return fmt(1); }",
    'app/lib.ts': 'export function fmt(n){ return String(n); }',
    'app/unrelated.tsx': 'export const Nope = 1;',
  });
  const r = LEC.buildImportSlice(root, 'app/page.tsx', {});
  assert.ok(r.files.includes('app/page.tsx'), 'includes the anchor');
  assert.ok(r.files.includes('app/Hero.tsx'), 'follows import → Hero');
  assert.ok(r.files.includes('app/lib.ts'), 'follows transitive import → lib');
  assert.ok(!r.files.includes('app/unrelated.tsx'), 'unrelated file NOT pulled in');
  assert.ok(r.text.includes('app/page.tsx') && !path.isAbsolute(r.text.split('\n')[0].replace(/[•↳ ]/g, '')), 'paths are workspace-relative');
  assert.ok(r.tokenEstimate > 0);
});

test('buildImportSlice: respects maxDepth and maxFiles bounds', () => {
  const root = mkRepo({
    'a.ts': "import './b';", 'b.ts': "import './c';", 'c.ts': "import './d';", 'd.ts': 'export const D=1;',
  });
  const shallow = LEC.buildImportSlice(root, 'a.ts', { maxDepth: 1 });
  assert.ok(shallow.files.includes('a.ts') && shallow.files.includes('b.ts'), 'depth 0+1 present');
  assert.ok(!shallow.files.includes('c.ts'), 'depth 2 excluded by maxDepth:1');
  const capped = LEC.buildImportSlice(root, 'a.ts', { maxDepth: 9, maxFiles: 2 });
  assert.strictEqual(capped.files.length, 2, 'maxFiles caps the slice');
});

// ── ADVERSARIAL — containment: nothing outside the workspace, ever ─────────────────────────────────
test('buildImportSlice: an anchor OUTSIDE the workspace → empty (never reads outside)', () => {
  const root = mkRepo({ 'app/page.tsx': 'export default function P(){}' });
  const r = LEC.buildImportSlice(root, '../../../etc/passwd', {});
  assert.deepStrictEqual(r, { text: '', files: [], tokenEstimate: 0 });
});

test('buildImportSlice: an import that escapes the workspace is NOT resolved/included', () => {
  const outside = mkRepo({ 'secret.ts': 'export const SECRET = 42;' }); // a sibling repo
  const root = mkRepo({
    'app/page.tsx': "import { SECRET } from '" + path.relative(path.join(mkRepo({}), 'app'), path.join(outside, 'secret')).replace(/\\/g, '/') + "';\nimport './ok';",
    'app/ok.ts': 'export const OK = 1;',
  });
  const r = LEC.buildImportSlice(root, 'app/page.tsx', {});
  assert.ok(r.files.includes('app/page.tsx'));
  assert.ok(!r.files.some((f) => f.includes('secret')), 'the out-of-workspace import is excluded');
  assert.ok(!r.text.includes('SECRET = 42'), 'secret content never leaks into the slice');
});

test('buildImportSlice: a SYMLINK/junction inside the workspace pointing OUTSIDE never leaks (realpath fence)', () => {
  const outside = mkRepo({ 'secret.ts': 'export const AWS_KEY = "AKIA-TOTALLY-SECRET-1234";' });
  const root = mkRepo({
    'app/page.tsx': "import { AWS_KEY } from './linked/secret';\nimport './ok';",
    'app/ok.ts': 'export const OK = 1;',
  });
  // Junction (no admin needed on Windows) app/linked -> the OUTSIDE repo dir. The engine must NOT read
  // through it — the runner's own fence (realpath) would deny it, so the pack must match.
  let linked = false;
  try { fs.symlinkSync(outside, path.join(root, 'app', 'linked'), 'junction'); linked = true; } catch { /* symlink unsupported here — assert what we can */ }
  const r = LEC.buildImportSlice(root, 'app/page.tsx', {});
  assert.ok(r.files.includes('app/page.tsx') && r.files.includes('app/ok.ts'), 'in-workspace imports resolve normally');
  if (linked) {
    // The secret VALUE (from the out-of-workspace file) must never appear. (The import IDENTIFIER
    // "AWS_KEY" legitimately lives in page.tsx itself, so we assert on the value, not the name.)
    assert.ok(!r.text.includes('AKIA-TOTALLY-SECRET-1234'), 'symlinked out-of-workspace CONTENT never leaks into the slice');
    assert.ok(!r.files.some((f) => f.includes('linked') || f.includes('secret')), 'the symlinked path is not resolved');
  }
});

test('buildImportSlice: bad input → empty (fail-soft, never throws)', () => {
  assert.deepStrictEqual(LEC.buildImportSlice('', 'x', {}), { text: '', files: [], tokenEstimate: 0 });
  assert.deepStrictEqual(LEC.buildImportSlice('/nope', '', {}), { text: '', files: [], tokenEstimate: 0 });
});

// ── repo-map (PageRank) ────────────────────────────────────────────────────────────────────────---
test('buildRepoMap: central (most-imported) module ranks first; exports listed; test files skipped', () => {
  const root = mkRepo({
    'lib/core.ts': 'export function core(){}\nexport const VERSION = 1;',
    'a.ts': "import { core } from './lib/core';",
    'b.ts': "import { core } from './lib/core';",
    'c.ts': "import { core } from './lib/core';",
    'a.test.ts': "import { core } from './lib/core';", // skipped by walkSources
  });
  const r = LEC.buildRepoMap(root, {});
  assert.ok(r.fileCount >= 4);
  assert.ok(r.text.includes('lib/core.ts'), 'central module in the map');
  assert.ok(r.text.includes('core') && r.text.includes('VERSION'), 'exports listed');
  assert.ok(!r.text.includes('a.test.ts'), 'test files excluded from the map');
  // core.ts is imported by 3 → should be the top-ranked line
  assert.ok(r.ranked[0].file === 'lib/core.ts', 'most-imported module ranks #1');
});

test('pageRank: a node imported by many scores higher than a leaf', () => {
  // 0←1, 0←2, 0←3 (three import node 0); node 4 imports nothing and is imported by none
  const out = [[], [0], [0], [0], []];
  const pr = LEC.pageRank(5, out, 30, 0.85);
  assert.ok(pr[0] > pr[1] && pr[0] > pr[4], 'the hub outranks its importers and an isolated node');
  const sum = pr.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, 'PageRank sums to ~1');
});

test('buildRepoMap: bounded by maxBytes / topK; empty on empty root', () => {
  const root = mkRepo({ 'a.ts': 'export const A=1;', 'b.ts': 'export const B=1;', 'c.ts': 'export const C=1;' });
  const tiny = LEC.buildRepoMap(root, { topK: 2 });
  assert.ok(tiny.text.split('\n').filter(Boolean).length <= 2, 'topK caps the lines');
  assert.deepStrictEqual(LEC.buildRepoMap(path.join(root, 'does-not-exist'), {}).ranked, []);
});

// ── combined pack ──────────────────────────────────────────────────────────────────────────────---
test('buildContextPack: combines repo-map + slice, honest header; empty when nothing resolves', () => {
  const root = mkRepo({
    'app/page.tsx': "import Hero from './Hero';\nexport default function Page(){}",
    'app/Hero.tsx': 'export default function Hero(){}',
  });
  const pack = LEC.buildContextPack(root, 'app/page.tsx', {});
  assert.ok(pack.text.includes('Repo-map'), 'has repo-map section');
  assert.ok(pack.text.includes('Ficheiros ligados'), 'has slice section');
  assert.ok(pack.text.includes('$0'), 'honest local/$0 framing');
  assert.ok(pack.tokenEstimate > 0);
  const emptyPack = LEC.buildContextPack('', '', {});
  assert.strictEqual(emptyPack.text, '', 'nothing resolvable → empty pack (agent falls back)');
});
