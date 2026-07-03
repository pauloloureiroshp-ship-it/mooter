// moo-loop.test.js — the mechanical contract of Moo Loop Sessions. Deterministic,
// offline, no LLM. Tests the invariants that make a typed masterprompt honest:
//   · a loop WITHOUT stop-conditions is rejected
//   · the mode header declares what the session is (never unsure)
//   · the 5 declarations are present in a loop masterprompt
//   · STOP evaluation fires on goal/iter/budget/no-progress in the right order
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const ML = require('./moo-loop.js');

test('MODES exposes the 3 session modes with the 2 new buttons', () => {
  assert.deepStrictEqual(Object.keys(ML.MODES).sort(), ['loop', 'once', 'schedule']);
  assert.strictEqual(ML.MODES.loop.button, 'New Claude Code Moo Loop Session');
  assert.strictEqual(ML.MODES.schedule.button, 'New Claude Code Moo Schedule Session');
  assert.strictEqual(ML.MODES.once.needsContract, false);
  assert.strictEqual(ML.MODES.loop.needsContract, true);
});

test('validateLoopContract REJECTS a loop with no stop-conditions', () => {
  const r = ML.validateLoopContract({
    mode: 'loop', task: 'x', check: 'c', action: 'a', escalate: 'e',
    trigger: { kind: 'heartbeat' }, stop: {},
  });
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => /STOP sem condições reais|REJEITADO/.test(e)),
    'must reject a loop without stop-conditions');
});

test('validateLoopContract accepts a loop with at least one real stop', () => {
  const r = ML.validateLoopContract({
    mode: 'loop', task: 'melhora o routing', check: 'misroutes no Ledger',
    action: 'propõe patch host-side', escalate: 'push → humano',
    trigger: { kind: 'heartbeat', detail: 'VRAM ociosa' },
    stop: { maxIterations: 3 },
  });
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.errors.length, 0);
});

test('validateLoopContract flags each missing declaration', () => {
  const r = ML.validateLoopContract({ mode: 'loop', task: '', stop: { maxIterations: 1 } });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /task/.test(e)));
  assert.ok(r.errors.some((e) => /CHECK/.test(e)));
  assert.ok(r.errors.some((e) => /ACTION/.test(e)));
  assert.ok(r.errors.some((e) => /ESCALATE/.test(e)));
});

test('a budget-only stop counts as a real stop (gpuMin OR usd)', () => {
  assert.ok(ML.hasRealStop({ budget: { gpuMin: 30 } }));
  assert.ok(ML.hasRealStop({ budget: { usd: 1.5 } }));
  assert.ok(ML.hasRealStop({ noProgressCycles: 2 }));
  assert.ok(ML.hasRealStop({ goal: 'green tests' }));
  assert.ok(!ML.hasRealStop({ budget: { gpuMin: 0, usd: 0 }, maxIterations: 0, noProgressCycles: 0, goal: '' }));
});

test('once mode needs only a task (no contract required)', () => {
  assert.strictEqual(ML.validateLoopContract({ mode: 'once', task: 'muda a cor do botão' }).ok, true);
  assert.strictEqual(ML.validateLoopContract({ mode: 'once', task: '' }).ok, false);
});

test('schedule cron without a schedule detail is rejected', () => {
  const r = ML.validateLoopContract({
    mode: 'schedule', task: 't', check: 'c', action: 'a', escalate: 'e',
    trigger: { kind: 'cron', detail: '' }, stop: { maxIterations: 1 },
  });
  assert.ok(!r.ok);
  assert.ok(r.errors.some((e) => /cron sem horário/.test(e)));
});

test('buildModeHeader declares the mode at the head (session is never unsure)', () => {
  const h = ML.buildModeHeader({ mode: 'loop', task: 't', stop: { maxIterations: 3 } });
  assert.match(h, /MOO LOOP SESSION · modo=loop/);
  assert.match(h, /Lê este cabeçalho ANTES de agir/);
  assert.match(h, /STOP:/);
  assert.match(h, /classify\.js FROZEN/);
  assert.match(h, /fricção assimétrica/);
});

test('once header shows task-end stop, not loop stop-conditions', () => {
  const h = ML.buildModeHeader({ mode: 'once', task: 't' });
  assert.match(h, /MOO ONCE SESSION · modo=once/);
  assert.match(h, /fim da tarefa/);
});

