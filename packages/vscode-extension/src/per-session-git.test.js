// per-session-git.test.js — PASSO 2 (Mac feedback): HONEST per-session branch/SHA read from each
// session's OWN journal (handoff-journal git:{head,branch}), never the shared working-tree HEAD.
// Plus board risk promotion (⚠ HIGH on real collision OR branch/SHA divergence) and AMBIENTE 1×.
// MOOTER_HOME isolates the handoff dir so journal reads are deterministic and never touch ~/.claude.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let HOME, HOFF, x;

before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-psg-'));
  process.env.MOOTER_HOME = HOME;
  HOFF = path.join(HOME, 'handoff');
  fs.mkdirSync(HOFF, { recursive: true });
  // A session whose journal records its OWN branch+sha (the honest provenance).
  fs.writeFileSync(path.join(HOFF, 'sess-own.jsonl'),
    JSON.stringify({ ts: 't1', assistant_snippet: 'a', tools: [], git: { head: 'aaaaaaaaaaaa', branch: 'wave/cockpit-live-proof' }, n_turn: 1 }) + '\n' +
    JSON.stringify({ ts: 't2', assistant_snippet: 'b', tools: [], git: { head: 'bbbbbbbbbbbb', branch: 'wave/cockpit-live-proof' }, n_turn: 2 }) + '\n');
  // A journal whose latest git-bearing entry is NOT the very last line (last line has no git).
  fs.writeFileSync(path.join(HOFF, 'sess-gap.jsonl'),
    JSON.stringify({ ts: 't1', tools: [], git: { head: 'cccccccccccc', branch: 'feat/x' }, n_turn: 1 }) + '\n' +
    JSON.stringify({ ts: 't2', tools: [], git: {}, n_turn: 2 }) + '\n');
  delete require.cache[require.resolve('./host-extra.js')];
  x = require('./host-extra.js');
});
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; });

// ── sessionGitFromJournal ──────────────────────────────────────────────────────────────────────
test('sessionGitFromJournal reads the session OWN branch+sha from its journal (latest git entry)', () => {
  const g = x.sessionGitFromJournal('sess-own');
  assert.ok(g && g.source === 'journal');
  assert.equal(g.branch, 'wave/cockpit-live-proof');
  assert.equal(g.head, 'bbbbbbbbbbbb', 'last git-bearing entry wins');
  // gap: last line has empty git → walk back to the entry that DID record git
  const g2 = x.sessionGitFromJournal('sess-gap');
  assert.equal(g2.branch, 'feat/x');
  assert.equal(g2.head, 'cccccccccccc');
  // no journal → null (caller marks "incerto"), never throws
  assert.equal(x.sessionGitFromJournal('does-not-exist'), null);
  assert.equal(x.sessionGitFromJournal(''), null);
});

// ── reconcileSessionGit (PURE) ───────────────────────────────────────────────────────────────────
test('reconcileSessionGit: journal present → OWN branch, not uncertain; matches tree → not diverged', () => {
  const r = x.reconcileSessionGit({ head: 'abcabcabcabc', branch: 'feat' }, 'feat', 'abcabcabcabc');
  assert.equal(r.source, 'journal');
  assert.equal(r.branch, 'feat');
  assert.equal(r.uncertain, false);
  assert.equal(r.diverged, false);
});

test('reconcileSessionGit: branch OR sha differs from tree → diverged (tree moved under the session)', () => {
  assert.equal(x.reconcileSessionGit({ head: 'aaa', branch: 'feat' }, 'main', 'aaa').diverged, true, 'branch differs');
  assert.equal(x.reconcileSessionGit({ head: 'aaa', branch: 'feat' }, 'feat', 'zzz').diverged, true, 'sha differs');
  assert.equal(x.reconcileSessionGit({ head: 'aaa', branch: 'feat' }, 'feat', 'aaa').diverged, false, 'all match');
});

test('reconcileSessionGit: NO journal → uncertain, source tree, branch is the tree branch (never asserted as own)', () => {
  const r = x.reconcileSessionGit(null, 'main', 'deadbeefdead');
  assert.equal(r.source, 'tree');
  assert.equal(r.uncertain, true);
  assert.equal(r.branch, 'main');
  assert.equal(r.diverged, false, 'cannot diverge what we never recorded');
});

