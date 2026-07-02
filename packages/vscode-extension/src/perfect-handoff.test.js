// perfect-handoff.test.js — PERFECT HANDOFF v2 anti-lie GATE (blindagem determinística, sem rede/LLM).
//
// A régua: um handoff bonito sobre um campo cruzado é PIOR que um feio — dá confiança a uma mentira.
// Estes fixtures FALHAM o build no momento em que o handoff volta a mentir. Cobrem os 2 bugs de raiz
// (WORKTREE-CROSSING + CONTAGEM INFLADA) e os 4 buracos observados (0-commits, por-aterrar, anti-print,
// ambiente vs trabalho), mais a projecção do Ledger e o PENDING-completo.
//
// MOOTER_HOME isola o dir de journal para que as leituras de ledger sejam determinísticas.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

let HOME, HOFF, x;
const NOW = new Date('2026-07-02T12:00:00');

before(() => {
  HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-ph2-'));
  process.env.MOOTER_HOME = HOME;
  HOFF = path.join(HOME, 'handoff');
  fs.mkdirSync(HOFF, { recursive: true });
  delete require.cache[require.resolve('./host-extra.js')];
  x = require('./host-extra.js');
});
after(() => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} delete process.env.MOOTER_HOME; });

// A deterministic git mock for gitSnapshot: dispatches on the joined argv → { ok, out }. Anything not
// mapped returns ok:false out:'' (so factsComplete flips honestly). Never touches real git.
function mockGit(map) {
  return (args) => {
    const key = (Array.isArray(args) ? args : []).join(' ');
    if (Object.prototype.hasOwnProperty.call(map, key)) return { ok: true, out: map[key] };
    return { ok: false, out: '' };
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ANTI-BUG-1 — WORKTREE-CROSSING: facts hang off the SESSION's branch, never the swapped live tree.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('worktree-crossing: gitSnapshot(sessionBranch) reports feat/A@sha5, marks crossed, never feat/B', () => {
  const runGit = mockGit({
    // the session's OWN branch (feat/A) — what the journal recorded
    'log -1 --format=%h%x09%s feat/A': 'aaaaaaa\tfeat A work',
    // the live tree HEAD — another session swapped it to feat/B
    'rev-list -1 HEAD': 'bbbbbbbbbbbb',
    'rev-list --count origin/main..feat/A': '5',
    'rev-list --count feat/A..origin/main': '0',
    'show -s --format=%P feat/A': 'ccccccc',
    'diff-tree --no-commit-id --name-only -r feat/A': 'src/x.js\nsrc/y.js',
    'rev-list --count feat/A --not --remotes': '5', // never pushed
  });
  const snap = x.gitSnapshot('/repo', { sessionBranch: 'feat/A', runGit });
  assert.ok(snap.head && snap.head.sha7.startsWith('aaaaaaa'), 'HEAD is feat/A, not the tree');
  assert.equal(snap.baseAhead, 5, 'ahead counted off feat/A');
  assert.equal(snap.crossed, true, 'tree HEAD (feat/B) ≠ session rev (feat/A) → crossed');
  assert.equal(snap.sessionBranch, 'feat/A');

  // and the rendered handoff reports feat/A + ⚠ tree trocado, NEVER feat/B
  const row = { id: 'a', fullId: 'a', name: 'A', turns: 4, branch: 'feat/B', cwd: '/repo' };
  const txt = x.generateHandoff(row, { lastAssistantText: '—' }, {
    now: NOW, snapshot: snap,
    sessionGit: { source: 'journal', branch: 'feat/A', sha: 'aaaaaaabbbb', diverged: true },
  });
  assert.ok(/feat\/A @aaaaaaa/.test(txt), 'BASE names the SESSION branch feat/A');
  assert.ok(/⚠ tree trocado/.test(txt), 'crossing is surfaced');
  assert.ok(!/feat\/B/.test(txt), 'NEVER reports the swapped tree branch');
});

