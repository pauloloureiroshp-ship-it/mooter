// honest-controls.test.js — Wave HONEST-CONTROLS (node --test).
// The bug: every session in a SHARED working tree claimed the same dirt as its own "unsaved work",
// and the inbox counted SESSIONS not repos. This suite proves the fix — per-session attribution
// (touchedFiles ∩ gitStage.files), repo-level inbox counting, and honest copy — with fixtures that
// mirror the real 2026-07-04 case (8+ badges, 0 code to save; dirt = SYNC.md/_handoff/package.json).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const x = require('./host-extra.js');
const rr = require('./row-renderer');

// ── webview-sim harness: deserialize renderRow exactly as getHtml() does (fn.toString + new Function) ──
function _wv_esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function _wv_agoFmt(ms){ const t=Math.round((+ms||0)/1000); return t<60?t+'s':Math.round(t/60)+'m'; }
function _wv_modelLabel(m){ return String(m||'').replace(/^claude-/,'').replace(/-/g,' '); }
function _wv_stageColor(){ return 'var(--vscode-descriptionForeground)'; }
function _wv_famEmoji(){ return '✨'; }
const _wvRenderRow = new Function('esc','agoFmt','famEmoji','modelLabel','stageColor','deriveStages','STAGE_META',
  'return (' + rr.renderRow.toString() + ')')(
  _wv_esc, _wv_agoFmt, _wv_famEmoji, _wv_modelLabel, _wv_stageColor, rr.deriveStages, rr.STAGE_META);

const BASE_ROW = {
  fullId: 'sess0001-dead-beef-1234-567890abcdef', id: 'sess0001', name: 'a session',
  mode: 'moo', model: 'claude-opus-4-6', working: false, needsYou: false, waitingForCowork: false,
  ageMs: 60000, branch: 'wave/x', cwd: 'C:\\Users\\p\\frugal', pr: null, worktree: null,
};
function row(over){ return Object.assign({}, BASE_ROW, over); }

// ── D1: extractTouchedFiles ─────────────────────────────────────────────────────
function line(role, blocks){ return JSON.stringify({ message: { role, content: blocks } }); }
function toolUse(name, input){ return { type: 'tool_use', name, input }; }

test('extractTouchedFiles: collects Edit/Write/NotebookEdit file_path; ignores Read/Grep/Bash', () => {
  const lines = [
    line('assistant', [toolUse('Read', { file_path: 'C:\\r\\a.js' })]),
    line('assistant', [toolUse('Edit', { file_path: 'C:\\r\\SYNC.md' })]),
    line('assistant', [toolUse('Grep', { pattern: 'x' })]),
    line('assistant', [toolUse('Write', { file_path: 'C:\\r\\b.ts' })]),
    line('assistant', [toolUse('NotebookEdit', { notebook_path: 'C:\\r\\n.ipynb' })]),
    line('assistant', [toolUse('Bash', { command: 'ls' })]),
  ];
  const t = x.extractTouchedFiles(lines);
  assert.deepEqual(t, ['C:\\r\\SYNC.md', 'C:\\r\\b.ts', 'C:\\r\\n.ipynb']);
});

test('extractTouchedFiles: dedupes repeats, tolerates garbage/user lines, never throws', () => {
  const lines = [
    'NOT JSON{{',
    line('user', [{ type: 'text', text: 'go' }]),
    line('assistant', [toolUse('Edit', { file_path: 'a.js' }), toolUse('Edit', { file_path: 'a.js' })]),
    line('assistant', [toolUse('Edit', { file_path: 'a.js' })]),
  ];
  assert.deepEqual(x.extractTouchedFiles(lines), ['a.js']);
  assert.deepEqual(x.extractTouchedFiles(null), []);
  assert.deepEqual(x.extractTouchedFiles(['{}']), []);
});

test('extractTouchedFiles: caps at 200 paths', () => {
  const blocks = [];
  for (let i = 0; i < 500; i++) blocks.push(toolUse('Edit', { file_path: 'f' + i + '.js' }));
  assert.equal(x.extractTouchedFiles([line('assistant', blocks)]).length, 200);
});

// ── D1: _relForCwd + sessionUnsaved (the attribution core) ───────────────────────
test('_relForCwd: absolute path under cwd → repo-relative, forward-slashed; outside → unchanged', () => {
  assert.equal(x._relForCwd('C:\\Users\\p\\frugal\\SYNC.md', 'C:\\Users\\p\\frugal'), 'SYNC.md');
  assert.equal(x._relForCwd('C:\\Users\\p\\frugal\\a\\b.ts', 'C:\\Users\\p\\frugal'), 'a/b.ts');
  assert.equal(x._relForCwd('D:\\other\\x.js', 'C:\\Users\\p\\frugal'), 'D:/other/x.js');
});