// ── _sessionBranchLabel (PURE) ───────────────────────────────────────────────────────────────────
test('_sessionBranchLabel: journal → "branch @sha"; diverged adds ⚠; uncertain → tree-partilhado; back-compat plain', () => {
  assert.equal(
    x._sessionBranchLabel({ branch: 'main', sessionGit: { source: 'journal', branch: 'wave/x', sha: 'abcdef0123', diverged: false } }),
    'wave/x @abcdef0');
  assert.ok(/⚠ diverge do tree/.test(
    x._sessionBranchLabel({ sessionGit: { source: 'journal', branch: 'wave/x', sha: 'abcdef0', diverged: true } })));
  assert.ok(/branch incerto \(tree partilhado\)/.test(
    x._sessionBranchLabel({ branch: 'main', sessionGit: { source: 'tree', branch: 'main', uncertain: true } })));
  // no sessionGit at all → plain tree branch (existing rows are byte-identical)
  assert.equal(x._sessionBranchLabel({ branch: 'main' }), 'main');
});

// ── _treeHeadSha (cheap .git read) ───────────────────────────────────────────────────────────────
test('_treeHeadSha: reads HEAD→ref→sha from a .git dir; null on bogus/missing', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-git-'));
  fs.mkdirSync(path.join(repo, '.git', 'refs', 'heads', 'wave'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/wave/y\n');
  fs.writeFileSync(path.join(repo, '.git', 'refs', 'heads', 'wave', 'y'), '0123456789abcdef0123456789abcdef01234567\n');
  try {
    assert.equal(x._treeHeadSha(repo), '0123456789ab', 'first 12 of the resolved sha');
    assert.equal(x._treeHeadSha(path.join(os.tmpdir(), 'nope-' + process.pid)), null);
    assert.equal(x._treeHeadSha(null), null);
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

// ── BOARD: honest per-session branch (25 idle sharing one tree → each its OWN branch) ─────────────
test('generateProjectHandoff: 25 idle sessions share ONE tree (HEAD main) but each shows its OWN journal branch', () => {
  const rows = [];
  for (let i = 0; i < 25; i++) {
    rows.push({
      id: 's' + i, fullId: 's' + i, name: 'sess ' + i, cwd: '/home/p/frugal', branch: 'main', // tree HEAD
      gitStage: { dirty: 0, ahead: 0 },
      sessionGit: { source: 'journal', branch: 'wave/own-' + i, sha: ('0000000000' + i).slice(-12), uncertain: false, diverged: false },
    });
  }
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-27T00:00:00') });
  // every session shows its OWN branch, not the shared 'main'
  assert.ok(txt.includes('wave/own-0') && txt.includes('wave/own-24'), 'each session its own journal branch');
  const boardLines = txt.split('\n').filter((l) => l.indexOf('· wave/own-') >= 0);
  assert.equal(boardLines.length, 25, 'all 25 rows render the honest per-session branch');
  // idle + ahead 0 + not diverged → NOT a collision → no HIGH (and not falsely "verde")
  assert.ok(!txt.includes('⚠ RISCO: HIGH'), 'idle co-habitation is not a collision');
});

test('generateProjectHandoff: NO journal → "branch incerto (tree partilhado)", never the wrong branch', () => {
  const rows = [{ id: 'a', fullId: 'a', name: 'A', cwd: '/t', branch: 'main',
    gitStage: { dirty: 0, ahead: 0 }, sessionGit: { source: 'tree', branch: 'main', uncertain: true, diverged: false } }];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-27T00:00:00') });
  assert.ok(/branch incerto \(tree partilhado\)/.test(txt), 'no journal → honest uncertainty, not a false branch claim');
});

// ── BOARD: risk promotion to ⚠ HIGH ──────────────────────────────────────────────────────────────
test('generateProjectHandoff: real collision (≥2 active, own commits, same branch) → ⚠ RISCO: HIGH at top', () => {
  const rows = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'feat', working: true, gitStage: { dirty: 0, ahead: 1 } },
    { id: 'b', fullId: 'b', name: 'B', cwd: '/r', branch: 'feat', needsYou: true, gitStage: { dirty: 0, ahead: 1 } },
  ];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-27T00:00:00') });
  assert.ok(/⚠ RISCO: HIGH/.test(txt), 'collision promotes HIGH');
  // HIGH appears ABOVE the board (topo), not buried in the per-row lines
  const riskIdx = txt.indexOf('⚠ RISCO: HIGH');
  const boardIdx = txt.indexOf('▸ BOARD:');
  assert.ok(riskIdx >= 0 && riskIdx < boardIdx, 'risk banner sits above the BOARD');
});

test('generateProjectHandoff: branch/SHA divergence from the tree → ⚠ RISCO: HIGH (even if idle)', () => {
  const rows = [
    { id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 },
      sessionGit: { source: 'journal', branch: 'wave/x', sha: 'aaa', uncertain: false, diverged: true } },
    { id: 'b', fullId: 'b', name: 'B', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 },
      sessionGit: { source: 'journal', branch: 'main', sha: 'bbb', uncertain: false, diverged: false } },
  ];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-27T00:00:00') });
  assert.ok(/⚠ RISCO: HIGH/.test(txt), 'divergence promotes HIGH');
  assert.ok(/divergente do tree/.test(txt), 'reason names the divergence');
});