test('buildMasterprompt embeds the 5 loop declarations verbatim', () => {
  const mp = ML.buildMasterprompt(ML.defaultSpec('loop', 'melhora o pilar Routing'));
  for (const decl of ['TRIGGER:', 'CHECK:', 'ACTION:', 'STOP:', 'ESCALATE:']) {
    assert.ok(mp.includes(decl), 'masterprompt must declare ' + decl);
  }
  assert.match(mp, /melhora o pilar Routing/);
  assert.match(mp, /Perfect Handoff/);
  assert.match(mp, /sem push sem OK/);
});

test('defaultSpec produces a VALID loop and schedule spec', () => {
  assert.ok(ML.validateLoopContract(ML.defaultSpec('loop', 'x')).ok);
  assert.ok(ML.validateLoopContract(ML.defaultSpec('schedule', 'x')).ok);
  assert.ok(ML.validateLoopContract(ML.defaultSpec('once', 'x')).ok);
});

test('parseStatusBlock extracts DID/TESTS/BLOCKERS/NEXT/DONE', () => {
  const txt = 'blah\n```status\nDID: fixed the parser\nTESTS: 12/12 pass\nBLOCKERS: none\nNEXT: continue\nDONE: no\n```\ntail';
  const s = ML.parseStatusBlock(txt);
  assert.strictEqual(s.found, true);
  assert.strictEqual(s.did, 'fixed the parser');
  assert.strictEqual(s.tests, '12/12 pass');
  assert.strictEqual(s.next, 'continue');
  assert.strictEqual(s.done, false);
});

test('parseStatusBlock reads DONE: yes as done', () => {
  assert.strictEqual(ML.parseStatusBlock('```status\nDONE: yes\n```').done, true);
  assert.strictEqual(ML.parseStatusBlock('```status\nDONE: sim\n```').done, true);
  assert.strictEqual(ML.parseStatusBlock('no status here').found, false);
});

test('evaluateStop: goal beats everything', () => {
  const spec = ML.defaultSpec('loop', 'x');
  const r = ML.evaluateStop(spec, { iteration: 1, goalMet: true });
  assert.ok(r.stop);
  assert.match(r.reason, /goal-achievement/);
});

test('evaluateStop: max-iterations fires at the cap', () => {
  const spec = { mode: 'loop', task: 'x', check: 'c', action: 'a', escalate: 'e', trigger: { kind: 'heartbeat' }, stop: { maxIterations: 3 } };
  assert.strictEqual(ML.evaluateStop(spec, { iteration: 2 }).stop, false);
  assert.strictEqual(ML.evaluateStop(spec, { iteration: 3 }).stop, true);
  assert.match(ML.evaluateStop(spec, { iteration: 3 }).reason, /max-iterations/);
});

test('evaluateStop: no-progress hibernates', () => {
  const spec = { mode: 'loop', task: 'x', check: 'c', action: 'a', escalate: 'e', trigger: { kind: 'heartbeat' }, stop: { noProgressCycles: 2 } };
  assert.strictEqual(ML.evaluateStop(spec, { iteration: 5, noProgressStreak: 1 }).stop, false);
  assert.match(ML.evaluateStop(spec, { iteration: 5, noProgressStreak: 2 }).reason, /no-progress/);
});

test('evaluateStop: GPU-min budget and escalate both stop', () => {
  const spec = { mode: 'loop', task: 'x', check: 'c', action: 'a', escalate: 'e', trigger: { kind: 'heartbeat' }, stop: { budget: { gpuMin: 60 } } };
  assert.match(ML.evaluateStop(spec, { iteration: 1, gpuMinUsed: 60 }).reason, /budget GPU-min/);
  assert.match(ML.evaluateStop(spec, { iteration: 1, escalated: true }).reason, /escalate/);
});

test('normalizeSpec never fabricates a stop and clamps junk', () => {
  const s = ML.normalizeSpec({ mode: 'loop', stop: { maxIterations: -5, budget: { usd: 'abc' } } });
  assert.strictEqual(s.stop.maxIterations, 0);
  assert.strictEqual(s.stop.budget.usd, 0);
  assert.strictEqual(ML.hasRealStop(s.stop), false);
  assert.strictEqual(s.mooMode, 'moo');
});