test('worktree-crossing: no journal (uncertain) → HEAD/BASE = n/d (sem journal), never a tree value', () => {
  const row = { id: 'a', fullId: 'a', name: 'A', turns: 4, branch: 'feat/overclock', cwd: '/repo' };
  // snapshot from the shared tree (what the live cwd HEAD says) — must NOT leak into the fields
  const snap = { head: { sha7: 'deadbee', subject: 'overclock' }, baseAhead: 9, pushed: false };
  const txt = x.generateHandoff(row, { lastAssistantText: '—' }, {
    now: NOW, snapshot: snap,
    sessionGit: { source: 'tree', branch: 'feat/overclock', uncertain: true },
  });
  assert.ok(/HEAD:\s+n\/d \(sem journal\)/.test(txt), 'HEAD is n/d, not the tree sha deadbee');
  assert.ok(!/deadbee/.test(txt), 'the shared-tree HEAD never appears');
  assert.ok(!/main\+9/.test(txt), 'the shared-tree ahead count never appears');
  assert.ok(/branch incerto/.test(txt), 'branch flagged uncertain');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ANTI-BUG-2 — CONTAGEM COERENTE: one source (origin/main..<branch>), never @{u}=0 next to main+5.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('contagem coerente: branch sem upstream, 5 ahead of main → BOARD flag UNPUSHED + sessão main+5 (nunca 0 vs 5)', () => {
  // The exact BUG-2: gitStage.ahead is 0 (the @{u} bug: no upstream → 0-false), while the branch is
  // genuinely 5 ahead of origin/main. Old code flagged "0 UNPUSHED · projecto limpo" next to a "main+5"
  // per-session GATE. Now BOTH views hang off the SAME source (origin/main..<branch> = 5).
  const sg = { source: 'journal', branch: 'feat/x', sha: 'abc1234def0', uncertain: false, diverged: false, aheadOfMain: 5 };
  const rows = [{ id: 's', fullId: 's', name: 'work', cwd: '/repo', branch: 'feat/x', gitStage: { dirty: 0, ahead: 0 }, sessionGit: sg }];
  const proj = x.generateProjectHandoff('P', rows, { now: NOW });
  const row = proj.split('\n').find((l) => l.includes('(s)'));
  assert.ok(row && /UNPUSHED/.test(row), 'the session row IS flagged UNPUSHED (not missed via @{u}=0)');
  assert.ok(!/0 UNPUSHED/.test(proj), 'FLAGS never says "0 UNPUSHED" while the branch is 5 ahead of main');
  assert.ok(!/projecto limpo/.test(proj), 'never "projecto limpo" with 5 real commits unpushed');
  // and the per-session GATE agrees: main+5 (same origin/main..feat/x source), never main±0
  const sess = x.generateHandoff({ id: 's', fullId: 's', name: 'work', turns: 4, branch: 'feat/x', cwd: '/repo' },
    { lastAssistantText: '—' }, { now: NOW, snapshot: { baseAhead: 5, head: { sha7: 'abc1234' }, pushed: false }, sessionGit: sg });
  assert.ok(/main\+5/.test(sess), 'per-session BASE shows main+5 — coherent with the BOARD flag');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 0-COMMITS: a branch @ origin/main → STATE empty, NEVER ✅ "feito".
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('0-commits: per-session STATE = empty (0 commits), never landed/✅', () => {
  const row = { id: 'z', fullId: 'z', name: 'zero', turns: 3, branch: 'chore/budget', cwd: '/repo', gitStage: { dirty: 0 } };
  const txt = x.generateHandoff(row, { lastAssistantText: '—' }, {
    now: NOW, perfect: true, snapshot: { baseAhead: 0, pushed: false, head: null },
    sessionGit: { source: 'journal', branch: 'chore/budget', sha: '5b8cd29aaaa', uncertain: false, diverged: false, aheadOfMain: 0 },
  });
  assert.ok(/STATE:\s+⚪ empty/.test(txt), 'STATE is empty for 0 commits');
  assert.ok(!/✅ landed/.test(txt), 'never claims landed for a 0-commit branch');
  assert.equal(x._deriveState(row, { baseAhead: 0 }, { stopped: false }, {}), 'empty');
});

test('0-commits: BOARD row measured at 0 ahead is marked "0 commits", never a bare ✅', () => {
  const rows = [{
    id: 'z', fullId: 'z', name: 'zero', cwd: '/repo', branch: 'chore/budget', gitStage: { dirty: 0, ahead: 0 },
    sessionGit: { source: 'journal', branch: 'chore/budget', sha: 'abc', uncertain: false, diverged: false, aheadOfMain: 0 },
  }];
  const txt = x.generateProjectHandoff('P', rows, { now: NOW });
  const line = txt.split('\n').find((l) => l.includes('(z)'));
  assert.ok(line && /0 commits \(nada salvo\)/.test(line), 'the idle 0-commit row is honestly marked');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// "POR ATERRAR" HONESTO: a branch already in main (aheadOfMain 0) is excluded from the push count.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('por-aterrar honesto: 1 branch já-em-main + 1 real → NEXT conta 1, não 2', () => {
  const rows = [{ id: 'a', fullId: 'a', name: 'A', cwd: '/r', branch: 'main', gitStage: { dirty: 0, ahead: 0 } }];
  const branches = [
    { branch: 'feat/already-merged', sha: 'mmmmmmm0abcd', unpushed: 4, aheadOfMain: 0, worktree: 'wt-merged' }, // content já em main
    { branch: 'feat/real-parked',   sha: 'rrrrrrr0abcd', unpushed: 3, aheadOfMain: 3, worktree: 'wt-real' },     // genuinamente por aterrar
  ];
  const txt = x.generateProjectHandoff('P', rows, { branches, now: NOW });
  assert.ok(/push 1 branch parked/.test(txt), 'counts ONLY the branch genuinely absent from main');
  assert.ok(!/push 2 branch/.test(txt), 'never counts the already-merged branch');
  assert.ok(!/feat\/already-merged/.test(txt), 'the merged branch is not listed as parked');
  assert.ok(/feat\/real-parked @rrrrrrr/.test(txt), 'the real parked branch IS listed');
  assert.ok(/3 UNPUSHED/.test(txt) && !/7 UNPUSHED/.test(txt), 'unpushed sums only real parked commits (3, not 3+4)');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ANTI-PRINT: a parked session's handoff carries branch+sha+unpushed+gate+work — no n/d where data exists.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('anti-print: a fully-known parked session has no n/d where there was data (Cowork acts sem print)', () => {
  const row = { id: 'p', fullId: 'p', name: 'parked work', turns: 20, branch: 'feat/doctor', cwd: '/repo',
    model: 'opus', gitStage: { dirty: 0 } };
  const snap = { head: { sha7: '21556dc', subject: 'doctor self-heal' }, baseAhead: 12, baseBehind: 0,
    pushed: false, classifyFrozen: true, filesInHead: ['doctor.js', 'checks.js'], filesCount: 2, factsComplete: true };
  const txt = x.generateHandoff(row, { lastAssistantText: 'gate verde, pronto a mergear' }, {
    now: NOW, mode: 'full', perfect: true, snapshot: snap,
    sessionGit: { source: 'journal', branch: 'feat/doctor', sha: '21556dcaaaa', uncertain: false, diverged: false, aheadOfMain: 12 },
    ledgerEvents: [{ kind: 'outcome', output: { nodeCheck: true, tests: '389/389', sha: true, vsix: true } }],
  });
  assert.ok(/feat\/doctor @21556dc/.test(txt), 'branch + sha present');
  assert.ok(/main\+12/.test(txt), 'unpushed position present');
  assert.ok(/local \(no push\)/.test(txt), 'push status present');
  assert.ok(/tests 389\/389/.test(txt) && /node --check ✓/.test(txt), 'mechanical GATE from the ledger outcome');
  assert.ok(/STATE:\s+🟡 parked/.test(txt), 'STATE parked');
  assert.ok(!/n\/d/.test(txt), 'NO n/d anywhere — every field had data, so no print is needed');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AMBIENTE vs TRABALHO: shared-tree dirt (159) is AMBIENTE, never "159 por guardar" in the human summary.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('ambiente vs trabalho: 159 dirty num tree partilhado → AMBIENTE, nunca "159 por guardar"', () => {
  const rows = [];
  for (let i = 0; i < 3; i++) rows.push({ id: 'c' + i, fullId: 'c' + i, name: 'sess ' + i, cwd: '/home/p/frugal', branch: 'main', gitStage: { dirty: 159, ahead: 0 } });
  const txt = x.generateProjectHandoff('P', rows, { now: NOW });
  assert.ok(/▸ AMBIENTE:.*159 dirty/.test(txt), 'the shared dirt is reported once as AMBIENTE');
  assert.ok(!/159 por commitar/.test(txt), 'human OVERALL never says "159 por commitar"');
  assert.ok(!/159 UNCOMMITTED/.test(txt), 'FLAGS never says "159 UNCOMMITTED"');
  assert.ok(/0 UNCOMMITTED/.test(txt), 'own uncommitted is 0 (shared dirt is ambient, not own work)');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PENDING-COMPLETO (FASE 3.3): awaiting-you → the WHOLE question + ALL options verbatim, never ≤300c.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('PENDING-completo: an open AskUserQuestion captures the full question + all options verbatim', () => {
  const longQ = 'Qual abordagem preferes para o allocator do overclock, considerando que o objectivo e maximizar throughput local sem estourar a RAM da GPU e mantendo o custo em zero para tarefas T0 e T1 que sao a maioria do trabalho diario do Paulo?';
  const tail = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
      { type: 'text', text: 'Preciso da tua decisão:' },
      { type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ question: longQ, options: [
        { label: 'A) greedy por VRAM livre', description: '...' },
        { label: 'B) round-robin fixo', description: '...' },
        { label: 'C) híbrido adaptativo', description: '...' },
      ] }] } },
    ] } }),
  ];
  const p = x.extractPending(tail);
  assert.equal(p.endsWithAsk, true);
  assert.ok(p.ask && p.ask.questions[0].question.length > 200, 'the full question is captured (not ≤300c summary path)');
  const row = { id: 'q', fullId: 'q', name: 'Q', turns: 5, branch: 'feat/overclock', cwd: '/repo' };
  const txt = x.generateHandoff(row, p, { now: NOW, perfect: true, snapshot: { baseAhead: 1, head: { sha7: 'aaa' } },
    sessionGit: { source: 'journal', branch: 'feat/overclock', sha: 'aaabbbcccddd', aheadOfMain: 1 } });
  assert.ok(txt.includes(longQ), 'the WHOLE question is in the handoff verbatim');
  assert.ok(/opções: 1\)A\) greedy/.test(txt), 'all options rendered verbatim');
  assert.ok(/C\) híbrido adaptativo/.test(txt), 'the third option is present');
  assert.ok(/STATE:\s+🔵 awaiting-you/.test(txt), 'STATE awaiting-you');
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LEDGER PROJECTION (FASE 4): intent → INTENT, decision → DECISIONS, outcome → mechanical GATE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
test('ledger projection: intent/decision/outcome → INTENT/DECISIONS/GATE (pure)', () => {
  const events = [
    { kind: 'intent', output: { goal: 'tornar o handoff mecanicamente verdadeiro' } },
    { kind: 'decision', output: { question: 'gate em perfect mode?', chosen: 'opt-in via opts.perfect', why: 'back-compat byte-stable' } },
    { kind: 'outcome', output: { nodeCheck: true, tests: '405/405', sha: true, vsix: false } },
  ];
  const v = x._projectLedger(events);
  assert.equal(v.intent, 'tornar o handoff mecanicamente verdadeiro');
  assert.equal(v.decisions.length, 1);
  assert.equal(v.decisions[0].chosen, 'opt-in via opts.perfect');
  const gate = x._ledgerGateLine(v.outcome);
  assert.ok(/node --check ✓/.test(gate) && /tests 405\/405/.test(gate) && /classify.js sha ✓/.test(gate) && /vsix ✗/.test(gate));
  // and it renders in the handoff
  const row = { id: 'l', fullId: 'l', name: 'L', turns: 6, branch: 'feat/perfect-handoff-v2', cwd: '/repo' };
  const txt = x.generateHandoff(row, { lastAssistantText: '—' }, { now: NOW, perfect: true,
    snapshot: { baseAhead: 2, head: { sha7: 'aaa' } },
    sessionGit: { source: 'journal', branch: 'feat/perfect-handoff-v2', sha: 'aaabbb', aheadOfMain: 2 },
    ledgerEvents: events });
  assert.ok(/INTENT: tornar o handoff/.test(txt), 'INTENT projected');
  assert.ok(/DECISIONS:/.test(txt) && /gate em perfect mode/.test(txt), 'DECISIONS projected');
  assert.ok(/GATE✓:.*tests 405\/405/.test(txt), 'mechanical GATE line projected');
});