test('generateProjectHandoff: clean low-risk project adds NO risk line (board not falsely green, just no banner)', () => {
  const rows = [{ id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } }];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-27T00:00:00') });
  assert.ok(!txt.includes('⚠ RISCO: HIGH'), 'no collision/divergence → no HIGH banner');
});

// ── BOARD: AMBIENTE exactly 1× ────────────────────────────────────────────────────────────────────
test('generateProjectHandoff: shared working-tree dirt → AMBIENTE line appears EXACTLY once (no dup)', () => {
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push({ id: 's' + i, fullId: 's' + i, name: 'sess ' + i, cwd: '/home/p/frugal', branch: 'main', gitStage: { dirty: 91, ahead: 0 } });
  rows.push({ id: 'own', fullId: 'own', name: 'own', cwd: '/home/p/solo', branch: 'feat', gitStage: { dirty: 4, ahead: 0 } });
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-27T00:00:00') });
  assert.equal((txt.match(/▸ AMBIENTE:/g) || []).length, 1, 'AMBIENTE reported exactly once');
  assert.equal((txt.match(/\[UNCOMMITTED\]/g) || []).length, 1, 'only the OWN-cwd session is [UNCOMMITTED]');
});

// ── PER-SESSION handoff: honest BASE provenance ──────────────────────────────────────────────────
test('generateHandoff: BASE uses the session journal branch (journal) / incerto / diverged honestly', () => {
  const row = { id: 'a', fullId: 'a', name: 'live', turns: 3, branch: 'main', cwd: '/r' };
  const fromJournal = x.generateHandoff(row, { lastAssistantText: 'q?' },
    { now: new Date('2026-06-27T00:00:00'), snapshot: {}, sessionGit: { source: 'journal', branch: 'wave/x', sha: 'abcdef012345', diverged: false } });
  assert.ok(/BASE:.*wave\/x @abcdef0 \(journal\)/.test(fromJournal), 'journal branch + sha labelled (journal)');
  const diverged = x.generateHandoff(row, { lastAssistantText: 'q?' },
    { now: new Date('2026-06-27T00:00:00'), snapshot: {}, sessionGit: { source: 'journal', branch: 'wave/x', sha: 'abc', diverged: true } });
  assert.ok(/⚠ diverge do tree/.test(diverged), 'divergence surfaced in the per-session handoff');
  const uncertain = x.generateHandoff(row, { lastAssistantText: 'q?' },
    { now: new Date('2026-06-27T00:00:00'), snapshot: {}, sessionGit: { source: 'tree', branch: 'main', uncertain: true } });
  assert.ok(/branch incerto · tree partilhado/.test(uncertain), 'no journal → honest uncertainty');
  // back-compat: no sessionGit → plain tree branch as before
  const plain = x.generateHandoff(row, { lastAssistantText: 'q?' }, { now: new Date('2026-06-27T00:00:00'), snapshot: {} });
  assert.ok(/BASE:\s+main ·/.test(plain), 'no sessionGit → unchanged BASE');
});

// ── renderRow stays concat-only (webview-embeddable) — regression lock ───────────────────────────
test('renderRow + renderLocalFleet remain concat-only (no template literals — fn.toString embed)', () => {
  const RR = require('./row-renderer.js');
  assert.equal(RR.renderRow.toString().indexOf('`'), -1, 'renderRow must stay backtick-free');
  assert.equal(RR.renderLocalFleet.toString().indexOf('`'), -1, 'renderLocalFleet must stay backtick-free');
});
