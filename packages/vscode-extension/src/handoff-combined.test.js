// handoff-combined.test.js — Frente F · Handoff COMBINADO (sessão + projecto), NOTA editável no
// topo, e worktree-guard. The legacy generateHandoff output stays BYTE-STABLE unless the new opts
// (note / expectedCwd) are passed — these are all opt-in, so the existing v3 handoff tests are
// untouched. Pure functions, no I/O, no Ollama.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

const x = require('./host-extra.js');

const ROW = { id: 'h1', name: 'wiring the sync bridge', branch: 'feat/sync-handoff-bridge', turns: 3 };
const PEND = { lastAssistantText: 'continuo?', lastToolActions: [], stopped: true };
const NOW = new Date('2026-06-28T10:00:00');

// ── NOTA header (opt-in, editable) ─────────────────────────────────────

test('NOTA: opts.note === true prepends the editable placeholder header', () => {
  const txt = x.generateHandoff(ROW, PEND, { now: NOW, note: true });
  assert.equal(txt.split('\n')[0], '▸ NOTA PARA O COWORK: ____');
  assert.ok(txt.split('\n')[1].startsWith('⇄ MOO HANDOFF'), 'title follows the note line');
});

test('NOTA: a string note becomes the header text (trimmed, capped)', () => {
  const txt = x.generateHandoff(ROW, PEND, { now: NOW, note: '  verifica o gate antes de mergear  ' });
  assert.equal(txt.split('\n')[0], '▸ NOTA PARA O COWORK: verifica o gate antes de mergear');
});

test('NOTA: absent note → NO header (legacy output byte-stable, title is line 1)', () => {
  const txt = x.generateHandoff(ROW, PEND, { now: NOW });
  assert.ok(txt.startsWith('⇄ MOO HANDOFF'), 'no NOTA line when note is absent');
  assert.ok(!txt.includes('NOTA PARA O COWORK'));
});

// ── _outsideWorktree (pure) ────────────────────────────────────────────

test('_outsideWorktree: nested cwd and equal cwd are INSIDE (false)', () => {
  const wt = path.join(os.tmpdir(), 'wtA');
  assert.equal(x._outsideWorktree(path.join(wt, 'src'), wt), false);
  assert.equal(x._outsideWorktree(wt, wt), false);
});

test('_outsideWorktree: a sibling/foreign cwd is OUTSIDE (true)', () => {
  const wt = path.join(os.tmpdir(), 'wtA');
  const other = path.join(os.tmpdir(), 'wtB');
  assert.equal(x._outsideWorktree(other, wt), true);
});

test('_outsideWorktree: missing input → false (no false alarm), never throws', () => {
  assert.equal(x._outsideWorktree(null, '/x'), false);
  assert.equal(x._outsideWorktree('/x', null), false);
  assert.doesNotThrow(() => x._outsideWorktree(123, {}));
});

// ── Worktree guard inside the handoff ──────────────────────────────────

test('GUARD: cwd outside the expected worktree → prominent ⚠ WORKTREE line after the title', () => {
  const wt = path.join(os.tmpdir(), 'frugal-front-F');
  const drifted = path.join(os.tmpdir(), 'frugal'); // main repo, NOT the worktree
  const txt = x.generateHandoff(
    { ...ROW, cwd: drifted, worktreePath: wt }, PEND, { now: NOW });
  const lines = txt.split('\n');
  assert.ok(lines[0].startsWith('⇄ MOO HANDOFF'));
  assert.ok(lines[1].startsWith('⚠ WORKTREE:'), 'guard sits right under the title');
  assert.ok(lines[1].includes('frugal-front-F'), 'names the expected worktree');
});

test('GUARD: cwd inside the worktree → NO guard line', () => {
  const wt = path.join(os.tmpdir(), 'frugal-front-F');
  const txt = x.generateHandoff(
    { ...ROW, cwd: path.join(wt, 'packages'), worktreePath: wt }, PEND, { now: NOW });
  assert.ok(!txt.includes('⚠ WORKTREE:'));
});

test('GUARD: no expected worktree known → NO guard line (back-compat)', () => {
  const txt = x.generateHandoff({ ...ROW, cwd: '/anywhere' }, PEND, { now: NOW });
  assert.ok(!txt.includes('⚠ WORKTREE:'));
});

test('GUARD: opts.expectedCwd overrides and fires the guard', () => {
  const txt = x.generateHandoff(
    { ...ROW, cwd: path.join(os.tmpdir(), 'elsewhere') }, PEND,
    { now: NOW, expectedCwd: path.join(os.tmpdir(), 'frugal-front-F') });
  assert.ok(txt.includes('⚠ WORKTREE:'));
});

// ── Combined handoff (sessão + projecto) ───────────────────────────────

function projectRows() {
  return [
    { id: 's1', name: 'sync bridge', branch: 'feat/sync-handoff-bridge', model: 'opus', working: true, gitStage: { dirty: 0, ahead: 2 }, pr: null },
    { id: 's2', name: 'arch tree', branch: 'feat/cockpit-arch-tree', model: 'sonnet', needsYou: false, gitStage: { dirty: 1, ahead: 0 } },
  ];
}

test('COMBINED: contains the session handoff AND the project board, with the divider', () => {
  const txt = x.generateCombinedHandoff(ROW, PEND, {
    now: NOW, project: { proj: 'Mooter.ai', rows: projectRows() },
  });
  assert.ok(txt.includes('⇄ MOO HANDOFF'), 'session part present');
  assert.ok(txt.includes('── PROJECTO (estado das outras frentes) ──'), 'divider present');
  assert.ok(txt.includes('▸ BOARD:'), 'project board present');
  assert.ok(txt.includes('feat/cockpit-arch-tree'), 'other front listed');
});

test('COMBINED: defaults to the editable NOTA header at the very top', () => {
  const txt = x.generateCombinedHandoff(ROW, PEND, { now: NOW, project: { proj: 'P', rows: projectRows() } });
  assert.equal(txt.split('\n')[0], '▸ NOTA PARA O COWORK: ____');
});

test('COMBINED: a custom note is honoured over the default', () => {
  const txt = x.generateCombinedHandoff(ROW, PEND, { now: NOW, note: 'olha o DUP', project: { proj: 'P', rows: projectRows() } });
  assert.equal(txt.split('\n')[0], '▸ NOTA PARA O COWORK: olha o DUP');
});

test('COMBINED: worktree guard flows through into the combined text', () => {
  const wt = path.join(os.tmpdir(), 'frugal-front-F');
  const txt = x.generateCombinedHandoff(
    { ...ROW, cwd: path.join(os.tmpdir(), 'frugal'), worktreePath: wt }, PEND,
    { now: NOW, project: { proj: 'P', rows: projectRows() } });
  assert.ok(txt.includes('⚠ WORKTREE:'));
});

test('COMBINED: no project rows → just the session handoff (honest, no empty board)', () => {
  const txt = x.generateCombinedHandoff(ROW, PEND, { now: NOW, project: { proj: 'P', rows: [] } });
  assert.ok(txt.includes('⇄ MOO HANDOFF'));
  assert.ok(!txt.includes('── PROJECTO'));
});

test('COMBINED: never throws on null inputs', () => {
  assert.doesNotThrow(() => x.generateCombinedHandoff(null, null, null));
  assert.equal(typeof x.generateCombinedHandoff(null, null, {}), 'string');
});
