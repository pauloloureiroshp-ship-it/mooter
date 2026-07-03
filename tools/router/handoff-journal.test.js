// handoff-journal.test.js — Live Context Accumulator PASSO 1 (deterministic journal).
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let HOME;
before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-journal-'));
  process.env.MOOTER_HOME = HOME;
});
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; });

function fresh() { delete require.cache[require.resolve('./handoff-journal.js')]; return require('./handoff-journal.js'); }

test('appendTurn writes a valid normalized entry; readJournal parses it', () => {
  const j = fresh();
  const sid = 'sess-a';
  const ok = j.appendTurn(sid, {
    assistant_snippet: '  wiring   the   accumulator  ',
    tools: [{ name: 'Write', target: '/a/b/host-extra.js' }, { name: 'Edit', target: 'x'.repeat(80) }],
    git: { head: '0123456789abcdef', branch: 'wave/cockpit-live-context', dirty: 2, ahead: 1 },
    n_turn: 1,
  });
  assert.equal(ok, true);
  const all = j.readJournal(sid);
  assert.equal(all.length, 1);
  const e = all[0];
  assert.equal(e.assistant_snippet, 'wiring the accumulator', 'whitespace collapsed');
  assert.equal(e.tools.length, 2);
  assert.ok(e.tools[1].target.length <= 48, 'target clamped to 48');
  assert.equal(e.git.head, '0123456789ab', 'head clamped to 12');
  assert.equal(e.git.branch, 'wave/cockpit-live-context');
  assert.equal(e.git.dirty, 2);
  assert.equal(e.n_turn, 1);
  assert.ok(e.ts && /\d{4}-\d{2}-\d{2}T/.test(e.ts), 'ts is ISO');
});

test('journal is bounded — rolls to the last JOURNAL_MAX entries', () => {
  const j = fresh();
  const sid = 'sess-bound';
  const N = j.JOURNAL_MAX + 17;
  for (let i = 0; i < N; i++) j.appendTurn(sid, { assistant_snippet: 'turn ' + i, n_turn: i });
  const all = j.readJournal(sid);
  assert.equal(all.length, j.JOURNAL_MAX, 'capped at JOURNAL_MAX');
  assert.equal(all[0].assistant_snippet, 'turn ' + (N - j.JOURNAL_MAX), 'kept the most recent window');
  assert.equal(all[all.length - 1].assistant_snippet, 'turn ' + (N - 1), 'last entry is newest');
});

test('appendTurn never throws and returns false on bad input', () => {
  const j = fresh();
  assert.equal(j.appendTurn(null, { assistant_snippet: 'x' }), false, 'no session → false');
  assert.equal(j.appendTurn('', {}), false);
  assert.doesNotThrow(() => j.appendTurn('sess-weird', { tools: 'not-an-array', git: 42, n_turn: 'NaN' }));
  const e = j.lastEntry('sess-weird');
  assert.ok(e && Array.isArray(e.tools) && e.tools.length === 0, 'bad tools normalized to []');
  assert.deepEqual(e.git, {}, 'non-object git normalized to {}');
  assert.equal(e.n_turn, null, 'non-finite n_turn → null');
});

test('deriveTurn extracts snippet (<=200c) + last 3 tools from a transcript tail', () => {
  const j = fresh();
  const lines = [
    JSON.stringify({ message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ message: { role: 'assistant', content: [
      { type: 'text', text: 'first assistant turn' },
      { type: 'tool_use', name: 'Read', input: { file_path: '/x/y/host-extra.js' } },
    ] } }),
    JSON.stringify({ message: { role: 'assistant', content: [
      { type: 'tool_use', name: 'Grep', input: { pattern: 'composeHandoff' } },
      { type: 'tool_use', name: 'Edit', input: { file_path: 'a.js' } },
      { type: 'tool_use', name: 'Write', input: { file_path: 'b.js' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } },
      { type: 'text', text: '  the   LAST  assistant  text  ' },
    ] } }),
  ];
  const d = j.deriveTurn(lines);
  assert.equal(d.assistant_snippet, 'the LAST assistant text');
  assert.equal(d.tools.length, 3, 'only the last 3 tools');
  assert.deepEqual(d.tools.map((t) => t.name), ['Edit', 'Write', 'Bash']);
  assert.equal(d.tools[0].target, 'a.js', 'path-like target → basename');
});

