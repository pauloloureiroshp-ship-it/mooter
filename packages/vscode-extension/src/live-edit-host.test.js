'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const H = require('./live-edit-host.js');

test('parseInspPath: file:line:col:tag', () => {
  assert.deepStrictEqual(H.parseInspPath('src/app/page.tsx:12:4:div'),
    { file: 'src/app/page.tsx', line: 12, col: 4, tag: 'div' });
});

test('parseInspPath: survives a Windows drive colon in the path', () => {
  const r = H.parseInspPath('C:\\Users\\p\\app\\page.tsx:30:8:section');
  assert.strictEqual(r.file, 'C:\\Users\\p\\app\\page.tsx');
  assert.strictEqual(r.line, 30);
  assert.strictEqual(r.col, 8);
  assert.strictEqual(r.tag, 'section');
});

test('parseInspPath: tag-less format file:line:col', () => {
  assert.deepStrictEqual(H.parseInspPath('src/app/page.tsx:12:4'),
    { file: 'src/app/page.tsx', line: 12, col: 4, tag: null });
  // Windows, tag-less
  const w = H.parseInspPath('C:\\a\\b\\page.tsx:9:2');
  assert.strictEqual(w.file, 'C:\\a\\b\\page.tsx');
  assert.strictEqual(w.line, 9); assert.strictEqual(w.col, 2); assert.strictEqual(w.tag, null);
});

test('parseInspPath: junk → null', () => {
  assert.strictEqual(H.parseInspPath('nonsense'), null);
  assert.strictEqual(H.parseInspPath(''), null);
  assert.strictEqual(H.parseInspPath(null), null);
});

test('clampToWorkspace: accepts a source file inside the workspace', () => {
  const ws = path.resolve('/ws');
  const abs = H.clampToWorkspace(ws, 'landing/app/page.tsx');
  assert.strictEqual(abs, path.resolve(ws, 'landing/app/page.tsx'));
});

test('clampToWorkspace: accepts an absolute path inside the workspace', () => {
  const ws = path.resolve('/ws');
  const inside = path.resolve(ws, 'a/b/c.tsx');
  assert.strictEqual(H.clampToWorkspace(ws, inside), inside);
});

test('clampToWorkspace: REJECTS traversal escape', () => {
  const ws = path.resolve('/ws');
  assert.strictEqual(H.clampToWorkspace(ws, '../etc/passwd.tsx'), null);
  assert.strictEqual(H.clampToWorkspace(ws, '../../secrets.ts'), null);
});

test('clampToWorkspace: REJECTS an absolute path outside the workspace', () => {
  const ws = path.resolve('/ws');
  const outside = path.resolve('/elsewhere/evil.tsx');
  assert.strictEqual(H.clampToWorkspace(ws, outside), null);
});

test('clampToWorkspace: REJECTS a non-source extension', () => {
  const ws = path.resolve('/ws');
  assert.strictEqual(H.clampToWorkspace(ws, 'landing/.env'), null);
  assert.strictEqual(H.clampToWorkspace(ws, 'landing/package.json'), null);
  assert.strictEqual(H.clampToWorkspace(ws, 'landing/app/page.css'), null);
});

test('applyEditToFile: writes only on change and returns prev for undo', () => {
  // In-memory fs double.
  const store = { '/ws/landing/app/x.tsx': '<div className="p-4 bg-blue-500">hi</div>;\n' };
  const abs = path.resolve('/ws/landing/app/x.tsx');
  store[abs] = store['/ws/landing/app/x.tsx'];
  const fs = {
    readFileSync: (p) => { if (store[p] == null) throw new Error('ENOENT'); return store[p]; },
    writeFileSync: (p, c) => { store[p] = c; },
  };
  const ws = path.resolve('/ws');
  const r = H.applyEditToFile(fs, ws, { file: 'landing/app/x.tsx', line: 1, tag: 'div' }, { kind: 'setClass', classes: 'bg-red-500' });
  if (r.reason === 'AST indisponível' || r.reason === 'parser ausente (@babel/parser)') return; // deps not installed → skip
  assert.strictEqual(r.ok, true, r.reason || '');
  assert.strictEqual(r.changed, true, r.reason || '');
  assert.match(store[abs], /bg-red-500/);
  assert.doesNotMatch(store[abs], /bg-blue-500/);
  assert.match(r.prev, /bg-blue-500/); // rollback bytes captured
  // Undo restores exactly.
  H.undoEditToFile(fs, abs, r.prev);
  assert.match(store[abs], /bg-blue-500/);
});

test('deterministicChip: always local $0', () => {
  const c = H.deterministicChip();
  assert.strictEqual(c.local, true);
  assert.strictEqual(c.cost, 0);
  assert.match(c.label, /\$0/);
});

test('classifyInstruction: parses tier from classify.js stdout, fail-soft on junk', () => {
  const ok = H.classifyInstruction(() => JSON.stringify({ tier: 'T2', recommended_model: 'claude-sonnet' }), '/x/classify.js', 'add a carousel');
  assert.strictEqual(ok.tier, 'T2');
  assert.strictEqual(ok.local, false);
  const bad = H.classifyInstruction(() => 'not json', '/x/classify.js', 'x');
  assert.strictEqual(bad, null);
});
