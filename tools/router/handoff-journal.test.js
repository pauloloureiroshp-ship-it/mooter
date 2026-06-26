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