test('sessionLedgerEvents reads only kind-bearing entries from the journal (ignores turn snippets)', () => {
  fs.writeFileSync(path.join(HOFF, 'sess-led.jsonl'),
    JSON.stringify({ ts: 't1', assistant_snippet: 'noise', tools: [], n_turn: 1 }) + '\n' +
    JSON.stringify({ ts: 't2', kind: 'intent', output: { goal: 'X' } }) + '\n' +
    JSON.stringify({ ts: 't3', kind: 'outcome', output: { tests: '1/1' } }) + '\n');
  const evs = x.sessionLedgerEvents('sess-led');
  assert.equal(evs.length, 2, 'only the 2 kind-bearing events, not the turn snippet');
  assert.equal(evs[0].kind, 'intent');
  const v = x._projectLedger(evs);
  assert.equal(v.intent, 'X');
});

// ── back-compat guard: legacy generateHandoff (no perfect) stays byte-stable at the head ──────────
test('back-compat: no perfect → title first, no STATE/PARA TI/TL;DR lines', () => {
  const txt = x.generateHandoff({ id: 'a', fullId: 'a', name: 'A', turns: 3, branch: 'main', cwd: '/r' },
    { lastAssistantText: 'q?' }, { now: NOW, snapshot: {} });
  assert.ok(txt.startsWith('⇄ MOO HANDOFF'), 'title still first');
  assert.ok(!/STATE:/.test(txt) && !/PARA TI/.test(txt) && !/TL;DR/.test(txt), 'no perfect-only lines in legacy mode');
  assert.ok(/DOING:  /.test(txt), 'legacy DOING label preserved');
});
