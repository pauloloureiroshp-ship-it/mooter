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
