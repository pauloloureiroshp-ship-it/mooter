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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🪞 HANDOFF TRUTH — anti-lie GATE (blindagem). The handoff used to attribute everything to the
// shared tree, claim "0 UNPUSHED · projecto limpo" with green work parked in other worktrees, and
// mark "✅" sessions that were actually asking the human. These three tests fail the moment any of
// those lies returns. They are the trunfo — perfect handoff, never fabricated.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// ── GATE #1: a branch with unpushed commits → NEVER "0 UNPUSHED" / "projecto limpo"; listed 🟡 parked ─
test('GATE #1: a branch with 1 unpushed commit → never "0 UNPUSHED" nor "projecto limpo"; 🟡 parked', () => {
  const rows = [{ id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } }];
  const branches = [{ branch: 'feat/cockpit-doctor-selfheal', sha: '2155edc0abcd', unpushed: 1, worktree: 'frugal-cockpit-doctor', aheadOfMain: 12 }];
  const txt = x.generateProjectHandoff('P', rows, { branches, now: new Date('2026-06-30T00:00:00') });
  assert.ok(!/0 UNPUSHED/.test(txt), 'must NOT claim 0 UNPUSHED while a branch is parked');
  assert.ok(!/projecto limpo/.test(txt), 'must NOT claim projecto limpo while a branch is parked');
  assert.ok(/▸ PARKED/.test(txt), 'has a PARKED section');
  assert.ok(/🟡 feat\/cockpit-doctor-selfheal @2155edc/.test(txt), 'parked branch listed 🟡 with its short sha');
  assert.ok(/1 UNPUSHED/.test(txt), 'FLAGS reports the real unpushed count');
  assert.ok(/push 1 branch parked/.test(txt), 'NEXT FOR COWORK names the parked push');
});

test('GATE #1: two parked branches sum honestly; a clean branch set still allows "projecto limpo"', () => {
  const rows = [{ id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } }];
  const parked = [
    { branch: 'feat/cockpit-doctor-selfheal', sha: '2155edc0abcd', unpushed: 3, worktree: 'wt1' },
    { branch: 'feat/mission-control-v2', sha: 'b07a49b0abcd', unpushed: 2, worktree: 'wt2' },
  ];
  const t1 = x.generateProjectHandoff('P', rows, { branches: parked, now: new Date('2026-06-30T00:00:00') });
  assert.ok(/5 UNPUSHED/.test(t1), 'sums all parked commits (3+2)');
  assert.ok(/feat\/mission-control-v2 @b07a49b/.test(t1), 'second parked branch also listed');
  // branch data present but all pushed → 0 UNPUSHED is TRUE → projecto limpo is allowed (honest both ways)
  const clean = x.generateProjectHandoff('P', rows, { branches: [], now: new Date('2026-06-30T00:00:00') });
  assert.ok(/0 UNPUSHED/.test(clean) && /projecto limpo/.test(clean), 'truly clean → honest "projecto limpo"');
  assert.ok(!/▸ PARKED/.test(clean), 'no PARKED section when nothing is parked');
});

// ── GATE #2: a session in a linked worktree shows the WORKTREE branch, not the shared tree ─────────
test('GATE #2: reconcileSessionGit — no journal but a dedicated worktree → certain worktree branch', () => {
  const r = x.reconcileSessionGit(null, 'main', 'aaaaaaaaaaaa', { branch: 'feat/mission-control-v2', sha: 'b07a49b0abcd' });
  assert.equal(r.source, 'worktree');
  assert.equal(r.uncertain, false, 'a dedicated worktree branch is CERTAIN, not "incerto"');
  assert.equal(r.branch, 'feat/mission-control-v2');
  assert.equal(r.diverged, false);
  // journal still wins over worktree (the session's own recorded provenance)
  const j = x.reconcileSessionGit({ branch: 'wave/j', head: 'cccccccccccc' }, 'main', 'mmmmmmmmmmmm', { branch: 'feat/wt' });
  assert.equal(j.source, 'journal');
  assert.equal(j.branch, 'wave/j');
});

test('GATE #2: BOARD shows the worktree branch, never "tree partilhado", for a worktree session', () => {
  const rows = [{ id: 'w', fullId: 'w', name: 'W', cwd: '/wt', branch: 'main', gitStage: { dirty: 0, ahead: 0 },
    sessionGit: { source: 'worktree', branch: 'feat/mission-control-v2', sha: 'b07a49b0abcd', uncertain: false, diverged: false } }];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-30T00:00:00') });
  assert.ok(/feat\/mission-control-v2 @b07a49b/.test(txt), 'worktree branch + sha shown');
  assert.ok(!/branch incerto \(tree partilhado\)/.test(txt), 'a dedicated worktree is NOT "tree partilhado"');
  // and in the per-session handoff BASE it is labelled (worktree)
  const base = x.generateHandoff({ id: 'w', fullId: 'w', name: 'W', branch: 'main', cwd: '/wt', turns: 3 },
    { lastAssistantText: '—' }, { now: new Date('2026-06-30T00:00:00'), snapshot: {},
      sessionGit: { source: 'worktree', branch: 'feat/mission-control-v2', sha: 'b07a49b0abcd', diverged: false } });
  assert.ok(/BASE:.*feat\/mission-control-v2 @b07a49b \(worktree\)/.test(base), 'per-session BASE labelled (worktree)');
});