test('sessionUnsaved: intersection of this session\'s edits with the porcelain dirt (case-insensitive)', () => {
  const gitFiles = [{ x: ' ', y: 'M', path: 'SYNC.md' }, { x: ' ', y: 'M', path: 'packages/vscode-extension/package.json' }];
  // session edited SYNC.md (absolute) + a file that is NOT dirty → only SYNC.md intersects
  const touched = ['C:\\Users\\p\\frugal\\SYNC.md', 'C:\\Users\\p\\frugal\\src\\clean.ts'];
  assert.deepEqual(x.sessionUnsaved(touched, gitFiles, 'C:\\Users\\p\\frugal'), ['SYNC.md']);
});

test('sessionUnsaved: session touched NONE of the dirty files → [] (the shared-tree false positive)', () => {
  const gitFiles = [{ x: ' ', y: 'M', path: 'SYNC.md' }, { x: '?', y: '?', path: '_handoff/x.md' }];
  const touched = ['C:\\Users\\p\\frugal\\packages\\router\\src\\decide-agent.ts']; // real edits, but none dirty here
  assert.deepEqual(x.sessionUnsaved(touched, gitFiles, 'C:\\Users\\p\\frugal'), []);
});

test('sessionUnsaved: empty/absent inputs → [] (never throws)', () => {
  assert.deepEqual(x.sessionUnsaved([], [{ path: 'a' }], 'C:\\x'), []);
  assert.deepEqual(x.sessionUnsaved(['a'], [], 'C:\\x'), []);
  assert.deepEqual(x.sessionUnsaved(null, null, null), []);
});

// ── D1: gitStage now exposes files ───────────────────────────────────────────────
test('gitStage: real repo → files is an array of {x,y,path} (additive, never undefined)', async () => {
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const gs = await x.gitStage(projectRoot);
  assert.ok(gs && Array.isArray(gs.files), 'gitStage.files must be an array');
  for (const f of gs.files) { assert.equal(typeof f.path, 'string'); assert.ok('x' in f && 'y' in f); }
});

// ── D3: deriveStages attribution (repo-fact vs amber, back-compat) ───────────────
const DIRTY = { state: 'uncommitted', dirty: 3, staged: 0, ahead: 0, behind: 0 };

test('deriveStages: attr ABSENT → byte-identical old behaviour (amber + Save my work)', () => {
  const r = rr.deriveStages(DIRTY, 'main');
  assert.equal(r.safe.level, 'amber');
  assert.equal(r.safe.action, 'gitFlow');
  assert.equal(r.safe.move, 'Save my work');
  assert.equal(r.safe.repoFact, undefined, 'no repoFact key when attr absent');
});

test('deriveStages: unsavedOwn>0 → amber + Save my work (this session owns the dirt)', () => {
  const r = rr.deriveStages(DIRTY, 'main', { unsavedOwn: 2, partial: false });
  assert.equal(r.safe.level, 'amber');
  assert.equal(r.safe.action, 'gitFlow');
  assert.equal(r.safe.move, 'Save my work');
});

test('deriveStages: dirty tree but unsavedOwn===0 → repo level, NO gitFlow action, NO Save move', () => {
  const r = rr.deriveStages(DIRTY, 'main', { unsavedOwn: 0, partial: false });
  assert.equal(r.safe.level, 'repo');
  assert.equal(r.safe.action, null, 'no per-session CTA when the dirt is not this session\'s');
  assert.equal(r.safe.move, undefined);
  assert.equal(r.safe.repoFact, true);
  assert.match(r.safe.label, /3 uncommitted/);
});

test('deriveStages: unsavedOwn===0 + partial tail → repo level flagged partial (honest degrade)', () => {
  const r = rr.deriveStages(DIRTY, 'main', { unsavedOwn: 0, partial: true });
  assert.equal(r.safe.level, 'repo');
  assert.equal(r.safe.partial, true);
});

test('deriveStages: clean tree + attr → green (attribution never fabricates dirt)', () => {
  const r = rr.deriveStages({ state: 'clean', dirty: 0, staged: 0, ahead: 0, behind: 0 }, 'main', { unsavedOwn: 0 });
  assert.equal(r.safe.level, 'green');
});

// ── D3: renderRow honest copy (webview path) ─────────────────────────────────────
test('GATE#2 renderRow: dirty + unsavedOwn present → "Save my work" + gitFlow', () => {
  const html = _wvRenderRow(row({ gitStage: { state: 'uncommitted', dirty: 2, staged: 0, ahead: 0, behind: 0, files: [{ x: ' ', y: 'M', path: 'a.ts' }] }, touchedFiles: ['a.ts'], unsavedOwn: ['a.ts'], touchedPartial: false }), {});
  assert.ok(html.includes('Save my work'), 'own dirt → Save my work button renders');
  assert.ok(html.includes('class="ssafe amber"'), 'own dirt → amber chip');
});

