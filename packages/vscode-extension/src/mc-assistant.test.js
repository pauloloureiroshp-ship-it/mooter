'use strict';
// mc-assistant.test.js — Frente 0 · Foundation.
// Proves the local Moo assistant is SCOPED and HONEST: its prompt carries the strict
// guardrails + ONLY snapshot-derived context (never out-of-snapshot data), it streams via
// onChunk (handoff-stream pattern), and it fails soft with no backend.

const { test } = require('node:test');
const assert = require('node:assert');

const a = require('./mc-assistant.js');

const SNAP = {
  at: 1, project: 'frugal-front-0', device: { os: 'win32', id: 'd1' },
  totals: { savedToday: 0.3, needYou: 0, pushPending: 1 },
  loops: [], gpu: { totalMb: 24000, freeMb: 20000, fitsMoos: 3 }, remote: null, sync: null,
  scope: { projects: [{ name: 'frugal', status: 'active', sessions: 1 }], architecture: [] },
  sessions: [
    { sid: 'sess-1', name: 'MC Foundation', topic: 'snapshot', model: 'claude-opus-4-8', tier: 'T3',
      status: 'working', needsYou: false, tokIn: 1200, tokOut: 800, ctxPct: 50, cost: 0.12, saved: 0.3,
      git: { branch: 'feat/mc-foundation', sha: 'abc1234', pushNeeded: true }, sync: { notion: null, obsidian: null },
      worktree: 'frugal-front-0' },
  ],
};

test('buildMooPrompt embeds the strict guardrails (snapshot-only, refuse-when-absent, never-invent)', () => {
  const p = a.buildMooPrompt('quantas sessões precisam de mim?', SNAP);
  assert.ok(p.includes('ÚNICA fonte de verdade'));
  assert.ok(p.includes('NUNCA inventes'));
  assert.ok(/Não sei/i.test(p));
  assert.ok(p.includes('SNAPSHOT (única fonte de verdade)'));
});

test('buildMooPrompt includes the question and the snapshot data', () => {
  const p = a.buildMooPrompt('o que falta em push?', SNAP);
  assert.ok(p.includes('o que falta em push?'));
  assert.ok(p.includes('frugal-front-0')); // project from snapshot
  assert.ok(p.includes('feat/mc-foundation')); // session git branch from snapshot
});

test('SCOPING: the prompt contains NO data that is not in the snapshot', () => {
  // A value that exists nowhere in the snapshot must not appear in the prompt — the model
  // only ever sees snapshot-derived context (+ fixed system text + the user question).
  const p = a.buildMooPrompt('estado?', SNAP);
  assert.ok(!p.includes('SUPER_SECRET_TOKEN'));
  assert.ok(!p.includes('main branch')); // we never inject the working-tree branch label
});

test('_contextFor caps the session list and reports the truncation honestly', () => {
  const many = { sessions: [] };
  for (let i = 0; i < 40; i++) many.sessions.push({ sid: 's' + i, name: 'n' + i });
  const ctx = a._contextFor(many, 10);
  assert.equal(ctx.sessions.length, 10);
  assert.equal(ctx.sessionsTruncated, 30);
});

test('askMoo refuses an empty question without calling the backend', async () => {
  let called = false;
  const res = await a.askMoo('   ', SNAP, { generate: () => { called = true; } });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'empty');
  assert.equal(called, false);
});

test('askMoo streams chunks via onChunk and returns the concatenated text + model', async () => {
  const chunks = [];
  const fakeGenerate = async (model, prompt, opts) => {
    assert.ok(prompt.includes('SNAPSHOT')); // got the scoped prompt
    opts.onChunk('Há ');
    opts.onChunk('1 sessão ');
    opts.onChunk('a trabalhar.');
    return { ok: true, text: 'Há 1 sessão a trabalhar.' };
  };
  const res = await a.askMoo('quantas sessões a trabalhar?', SNAP, {
    generate: fakeGenerate, model: 'qwen3:30b',
    onChunk: (c) => chunks.push(c),
  });
  assert.equal(res.ok, true);
  assert.equal(res.text, 'Há 1 sessão a trabalhar.');
  assert.equal(res.model, 'qwen3:30b');
  assert.equal(chunks.join(''), 'Há 1 sessão a trabalhar.');
});

test('askMoo picks a local model via pickLocalGenModel when none pinned', async () => {
  let usedModel = null;
  const extra = { pickLocalGenModel: async () => 'gemma3:12b' };
  const fakeGenerate = async (model) => { usedModel = model; return { ok: true, text: 'ok' }; };
  const res = await a.askMoo('?', SNAP, { extra, generate: fakeGenerate });
  assert.equal(usedModel, 'gemma3:12b');
  assert.equal(res.model, 'gemma3:12b');
});

test('askMoo fails soft when there is no backend', async () => {
  const res = await a.askMoo('?', SNAP, { extra: {}, generate: null });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no-backend');
});

test('askMoo tolerates a throwing backend (no crash, ok:false)', async () => {
  const res = await a.askMoo('?', SNAP, { generate: async () => { throw new Error('ollama down'); } });
  assert.equal(res.ok, false);
  assert.equal(res.text, '');
});