// ── GATE #3: a session with an OPEN AskUserQuestion → 🔵 (à-espera-de-ti), never ✅ ────────────────
test('GATE #3: open AskUserQuestion → _isAskingUser true; resolved/other → false', () => {
  assert.equal(x._isAskingUser({ stopped: true, lastToolActions: [{ name: 'Read' }, { name: 'AskUserQuestion' }] }), true);
  assert.equal(x._isAskingUser({ stopped: false, lastToolActions: [{ name: 'AskUserQuestion' }] }), false, 'answered → later user turn → not asking');
  assert.equal(x._isAskingUser({ stopped: true, lastToolActions: [{ name: 'Edit' }] }), false, 'last tool not AskUserQuestion');
  assert.equal(x._isAskingUser({ stopped: true, lastToolActions: [] }), false);
  assert.equal(x._isAskingUser(null), false);
});

test('GATE #3: a session blocked on AskUserQuestion renders 🔵, never ✅', () => {
  const asking = { stopped: true, lastAssistantText: 'qual abordagem preferes?', lastToolActions: [{ name: 'AskUserQuestion', target: '' }] };
  const rows = [{ id: 'q', fullId: 'q', name: 'Q', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 }, pending: asking }];
  const txt = x.generateProjectHandoff('P', rows, { now: new Date('2026-06-30T00:00:00') });
  const line = txt.split('\n').find((l) => l.includes('(q)'));
  assert.ok(line, 'the session row is present');
  assert.ok(line.includes('🔵'), 'asking session rendered 🔵 (à-espera-de-ti)');
  assert.ok(!line.includes('✅'), 'NEVER marked ✅ done while waiting on the human');
  assert.ok(/· 1 answer/.test(txt), 'the ASK aggregate counts it as needing an answer');
});

// ── REGRESSION (final-reviewer NO-SHIP HIGH): worktreeParked returning [] (git timeout / no linked
//    worktree / no remotes) must NOT erase a session's OWN unpushed. Production ALWAYS passes opts.branches,
//    so an empty array used to force "0 UNPUSHED · projecto limpo" — the exact lie this gate exists to kill. ─
test('GATE #1: branches:[] (worktreeParked empty/failed) + a session ahead of upstream → still UNPUSHED, never "projecto limpo"', () => {
  const rows = [{ id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'feat/x', gitStage: { dirty: 0, ahead: 2 } }];
  const txt = x.generateProjectHandoff('P', rows, { branches: [], now: new Date('2026-06-30T00:00:00') });
  assert.ok(!/0 UNPUSHED/.test(txt), 'empty branch data must NOT erase the session-level unpushed');
  assert.ok(!/projecto limpo/.test(txt), 'never "projecto limpo" while a session is ahead of its upstream');
  assert.ok(/push UNPUSHED/.test(txt), 'NEXT FOR COWORK still names the push when branch enumeration came back empty');
});

// ── REGRESSION (final-reviewer NO-SHIP MED): the "asking" signal must be scoped to the FINAL assistant
//    turn, not the tail-wide last-3 buffer. A session that asked, was answered, then ran a post-answer
//    turn is NOT blocked on the human — it must not false-positive to 🔵. ──────────────────────────────
test('GATE #3: answered-then-continued session is NOT asking (endsWithAsk scopes to the final turn)', () => {
  const tail = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'qual abordagem?' }, { type: 'tool_use', name: 'AskUserQuestion', input: {} }] } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'a opção 2' }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/r/x.js' } }, { type: 'text', text: 'feito.' }] } }),
  ];
  const p = x.extractPending(tail);
  assert.equal(p.endsWithAsk, false, 'final turn was Edit+text, not an open AskUserQuestion');
  assert.equal(x._isAskingUser(p), false, 'answered-then-continued → not blocked on the human (no false 🔵)');
  // and the genuinely-open case: the very last turn ends with an AskUserQuestion → asking
  const open = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'escolhe:' }, { type: 'tool_use', name: 'AskUserQuestion', input: {} }] } }),
  ];
  const po = x.extractPending(open);
  assert.equal(po.endsWithAsk, true, 'final turn ends with an open AskUserQuestion');
  assert.equal(x._isAskingUser(po), true);
});

test('GATE #3: _isAskingUser prefers endsWithAsk over the stale lastToolActions tail buffer', () => {
  assert.equal(x._isAskingUser({ stopped: true, endsWithAsk: false, lastToolActions: [{ name: 'AskUserQuestion' }] }), false, 'scoped signal wins: a stale ask in the buffer is ignored');
  assert.equal(x._isAskingUser({ stopped: true, endsWithAsk: true, lastToolActions: [] }), true, 'scoped signal wins: open ask even with an empty buffer');
});