test('GATE#1 renderRow: dirty tree but unsavedOwn=[] → NO "Save my work", repo-fact chip, no scary tip', () => {
  const html = _wvRenderRow(row({ gitStage: { state: 'uncommitted', dirty: 3, staged: 0, ahead: 0, behind: 0, files: [{ x: ' ', y: 'M', path: 'SYNC.md' }] }, touchedFiles: [], unsavedOwn: [], touchedPartial: false }), {});
  assert.ok(!html.includes('Save my work'), 'no per-session Save CTA when the dirt is not this session\'s');
  assert.ok(html.includes('class="ssafe repo"'), 'repo-fact chip renders instead of amber');
  assert.ok(!html.includes('não fechar'), 'no "don\'t close — you\'ll lose work" tip when nothing is this session\'s');
  assert.ok(!html.includes('changed your files'), 'copy must not assert THIS session changed the files');
});

test('renderRow: no touchedFiles field (legacy/host-less row) → back-compat amber + Save my work', () => {
  const html = _wvRenderRow(row({ gitStage: { state: 'uncommitted', dirty: 1, staged: 0, ahead: 0, behind: 0 } }), {});
  assert.ok(html.includes('Save my work'), 'unknown attribution stays conservative (old behaviour)');
  assert.ok(html.includes('não fechar'), 'unknown attribution keeps the safety tip');
});

// ── D2: isMetaPath ───────────────────────────────────────────────────────────────
test('isMetaPath: SYNC.md / _handoff / docs / *.md / manifests → meta; source code → not meta', () => {
  for (const p of ['SYNC.md', '_handoff/X.md', 'docs/strategy/STRATEGY.md', 'README.md', 'package.json', 'packages/x/package-lock.json', 'yarn.lock']) {
    assert.equal(rr.isMetaPath(p), true, p + ' should be meta');
  }
  for (const p of ['packages/router/src/decide-agent.ts', 'src/extension.js', 'a/b/c.py', 'Makefile']) {
    assert.equal(rr.isMetaPath(p), false, p + ' should NOT be meta');
  }
  assert.equal(rr.isMetaPath('C:\\r\\_handoff\\y.md'), true, 'backslash paths normalise');
});

// ── D2: inboxRepoSummary (repos, not sessions) ───────────────────────────────────
test('inboxRepoSummary: 8 sessions of ONE dirty repo → exactly ONE entry (repos, not sessions)', () => {
  const gs = { state: 'uncommitted', dirty: 3, staged: 0, ahead: 0, behind: 0, files: [{ x: ' ', y: 'M', path: 'SYNC.md' }] };
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push(row({ id: 's' + i, cwd: 'C:\\Users\\p\\frugal', repoFolder: 'frugal', gitStage: gs }));
  const sum = x_inbox(rows);
  assert.equal(sum.length, 1, 'one dirty repo = one inbox entry, not 8');
  assert.equal(sum[0].dirty, 3);
  assert.equal(sum[0].repo, 'frugal');
});

test('inboxRepoSummary: all-meta dirt → meta:true (calm tone); any code dirt → meta:false (⚠️)', () => {
  const metaGs = { dirty: 2, files: [{ path: 'SYNC.md' }, { path: '_handoff/a.md' }] };
  const codeGs = { dirty: 2, files: [{ path: 'SYNC.md' }, { path: 'src/x.ts' }] };
  assert.equal(x_inbox([row({ cwd: 'C:\\a', repoFolder: 'a', gitStage: metaGs })])[0].meta, true);
  assert.equal(x_inbox([row({ cwd: 'C:\\b', repoFolder: 'b', gitStage: codeGs })])[0].meta, false);
});

test('inboxRepoSummary: two distinct dirty repos → two entries; clean rows ignored', () => {
  const rows = [
    row({ cwd: 'C:\\a', repoFolder: 'a', gitStage: { dirty: 1, files: [{ path: 'x.ts' }] } }),
    row({ cwd: 'C:\\b', repoFolder: 'b', gitStage: { dirty: 2, files: [{ path: 'SYNC.md' }] } }),
    row({ cwd: 'C:\\c', repoFolder: 'c', gitStage: { state: 'clean', dirty: 0, files: [] } }),
  ];
  const sum = x_inbox(rows);
  assert.equal(sum.length, 2);
  assert.deepEqual(sum.map(s => s.repo).sort(), ['a', 'b']);
});

// small alias so the test body reads cleanly
function x_inbox(rows){ return rr.inboxRepoSummary(rows); }