test('deriveTurn never throws on garbage', () => {
  const j = fresh();
  assert.doesNotThrow(() => j.deriveTurn(['{bad json', '', null, 42]));
  assert.deepEqual(j.deriveTurn(null), { assistant_snippet: '', tools: [] });
});

test('gitInfo reads branch + head from .git without a subprocess; {} on non-git', () => {
  const j = fresh();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-git-'));
  try {
    assert.deepEqual(j.gitInfo(repo), {}, 'no .git → {}');
    fs.mkdirSync(path.join(repo, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/feature-x\n');
    fs.writeFileSync(path.join(repo, '.git', 'refs', 'heads', 'feature-x'), 'abcdef0123456789abcdef0123456789abcdef01\n');
    const g = j.gitInfo(repo);
    assert.equal(g.branch, 'feature-x');
    assert.equal(g.head, 'abcdef012345', 'head sha clamped to 12');
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('readSummary returns null when no rolling summary exists yet', () => {
  const j = fresh();
  assert.equal(j.readSummary('never-summarized'), null);
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🎯 PERFECT HANDOFF v2.5 — CAPTURE fix (mata a raiz do worktree-crossing). The Stop hook used to
// journal git from payload.cwd (the CC launch dir), not the worktree the session cd'd into to commit.
// These tests fail the moment the journal records the launch branch instead of the real worktree.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// Build a throwaway git worktree with a given branch+sha (plain .git dir; supports slashed branches).
function makeRepo(branch, sha) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-wt-'));
  const ref = 'refs/heads/' + branch;
  fs.mkdirSync(path.join(dir, '.git', path.dirname(ref)), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: ' + ref + '\n');
  fs.writeFileSync(path.join(dir, '.git', ref), sha + '\n');
  return dir;
}
function bashTurn(cmd) {
  return JSON.stringify({ message: { role: 'assistant', content: [
    { type: 'tool_use', name: 'Bash', input: { command: cmd } },
  ] } });
}

test('_extractCwdPaths: cd / git -C, quoted & bare, in order; ignores cd - / cd ~', () => {
  const j = fresh();
  assert.deepEqual(j._extractCwdPaths('cd "/c/Users/Paulo Loureiro/frugal-X" && git commit -m y'), ['/c/Users/Paulo Loureiro/frugal-X']);
  assert.deepEqual(j._extractCwdPaths('cd ../frugal-A && cd packages/vscode-extension && npm i'), ['../frugal-A', 'packages/vscode-extension']);
  assert.deepEqual(j._extractCwdPaths("git -C '/path with space' status"), ['/path with space']);
  assert.deepEqual(j._extractCwdPaths('cd - ; cd ~ ; ls'), [], 'cd -/~ carry no worktree signal');
  assert.deepEqual(j._extractCwdPaths('echo abcd; record-cd foo'), [], 'no false-match inside words');
  assert.doesNotThrow(() => j._extractCwdPaths(null));
});

test('_cwdCandidates: only Bash tool_use commands, transcript order', () => {
  const j = fresh();
  const lines = [
    JSON.stringify({ message: { role: 'user', content: 'go' } }),
    bashTurn('cd /repo-1 && git status'),
    JSON.stringify({ message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'cd /not-a-command' } }] } }),
    bashTurn('git -C /repo-2 rev-parse HEAD'),
  ];
  assert.deepEqual(j._cwdCandidates(lines), ['/repo-1', '/repo-2'], 'Read input is not scanned; order preserved');
});

test('effectiveCwd: prefers the LAST cd that resolves a real branch (newest-wins, grounded)', () => {
  const j = fresh();
  const repo = makeRepo('feat/real', 'a'.repeat(40));
  try {
    const lines = [
      bashTurn('cd /does/not/exist && git log'),       // unresolvable → skipped
      bashTurn('cd "' + repo + '" && git commit -m x'), // real worktree → wins
      bashTurn('grep -n foo bar.js'),                    // no cd
    ];
    assert.equal(j.effectiveCwd(lines, '/some/launch/dir'), repo, 'the real worktree wins');
    assert.equal(j.gitInfo(j.effectiveCwd(lines, '/some/launch/dir')).branch, 'feat/real');
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

test('effectiveCwd: no resolvable cd → falls back to payloadCwd (byte-identical old behaviour)', () => {
  const j = fresh();
  const launch = makeRepo('feat/launch', 'b'.repeat(40));
  try {
    const lines = [bashTurn('grep -n foo bar.js'), bashTurn('node --check x.js')];
    assert.equal(j.effectiveCwd(lines, launch), launch, 'no cd → payloadCwd');
    assert.equal(j.effectiveCwd([], launch), launch, 'empty tail → payloadCwd');
    assert.equal(j.effectiveCwd(null, null), null, 'nothing at all → null, never throws');
  } finally { fs.rmSync(launch, { recursive: true, force: true }); }
});

test('E2E (o teste-ouro): payload.cwd=tree-A but the turn cd tree-B → journal grava feat/B, NUNCA feat/A', () => {
  const j = fresh();
  const treeA = makeRepo('feat/overclock-moo-p1', '85e238a' + '0'.repeat(33)); // the CC launch dir (the lie)
  const treeB = makeRepo('feat/perfect-handoff', 'ab12cd3' + '0'.repeat(33));  // where commits ACTUALLY happen
  try {
    // The transcript the Stop hook reads: the session cd'd into tree-B and committed there.
    const tail = [
      JSON.stringify({ message: { role: 'user', content: 'segue o masterprompt' } }),
      bashTurn('cd "' + treeB + '" && git add -- x.js && git commit -m "feat: y"'),
      JSON.stringify({ message: { role: 'assistant', content: [{ type: 'text', text: 'committed em tree-B' }] } }),
    ];
    // Replicate the hook's exact derivation (gsd-turn-end.js:accumulateHandoff).
    const payloadCwd = treeA; // payload.cwd = the launch dir
    const cwd = j.effectiveCwd(tail, payloadCwd);
    const git = cwd ? j.gitInfo(cwd) : {};
    j.appendTurn('sess-e2e', { assistant_snippet: 'committed em tree-B', tools: [], git, n_turn: 1 });

    const e = j.lastEntry('sess-e2e');
    assert.equal(e.git.branch, 'feat/perfect-handoff', 'journal records the REAL worktree branch');
    assert.equal(e.git.head, 'ab12cd300000', 'and the REAL worktree head sha (clamped to 12)');
    assert.notEqual(e.git.branch, 'feat/overclock-moo-p1', 'NEVER the CC launch branch (the old lie)');

    // Control: the OLD behaviour (gitInfo(payload.cwd)) would have lied.
    assert.equal(j.gitInfo(payloadCwd).branch, 'feat/overclock-moo-p1', 'proof the launch dir WAS the wrong branch');
  } finally {
    fs.rmSync(treeA, { recursive: true, force: true });
    fs.rmSync(treeB, { recursive: true, force: true });
  }
});

test('_normMsys: win32 /c/foo → c:/foo; no-op off win32 and on native paths', () => {
  const j = fresh();
  const r = j._normMsys('/c/Users/Paulo Loureiro/frugal');
  if (process.platform === 'win32') assert.equal(r, 'c:/Users/Paulo Loureiro/frugal');
  else assert.equal(r, '/c/Users/Paulo Loureiro/frugal');
  assert.equal(j._normMsys('relative/path'), 'relative/path');
  assert.doesNotThrow(() => j._normMsys(null));
});

// (c) — the ONLY cd is a non-worktree (no .git). Must fall back to payloadCwd and NEVER
// return the unresolved path. Grounded: effectiveCwd only ever returns a path gitInfo resolves.
test('effectiveCwd: sole cd is a non-worktree (no .git) → falls back, NEVER invents that path', () => {
  const j = fresh();
  const launch = makeRepo('feat/launch', 'c'.repeat(40));
  const bogus = path.join(os.tmpdir(), 'mooter-nope-does-not-exist-zzz'); // never created → no .git
  try {
    const lines = [bashTurn('cd "' + bogus + '" && git status')];
    const res = j.effectiveCwd(lines, launch);
    assert.equal(res, launch, 'unresolvable cd → payloadCwd (byte-identical old behaviour)');
    assert.notEqual(res, bogus, 'NEVER returns a path it could not resolve to a real branch');
  } finally { fs.rmSync(launch, { recursive: true, force: true }); }
});

// (d) — integration: a Git-Bash `cd /c/Users/…` must be msys-normalized BEFORE gitInfo, else the
// real worktree is invisible and the journal lies. This is the exact scenario seen in the real handoff.
test('effectiveCwd: resolves an msys /c/… cd via _normMsys (the real-handoff scenario)', () => {
  const j = fresh();
  const repo = makeRepo('feat/msys', 'd'.repeat(40));
  try {
    // Rewrite the native tmp path into its Git-Bash /c/… twin to simulate what the transcript holds.
    let msysPath = repo;
    if (process.platform === 'win32') {
      const m = /^([a-zA-Z]):[\\/](.*)$/.exec(repo);
      if (m) msysPath = '/' + m[1].toLowerCase() + '/' + m[2].replace(/\\/g, '/');
    }
    const lines = [bashTurn('cd "' + msysPath + '" && git commit -m x')];
    const res = j.effectiveCwd(lines, '/some/launch/dir');
    assert.equal(j.gitInfo(res).branch, 'feat/msys', 'the msys cd resolved to the real worktree branch');
    if (process.platform === 'win32') {
      assert.ok(!String(res).startsWith('/c/'), 'the /c/… form was normalized (never handed raw to fs)');
    }
  } finally { fs.rmSync(repo, { recursive: true, force: true }); }
});

// A linked git worktree (the feature's PRIMARY target): `.git` is a FILE → gitdir under
// <common>/.git/worktrees/<name>; HEAD is per-worktree but refs/heads/* live in the COMMON dir.
function makeLinkedWorktree(branch, sha) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-lwt-'));
  const commonGit = path.join(root, 'main', '.git');
  const ref = 'refs/heads/' + branch;
  fs.mkdirSync(path.join(commonGit, path.dirname(ref)), { recursive: true });
  fs.writeFileSync(path.join(commonGit, ref), sha + '\n');                 // loose ref ONLY in the common dir
  const wtGitDir = path.join(commonGit, 'worktrees', 'wt1');
  fs.mkdirSync(wtGitDir, { recursive: true });
  fs.writeFileSync(path.join(wtGitDir, 'HEAD'), 'ref: ' + ref + '\n');     // per-worktree HEAD
  fs.writeFileSync(path.join(wtGitDir, 'commondir'), path.relative(wtGitDir, commonGit) + '\n');
  const wtDir = path.join(root, 'wt1');
  fs.mkdirSync(wtDir, { recursive: true });
  fs.writeFileSync(path.join(wtDir, '.git'), 'gitdir: ' + wtGitDir + '\n');
  return { root, wtDir };
}

// REGRESSION (proof-revealed): a linked worktree used to journal branch-with-NULL-sha because gitInfo
// searched only the per-worktree gitdir. Now it follows commondir → real HEAD sha. Without this the
// handoff shows `feat/X` with no `@sha` for exactly the worktree sessions the feature exists to serve.
test('gitInfo: linked worktree — resolves HEAD sha via commondir (refs live in the common dir)', () => {
  const j = fresh();
  const { root, wtDir } = makeLinkedWorktree('feat/perfect-handoff-land', 'e'.repeat(40));
  try {
    const g = j.gitInfo(wtDir);
    assert.equal(g.branch, 'feat/perfect-handoff-land', 'branch from the per-worktree HEAD');
    assert.equal(g.head, 'e'.repeat(12), 'HEAD sha resolved from the COMMON dir ref — never null');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🎯 PERFECT HANDOFF v3 — WORK-AWARE. The LOW#1 (v2.5 backlog): a later navigation `cd` stole the
// provenance from the worktree that actually committed. These tests fail the instant navigation wins.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('_isGitWrite: WRITE ops are writes; inspection & navigation are NOT', () => {
  const j = fresh();
  // writes
  assert.equal(j._isGitWrite('cd ../wt-A && git commit -m x'), true, 'commit');
  assert.equal(j._isGitWrite('git -C "/c/p A" commit -m y'), true, 'git -C … commit');
  assert.equal(j._isGitWrite('git merge feat/x'), true, 'merge');
  assert.equal(j._isGitWrite('git rebase main'), true, 'rebase');
  assert.equal(j._isGitWrite('git cherry-pick abc123'), true, 'cherry-pick');
  assert.equal(j._isGitWrite('git revert HEAD'), true, 'revert');
  assert.equal(j._isGitWrite('git worktree add ../wt -b feat/z main'), true, 'worktree add');
  assert.equal(j._isGitWrite('git checkout -b feat/new'), true, 'checkout -b');
  assert.equal(j._isGitWrite('git switch -c feat/new'), true, 'switch -c');
  assert.equal(j._isGitWrite('git stash'), true, 'stash');
  // NOT writes — inspection / navigation
  assert.equal(j._isGitWrite('cd ~/tree && git branch -d velha'), false, 'branch -d is cleanup, not work');
  assert.equal(j._isGitWrite('git branch -D old'), false, 'branch -D');
  assert.equal(j._isGitWrite('git branch --list'), false, 'branch --list');
  assert.equal(j._isGitWrite('git status'), false, 'status');
  assert.equal(j._isGitWrite('git log --oneline -5'), false, 'log');
  assert.equal(j._isGitWrite('git rev-parse --short HEAD'), false, 'rev-parse');
  assert.equal(j._isGitWrite('git show HEAD'), false, 'show');
  assert.equal(j._isGitWrite('git diff'), false, 'diff');
  assert.equal(j._isGitWrite('git fetch origin'), false, 'fetch');
  assert.equal(j._isGitWrite('git checkout -- file.js'), false, 'checkout -- (restore) is not -b/-c');
  assert.equal(j._isGitWrite('cd ../frugal'), false, 'bare cd');
  assert.equal(j._isGitWrite('legit-tool commit things'), false, 'no false-match inside a word');
  assert.doesNotThrow(() => j._isGitWrite(null));
});

test('_workCwdCandidates: only git-WRITE commands; last cd/-C in the cmd; cd-less write → null', () => {
  const j = fresh();
  const lines = [
    bashTurn('cd /wt-A && git commit -m x'),        // write, has cd → /wt-A
    bashTurn('cd ~/tree && git branch -d velha'),    // navigation → skipped
    bashTurn('git -C /wt-B merge feat/y'),           // write via -C → /wt-B
    bashTurn('git commit --amend'),                  // write, no cd → null (payloadCwd sentinel)
    JSON.stringify({ message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'cd /not-scanned' } }] } }),
  ];
  assert.deepEqual(j._workCwdCandidates(lines), ['/wt-A', '/wt-B', null], 'writes only, in order; cd-less → null');
  assert.doesNotThrow(() => j._workCwdCandidates(null));
});

// THE anti-LOW#1 test: WORK happened in wt-A (commit); a LATER navigation cd into the shared tree
// (branch -d cleanup) must NOT steal provenance. Fails the moment navigation wins again.
test('effectiveCwd (anti-LOW#1): git-write worktree wins over a later navigation cd', () => {
  const j = fresh();
  const wtA = makeRepo('feat/delivery-forecast', 'f'.repeat(40)); // the WORK
  const tree = makeRepo('feat/overclock-moo-p1', '1'.repeat(40)); // the shared tree merely navigated to
  try {
    const tail = [
      bashTurn('cd "' + wtA + '" && git add -- x.js && git commit -m "feat: y"'), // WORK here
      bashTurn('cd "' + tree + '" && git branch -d velha'),                        // navigation/cleanup AFTER
    ];
    const res = j.effectiveCwd(tail, tree); // payload.cwd = the shared tree (the trap)
    assert.equal(res, wtA, 'the git-write worktree wins — navigation never steals it');
    assert.equal(j.gitInfo(res).branch, 'feat/delivery-forecast');
    assert.notEqual(j.gitInfo(res).branch, 'feat/overclock-moo-p1', 'NEVER the navigated tree (the LOW#1 lie)');
    // Control: the v2.5 rule (last git-context cd) WOULD have returned the navigated tree.
    const cands = j._cwdCandidates(tail);
    assert.equal(cands[cands.length - 1], tree, 'proof: newest git-context cd was the navigated tree');
  } finally { fs.rmSync(wtA, { recursive: true, force: true }); fs.rmSync(tree, { recursive: true, force: true }); }
});

// Regression: with NO git-write in the tail, the v2.5 navigation behaviour is preserved exactly
// (the newest resolvable git-context cd wins).
test('effectiveCwd (regression): no git-write → newest navigation cd (v2.5 behaviour intact)', () => {
  const j = fresh();
  const a = makeRepo('feat/a', 'a'.repeat(40));
  const b = makeRepo('feat/b', 'b'.repeat(40));
  try {
    const tail = [bashTurn('cd "' + a + '" && git status'), bashTurn('cd "' + b + '" && git log')];
    assert.equal(j.effectiveCwd(tail, '/launch'), b, 'no write → last inspection cd wins (unchanged)');
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

// A bare `git commit` (no cd) commits in the process cwd → provenance is payloadCwd.
test('effectiveCwd: cd-less git commit → payloadCwd (the process cwd is the real provenance)', () => {
  const j = fresh();
  const launch = makeRepo('feat/launch-committed', 'c'.repeat(40));
  try {
    const tail = [bashTurn('git add -A && git commit -m "in place"')];
    assert.equal(j.effectiveCwd(tail, launch), launch, 'bare commit → payloadCwd');
    assert.equal(j.gitInfo(j.effectiveCwd(tail, launch)).branch, 'feat/launch-committed');
  } finally { fs.rmSync(launch, { recursive: true, force: true }); }
});

// Two writes: the LATEST git-write worktree wins (commit in A, then merge in B → B).
test('effectiveCwd: two git-writes → the newest write worktree wins', () => {
  const j = fresh();
  const a = makeRepo('feat/first', 'a'.repeat(40));
  const b = makeRepo('feat/second', 'b'.repeat(40));
  try {
    const tail = [
      bashTurn('cd "' + a + '" && git commit -m first'),
      bashTurn('cd "' + b + '" && git merge feat/x'),
    ];
    assert.equal(j.gitInfo(j.effectiveCwd(tail, '/launch')).branch, 'feat/second', 'last write wins');
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});

// Write then navigate elsewhere (inspection) → the write worktree keeps provenance.
test('effectiveCwd: write in A, then `cd B && git log` → A (inspection does not steal)', () => {
  const j = fresh();
  const a = makeRepo('feat/worked', 'a'.repeat(40));
  const b = makeRepo('feat/looked', 'b'.repeat(40));
  try {
    const tail = [
      bashTurn('cd "' + a + '" && git commit -m work'),
      bashTurn('cd "' + b + '" && git log --oneline'),
    ];
    assert.equal(j.gitInfo(j.effectiveCwd(tail, '/launch')).branch, 'feat/worked', 'A keeps provenance');
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
});
